import { S3Client } from '@aws-sdk/client-s3';
import { join, normalize } from 'node:path';
import { open } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFromBucket } from './s3.js';
import { walkDirectory } from './hash.js';
import { CompareType, ComparedItem, compareS3 } from './compare-s3.js';
import { IMigrateMetadata } from './metadata.interface';
import minimist from 'minimist';
import { SyncOperator, SyncResultType } from './sync-operator.js';
import { catchError, firstValueFrom, forkJoin, map, of, reduce } from 'rxjs';
import { MigrateProgressBars } from './progress-bars.js';
import { IEnv, getEnvironment } from './env.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRootPath = normalize(join(__dirname, '../'));

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}

async function main() {

  const {
    execute: argExecute,
    concurrency: argConcurrency,
    force: argForce,
  } = minimist(process.argv.slice(2));

  const env = await getEnvironment(join(repoRootPath, './scripts/.env.json'));
  const client = await getClient(env);

  const bucketContents = await readFromBucket(env.bucket, client);

  const basePathAbs = normalize(join(__dirname, env.copySourceDirectory));
  const walkIter = walkDirectory(
    basePathAbs,
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

  const metadatas = await getMetadata();
  console.group('Metadatas:');
  console.info(JSON.stringify(metadatas, undefined, 2));


  if (!argExecute) {
    console.warn('Missing --execute, stopping.');
    return;
  }

  let concurrency = 4;
  if (argConcurrency !== undefined) {
    concurrency = argConcurrency;
    if (typeof concurrency !== 'number' || concurrency < 1) {
      throw new TypeError('argv concurrency must be a number > 1');
    }
  } else {
    console.warn('Missing --concurrency, defaulting to', concurrency);
  }

  if (argForce) {
    console.warn('--force provided; NoChange files will be uploaded');
  }
  const comparisonFilter: (kv: [key: string, value: ComparedItem]) => boolean = argForce
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
    basePathAbs,
    argForce,
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
      console.error('\n\n###########################')
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


async function getMetadata(): Promise<IMigrateMetadata> {
  const path = join(repoRootPath, 'scripts/metadata.json');
  const file = await open(path);

  const contents = await file.readFile({ encoding: 'utf8' });
  await file.close();

  return JSON.parse(contents);
}
