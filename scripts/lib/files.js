import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getBaseDir(importMetaUrl) {
  const __filename = fileURLToPath(importMetaUrl);
  return path.join(path.dirname(__filename), '..');
}

export function readFile(filePath, encoding = 'utf-8') {
  return fs.readFileSync(filePath, encoding);
}

export function writeFile(filePath, content, encoding = 'utf-8') {
  fs.writeFileSync(filePath, content, encoding);
}
