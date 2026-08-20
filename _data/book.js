import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBook } from '../lib/book-data.js';

export default function () {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  return buildBook({ root });
}
