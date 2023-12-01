import Ajv from 'ajv';
import { open } from 'node:fs/promises';
import { EnvSchema } from './env.schema';
import { JTDDataType } from 'ajv/dist/types/jtd-schema';

export const validator = new Ajv().compile(EnvSchema);

export type IEnv = JTDDataType<typeof EnvSchema>;

export async function getEnvironment(envPath: string) {
  const file = await open(envPath);

  const contents = await file.readFile({ encoding: 'utf8' });
  await file.close();

  const json = JSON.parse(contents);

  if (!validator(json)) {
    throw new Error(`Failed to read ICredentials from ${JSON.stringify(envPath)}`);
  }

  return json;
}
