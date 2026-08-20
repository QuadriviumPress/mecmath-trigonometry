// paths.js — the only place the LaTeX source layout is named.
import path from 'node:path';

export const SRC_ROOT = 'mecmath-trigonometry';

export function srcRoot(root) {
  return path.join(root, SRC_ROOT);
}

/** Master file: trigbook.tex drives the whole book via \include{}. */
export function bookFile(root) {
  return path.join(srcRoot(root), 'trigbook.tex');
}

/** Chapter/appendix .tex files live directly in the source root. */
export function srcFile(root, name) {
  return path.join(srcRoot(root), `${name}.tex`);
}

export function generatedDir(root) {
  return path.join(root, 'generated');
}

export function generatedFiguresDir(root) {
  return path.join(root, 'generated', 'figures');
}
