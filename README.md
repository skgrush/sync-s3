# @skgrush/sync-s3

Little tool for syncing files into an S3 bucket.

Expects that all files in the source directory should replace all the files
in the S3 bucket, and synchronizes them lazily based on MD5 hashes.


## Usage

```json
// env.json
{
  "$schema": "./dist/env.schema.json",
  "region": "us-east-2",
  "bucket": "BUCKET-NAME",
  "credentials": {
    "accessKeyId": "AWS-S3-WRITABLE-KEY-ID",
    "secretAccessKey": "AWS-S3-WRITABLE-ACESS-KEY"
  },
  "copySourceDirectory": "../dist/MY-PROJECT-NAME/browser",
  "metadataFile": "../metadata.json"
}
```

```sh
npx @skgrush/sync-s3 --execute env.json
```
