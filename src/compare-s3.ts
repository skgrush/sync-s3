import { WalkResult } from "./hash.js";
import { S3Object } from "./s3.js";

export enum CompareType {
  NoChange = 1,
  NewLocally = 2,
  RemovedLocally = 3,
  Changed = 4,
}

export class ComparedItem {
  readonly type = ComparedItem.getType(this.s3Object, this.localObject);
  readonly key = this.s3Object?.Key ?? this.localObject?.key!;

  constructor(
    readonly s3Object: S3Object | undefined,
    readonly localObject: WalkResult | undefined,
  ) { }

  static getType(s3?: S3Object, local?: WalkResult): CompareType {
    if (s3 && local) {
      const localETag = `"${local.checksum}"`;
      if (s3.ETag === localETag) {
        return CompareType.NoChange;
      }
      return CompareType.Changed;
    }
    if (s3 && !local) {
      return CompareType.RemovedLocally;
    }
    if (!s3 && local) {
      return CompareType.NewLocally;
    }

    throw new Error('Expected either s3 or local object, got neither');
  }
}

export async function compareS3(s3Objects: S3Object[], localIterator: AsyncGenerator<WalkResult>) {

  const s3LookupByKey = new Map(
    s3Objects.map(obj => [obj.Key!, obj])
  );

  const comparedItems = new Map<string, ComparedItem>();

  for await (const localItem of localIterator) {
    const key = localItem.key;
    const matchingKeyS3Object = s3LookupByKey.get(key);

    comparedItems.set(key, new ComparedItem(matchingKeyS3Object, localItem));
  }
  // now all local items and their corresponding S3 objects are accounted for

  for (const [key, s3object] of s3LookupByKey) {
    if (!comparedItems.has(key)) {
      // item exists in s3 but not locally
      comparedItems.set(key, new ComparedItem(s3object, undefined));
    }
  }
  // all items are now accounted for

  return comparedItems;
}


