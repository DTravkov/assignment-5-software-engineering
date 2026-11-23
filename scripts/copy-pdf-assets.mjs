import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  const destination = resolve(root, 'public/pdfjs', folder);
  mkdirSync(destination, { recursive: true });
  cpSync(resolve(root, 'node_modules/pdfjs-dist', folder), destination, { recursive: true });
}
