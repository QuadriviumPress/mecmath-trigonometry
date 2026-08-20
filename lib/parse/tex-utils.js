// parse/tex-utils.js — low-level TeX text helpers shared by parser and renderer.

/** Truncate a line at its first comment %: preceded by an even number of backslashes. */
export function stripLineComment(line) {
  let i = 0;
  while (i < line.length) {
    if (line[i] === '\\') {
      i += 2;
      continue;
    }
    if (line[i] === '%') return line.slice(0, i);
    i++;
  }
  return line;
}

/**
 * Brace-balanced group reader starting at text[start] === '{'.
 * Skips \\-escaped characters; returns {value, end} or null.
 */
export function extractBraceGroup(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { value: text.slice(start + 1, i), end: i + 1 };
    }
    i++;
  }
  return null;
}

/**
 * Bracket-balanced [ ... ] group starting at (or after) `start`.
 * Braces inside protect brackets: \caption[x]{y}, subfloat[][cap] etc.
 * Returns {value, end} with `from` = index of '[', or null.
 */
export function extractBracketGroup(text, start) {
  let i = start;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '[') return null;
  const from = i;
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '[' && depth === 0 && i !== from) {
      // nested optional group (e.g. subfloat[][]) — treat its matching ']' as
      // part of this group by scanning ahead; simplest: keep scanning.
    } else if (ch === ']' && depth === 0) {
      return { value: text.slice(from + 1, i), end: i + 1, from };
    }
    i++;
  }
  return null;
}

/** Split on `sep` at brace depth 0, honoring \\-escapes. */
export function splitTopLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Skip whitespace from i; return new index. */
export function skipWs(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

/**
 * Extract a balanced \begin{env}...\end{env} span (nesting-aware) from start.
 * Returns {inner, end} or null when unbalanced.
 */
export function extractEnv(text, start, env) {
  const open = `\\begin{${env}}`;
  const close = `\\end{${env}}`;
  let depth = 0;
  let i = start;
  while (i < text.length) {
    if (text.startsWith(open, i)) {
      depth++;
      i += open.length;
      continue;
    }
    if (text.startsWith(close, i)) {
      depth--;
      if (depth === 0) {
        return { inner: text.slice(start + open.length, i), end: i + close.length };
      }
      i += close.length;
      continue;
    }
    i++;
  }
  return null;
}

/** Strip LaTeX commands/braces for a plain-text projection (used for slugs/labels). */
export function texStrip(text) {
  return text
    .replace(/\\([%&_#$])/g, '$1')
    .replace(/\\([a-zA-Z]+)\s*/g, '')
    .replace(/[{}]/g, '')
    .replace(/``|''/g, '"')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
