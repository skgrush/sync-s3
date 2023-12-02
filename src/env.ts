import AjvModule from 'ajv';
import { open } from 'node:fs/promises';
import { EnvSchema } from './env.schema.js';
import { JTDDataType } from 'ajv/dist/types/jtd-schema.js';

const Ajv = AjvModule.default;

const ajv = new Ajv();
export const validator = ajv.compile(EnvSchema);

export type IEnv = JTDDataType<typeof EnvSchema>;

export async function getEnvironment(envPath: string) {
  const file = await open(envPath);

  const contents = await file.readFile({ encoding: 'utf8' });
  await file.close();

  const json = JSON.parse(contents);

  if (!validator(json)) {
    throw new Error(`Failed to read from ${JSON.stringify(envPath)}; errors: ${ajv.errorsText(validator.errors)}`);
  }

  return json;
}
