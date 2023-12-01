import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const repoRootPath = normalize(join(__dirname, '../'));
