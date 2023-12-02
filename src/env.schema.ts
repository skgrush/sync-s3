import { Schema } from "ajv";

export const EnvSchema = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "region",
    "bucket",
    "copySourceRelative",
    "credentials"
  ],
  "properties": {
    "region": {
      "type": "string"
    },
    "bucket": {
      "type": "string"
    },
    "copySourceDirectory": {
      "type": "string"
    },
    "metadataFile": {
      "type": "string"
    },
    "credentials": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "accessKeyId",
        "secretAccessKey"
      ],
      "properties": {
        "accessKeyId": {
          "type": "string"
        },
        "secretAccessKey": {
          "type": "string"
        }
      }
    }
  }
} as const satisfies Schema;
