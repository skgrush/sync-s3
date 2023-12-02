#!/usr/bin/env node

import { S3Client } from '@aws-sdk/client-s3';
import { dirname, resolve, basename } from 'node:path';
import { open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readFromBucket } from './s3.js';
import { walkDirectory } from './hash.js';
import { CompareType, ComparedItem, compareS3 } from './compare-s3.js';
import { IMigrateMetadata } from './metadata.interface.js';
import minimist from 'minimist';
import { SyncOperator, SyncResultType } from './sync-operator.js';
import { catchError, firstValueFrom, forkJoin, map, of, reduce } from 'rxjs';
import { MigrateProgressBars } from './progress-bars.js';
import { IEnv, getEnvironment } from './env.js';
import c from 'ansi-colors';

const mainUrl = pathToFileURL(process.argv[1]).href;
if (import.meta.url === mainUrl || mainUrl.endsWith('/.bin/sync-s3')) {

  const {
    execute,
    concurrency,
    force,
    h,
    help,
    _: args,
    ...otherParams
  } = minimist(process.argv.slice(2));

  if (h || help) {
    printHelp();
    process.exit(127);
  }

  const otherOptionKeys = Object.keys(otherParams);
  if (otherOptionKeys.length) {
    console.error('CLI ERROR: Unexpected optional parameters', otherOptionKeys);
    process.exit(2);
  }

  const [envJsonPath, ...otherArgs] = args;
  if (!envJsonPath || otherArgs.length > 0) {
    console.error('CLI ERROR: Expects exactly one positional argument, the env.json path\n');
    process.exit(2);
  }

  void main(
    execute,
    concurrency,
    force,
    envJsonPath,
  );
}

function printHelp() {
  console.info(basename(process.argv[0]), process.argv[1], c.green('[-h|--help] [--execute] [--concurrency N] [--force]'), c.red('ENV-PATH'));
  console.info();
  console.info('Required positionals');
  console.info(' ', c.red('ENV-PATH'), 'path to env JSON compliant with env.schema.json');
  console.info();
  console.info('Options');
  console.info(' ', c.green('--execute'), 'Execute the operation (anti dry-run)');
  console.info(' ', c.green('--concurrency'), 'Number of parallel upload operations; default=4');
  console.info(' ', c.green('--force'), 'Force upload even if there is no change to the file');
  console.info(' ', c.green('-h|--help'), 'Print this help text and exit');
}

export async function main(
  execute: boolean,
  concurrency: number,
  force: boolean,
  envJsonPath: string,
) {
  const envDirectory = dirname(envJsonPath);

  const env = await getEnvironment(envJsonPath);
  const copySourceDirectory = resolve(envDirectory, env.copySourceDirectory);
  const metadataPath = resolve(envDirectory, env.metadataFile);

  const client = await getClient(env);

  const bucketContents = await readFromBucket(env.bucket, client);

  const walkIter = walkDirectory(
    copySourceDirectory,
    '',
    {
      hashAlgorithm: 'md5',
      includeDirectories: false,
    },
  );

  const allComparisons = await compareS3(bucketContents, walkIter);

  console.group('Comparisons:');
  for (const [key, val] of allComparisons) {
    console.info(key, ':', CompareType[val.type]);
  }
  console.groupEnd();

  const metadatas = await getMetadata(metadataPath);
  console.group('Metadatas:');
  console.info(JSON.stringify(metadatas, undefined, 2));


  if (!execute) {
    console.warn('Missing --execute, stopping.');
    return;
  }

  if (concurrency !== undefined) {
    if (typeof concurrency !== 'number' || concurrency < 1) {
      throw new TypeError('argv concurrency must be a number > 1');
    }
  } else {
    concurrency = 4;
    console.warn('Missing --concurrency, defaulting to', concurrency);
  }

  if (force) {
    console.warn('--force provided; NoChange files will be uploaded');
  }
  const comparisonFilter: (kv: [key: string, value: ComparedItem]) => boolean = force
    ? kv => true
    : ([k, v]) => v.type !== CompareType.NoChange;
  const todoComparisons = new Map([...allComparisons].filter(comparisonFilter));

  const totalSize = [...todoComparisons.values()].reduce((prev, curr) => prev + (curr.localObject?.size ?? 0), 0);

  const operators = Array(concurrency).fill(null).map((_, idx) => new SyncOperator(
    idx.toString(),
    todoComparisons,
    env.bucket,
    client,
    metadatas,
    copySourceDirectory,
    force,
  ));

  const progressBars = new MigrateProgressBars(
    todoComparisons.size,
    totalSize,
  );

  const run$s = operators.map(
    op => op.run$().pipe(
      progressBars.reportSyncResult(),
      map(result => result.type !== SyncResultType.Error),
      catchError(() => of(false)),
      // emit only at the end the cumulative success status
      reduce((previousSucceeded, thisSucceeded) => previousSucceeded && thisSucceeded, true),
    ),
  );

  const allSucceeded = await firstValueFrom(
    forkJoin(run$s).pipe(map(results => results.every(r => r))),
  );

  if (allSucceeded) {
    console.info('\nSuccess! All requests completed successfully.');
    return;
  }

  console.error('\n\nSomething went wrong!\n\n');
  for (const operator of operators) {
    for (const { item, error } of operator.getLatestErrors()) {
      console.error('\n\n###########################');
      console.error('Item:', item);
      console.error('Error:', error);
    }
  }
}

async function getClient(env: IEnv) {
  const {
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    }
  } = env;

  const client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return client;
}


async function getMetadata(path: string): Promise<IMigrateMetadata> {
  const file = await open(path);

  const contents = await file.readFile({ encoding: 'utf8' });
  await file.close();

  return JSON.parse(contents);
}
