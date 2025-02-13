import AjvModule from 'ajv';
import { open } from 'node:fs/promises';
import EnvSchema from './env.schema.json';

const Ajv = AjvModule.default;

export type IEnv = {
  readonly $schema: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
  readonly copySourceDirectory: string;
  readonly metadataFile: string;
  readonly credentials: 
    | { readonly accessKeyId: string, readonly secretAccessKey: string }
    | { readonly accessKeyIdEnv: string; readonly secretAccessKeyEnv: string }  
};

const ajv = new Ajv();
export const validator = ajv.compile<IEnv>(EnvSchema);

export async function getEnvironment(envPath: string) {
  const file = await open(envPath);

  const contents = await file.readFile({ encoding: 'utf8' });
  await file.close();

  const json = JSON.parse(contents);

  if (!validator(json)) {
    console.error('env.json:', json);
    throw new Error(`Failed to read from ${JSON.stringify(envPath)}; errors: ${ajv.errorsText(validator.errors)}`);
  }

  return json;
}
