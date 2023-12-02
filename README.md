# @skgrush/sync-s3

Little tool for syncing files into an S3 bucket.

Expects that all files in the copySourceDirectory should replace all the files
in the S3 bucket, and synchronizes them lazily based on MD5 hashes.

The main motivation for this project over [AWS's official `sync`](https://docs.aws.amazon.com/cli/latest/reference/s3/sync.html)
is I wanted to set metadata on specific files and the multi-sync approach made no sense to me.

## Usage

`env.json`
```json
{
  "$schema": "./dist/env.schema.json",
  "region": "us-east-2",
  "bucket": "BUCKET-NAME",
  "credentials": {
    "accessKeyId": "AWS-S3-WRITABLE-KEY-ID",
    "secretAccessKey": "AWS-S3-WRITABLE-ACCESS-KEY"
  },
  "copySourceDirectory": "../dist/MY-PROJECT-NAME/browser",
  "metadataFile": "../metadata.json"
}
```

`metadata.json`
```json
{
  "some/file.jpeg": {
    "CacheControl": "no-cache"
  },
  "no-extension": {
    "ContentType": "application/javascript"
  },
  "go-elsewhere": {
    "WebsiteRedirectLocation": "https://github.com/skgrush"
  }
}
```

```sh
npx @skgrush/sync-s3 --execute env.json
```
