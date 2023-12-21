import { ListObjectsCommand, S3Client, _Object } from "@aws-sdk/client-s3";

export type S3Object = _Object;

export async function readFromBucket(bucket: string, client: S3Client, prefix?: string): Promise<S3Object[]> {
  const command = new ListObjectsCommand({
    Bucket: bucket,
    Prefix: prefix,
  });

  try {
    const listResult = await client.send(command);
    if (listResult.IsTruncated) {
      throw new Error('result is truncated; Not Yet Implemented');
    }
    if (!listResult.Contents) {
      throw new Error('Missing contents');
    }

    const {
      Contents: contents,
      ...listResultExceptContents
    } = listResult;
    console.info('List result context:', listResultExceptContents);

    return contents;
  } catch (e) {
    console.error('error listing', e);
    throw e;
  }
}
