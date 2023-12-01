import { createHash } from 'node:crypto';
import { opendir, open, FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { getMimeType } from 'stream-mime-type';


export function getFileHash(fileStream: NodeJS.ReadableStream, algorithm: string) {
  return new Promise<string>((resolve, reject) => {
    const hasher = createHash(algorithm);

    fileStream.on('data', data => hasher.update(data));
    fileStream.on('end', () => {
      const digest = hasher.digest('hex');
      resolve(digest);
    })
    fileStream.on('error', reject);
  });
}

export async function getMimeAndHash(file: FileHandle, path: string, algorithm: string) {
  const fileStream = file.createReadStream();

  const { mime, stream } = await getMimeType(fileStream, {
    filename: path,
  });

  const hash = await getFileHash(stream, algorithm);

  return { mime, hash };
}

export enum WalkResultType {
  File = 1,
  Directory = 2,
}

export class WalkResult {
  constructor(
    /** Path relative to the base path */
    readonly key: string,
    readonly filename: string,
    readonly type: WalkResultType,
    readonly checksum: string,
    readonly mime: string,
    readonly size: number,
  ) { }
}


export interface IWalkOptions {
  readonly includeDirectories: boolean;
  readonly hashAlgorithm: string;
}

/**
 * Walk directory and subdirectories, depth-first (right?).
 *
 * Async-generates {@link WalkResult}s with keys relative to the base.
 */
export async function* walkDirectory(
  base: string,
  dirRelPath: string,
  options: IWalkOptions,
): AsyncGenerator<WalkResult, undefined, undefined> {

  for await (const dirEnt of await opendir(join(base, dirRelPath))) {
    const entryRelPath = join(dirRelPath, dirEnt.name);

    if (dirEnt.isFile()) {
      const fullPath = join(base, entryRelPath);
      const fileDescriptor = await open(fullPath);
      const stat = await fileDescriptor.stat();
      const { hash, mime } = await getMimeAndHash(fileDescriptor, fullPath, options.hashAlgorithm);
      await fileDescriptor.close();

      yield new WalkResult(
        entryRelPath,
        dirEnt.name,
        WalkResultType.File,
        hash,
        mime,
        stat.size,
      );
    } else if (dirEnt.isDirectory()) {
      if (options.includeDirectories) {
        yield new WalkResult(
          entryRelPath,
          dirEnt.name,
          WalkResultType.Directory,
          '',
          'inode/directory',
          0,
        );
      }

      yield* walkDirectory(
        base,
        entryRelPath,
        options
      );
    }
  }
}
