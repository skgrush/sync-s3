import { DeleteObjectCommand, DeleteObjectCommandOutput, PutObjectCommand, PutObjectCommandOutput, S3Client } from "@aws-sdk/client-s3";
import { CompareType, ComparedItem } from "./compare-s3.js";
import { IMigrateMetadata, IMigrateObjectMetadata } from "./metadata.interface.js";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { concatAll, defer, from, map } from "rxjs";

export enum SyncResultType {
  Error = 0,
  Success = 1,
  Noop = 2,
}

export interface ISyncResult {
  readonly size: number;
  readonly type: SyncResultType;
}

export class SyncOperator {

  #runs = 0;
  #errors = new Map<ComparedItem, unknown[]>();

  get runCount() {
    return this.#runs;
  }
  get hasErrors() {
    return !!this.#errors.size;
  }

  constructor(
    readonly operatorId: string,
    readonly comparedItemMap: Map<string, ComparedItem>,
    readonly bucket: string,
    readonly client: S3Client,
    readonly metadata: IMigrateMetadata,
    readonly basePath: string,
    readonly force: boolean,
  ) { }

  *getLatestErrors() {
    for (const [item, errors] of this.#errors) {
      yield {
        item,
        error: errors[errors.length - 1],
      };
    }
  }

  run$() {
    return defer(() => {
      if (this.#runs) {
        console.error('Attempting to run operator', this.operatorId, 'again, rather than retry(); likely in error');
      }
      this.#runs++;

      // loop until there are no more comparedItemMap items
      return from(this.#runAsyncIterator());
    });
  }

  async *#runAsyncIterator() {
    while (true) {
      const keyIterResult = this.comparedItemMap.keys().next();
      if (keyIterResult.done) {
        // no more keys, we're done!
        break;
      }
      const key = keyIterResult.value;
      const item = this.comparedItemMap.get(key);
      if (!item || !this.comparedItemMap.delete(key)) {
        // the item isn't in the map or was deleted before we expected; continue
        continue;
      }

      // we have exclusive ownership of the item
      const result = await this.#executeTransfer(item);
      yield result;
    }
  }

  retry$() {
    return from(this.#errors.keys()).pipe(
      // for each item, construct an observable
      map(item => defer(async () => {
        const result = await this.#executeTransfer(item);
        if (result.type !== SyncResultType.Error) {
          this.#errors.delete(item);
        }
        return result;
      })
      ),
      concatAll(),
    );
  }

  async #executeTransfer(item: ComparedItem): Promise<ISyncResult> {
    if (item.type === CompareType.NoChange && !this.force) {
      return {
        type: SyncResultType.Noop,
        size: 0,
      };
    }

    const key = item.key;
    const metadata = this.metadata[key];

    let result: PutObjectCommandOutput | DeleteObjectCommandOutput | null;

    if (
      (item.type === CompareType.NewLocally || item.type === CompareType.Changed) ||
      (item.type === CompareType.NoChange && this.force)
    ) {
      result = await this.#put(item, metadata);
    } else if (item.type === CompareType.RemovedLocally) {
      result = await this.#delete(item);
    } else {
      throw new Error(`Unexpected CompareType value: ${item.type}`);
    }

    if (result) {
      return {
        type: SyncResultType.Success,
        size: item.localObject?.size ?? 0,
      };
    } else {
      return {
        type: SyncResultType.Error,
        size: 0,
      };
    }
  }

  async #put(item: ComparedItem, metadata: IMigrateObjectMetadata | undefined) {
    try {
      const local = item.localObject!;
      const fullPath = join(this.basePath, local.key);
      const fd = await open(fullPath);

      // ContentMD5 is b64 while ETag is MD5 (though it may not be MD5 if uploaded via multi)
      const b64md5 = Buffer.from(local.checksum, 'hex').toString('base64');

      const command = new PutObjectCommand({
        ...metadata,
        Bucket: this.bucket,
        Key: local.key,
        ContentMD5: b64md5,
        ContentType: local.mime,
        Body: fd.createReadStream(),
      });

      const result = await this.client.send(command);
      await fd.close();

      return result;
    } catch (e) {
      this.#addError(item, e);

      return null;
    }
  }

  async #delete(item: ComparedItem) {
    try {
      const s3Object = item.s3Object;

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: item.key,
      });

      const result = await this.client.send(command);
      return result;
    } catch (e) {
      this.#addError(item, e);

      return null;
    }
  }

  #addError(item: ComparedItem, error: unknown) {
    const existingErrors = this.#errors.get(item) ?? [];
    if (!existingErrors.length) {
      this.#errors.set(item, existingErrors)
    }
    existingErrors.push(error);
  }
}
