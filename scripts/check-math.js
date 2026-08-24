#!/usr/bin/env node

/**
 * check-math.js — prove the built HTML renders, rather than leaks, its LaTeX.
 *
 * The book preamble defines macros that are idiosyncratic to the author
 * (\ddx, \dydx, \Crossprod, \bigsum, \seq, ...). LaTeX knows them; MathJax
 * only knows what assets/js/math-config.js hands it. A macro missing from that
 * config is not a build error — MathJax's `noundefined` package prints the
 * control sequence in red and the reader sees raw LaTeX. Nothing else in the
 * pipeline notices, so this check does:
 *
 *   1. math check — typeset every math span in _site with the *shipped*
 *      MathJax config, then look for undefined control sequences (red mtext)
 *      and TeX errors in what MathJax produced.
 *   2. leak check — strip the math spans out of the page text and fail on any
 *      backslash command left behind in prose, captions, or headings.
 *
 * Run standalone (`npm run verify:math`) or via scripts/verify-build.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import * as cheerio from 'cheerio';
import { init } from 'mathjax';

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** MathJax renders an unknown macro as red mtext holding its own source. */
const RED_MTEXT = /<mtext[^>]*\bmathcolor="red"[^>]*>([^<]*)<\/mtext>/g;
const MERROR = /<merror[^>]*>[\s\S]*?<mtext[^>]*>([^<]*)<\/mtext>/g;

/**
 * The browser loads assets/js/math-config.js as a classic script that assigns
 * a global. Evaluate it the same way so the check can never drift from what
 * ships — no second copy of the macro table.
 */
export function loadMathConfig(root = HERE) {
  const file = path.join(root, 'assets', 'js', 'math-config.js');
  const src = fs.readFileSync(file, 'utf8');
  const cfg = new Function(`"use strict"; let MathJax; ${src}; return MathJax;`)();
  if (!cfg || !cfg.tex) throw new Error(`${file}: no MathJax.tex config found`);
  return cfg;
}

/** TeX extensions the config asks for, as loader component names. */
function texExtensions(cfg) {
  const packages = cfg.tex.packages?.['[+]'] ?? [];
  return packages.map(p => `[tex]/${p}`);
}

async function startMathJax(cfg, onTexError) {
  const tex = {
    ...cfg.tex,
    formatError: (jax, err) => {
      onTexError(err.message, jax.latex ?? '');
      return jax.formatError(err);
    },
  };
  const MathJax = await init({
    loader: {
      load: ['input/tex', 'output/chtml', 'adaptors/liteDOM', ...texExtensions(cfg)],
      // The npm bundles carry no version metadata; the warnings say nothing
      // about the book.
      versionWarnings: false,
    },
    tex,
    // The browser-only keys (menu, a11y) are rejected by the node components.
    options: { ignoreHtmlClass: cfg.options?.ignoreHtmlClass ?? 'mathjax-skip' },
    startup: { typeset: false },
  });
  return MathJax;
}

/**
 * Remove \( \), \[ \], and \begin{env}...\end{env} spans from page text.
 * A scanner rather than a regex: display rows carry \\[10pt], whose "\[" must
 * not be mistaken for an opening display delimiter.
 */
export function stripMath(text) {
  const ENV = /^\\begin\{([a-zA-Z]+\*?)\}/;
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '\\') {
      out += text[i];
      i++;
      continue;
    }
    const next = text[i + 1];
    if (next === '(' || next === '[') {
      const close = next === '(' ? '\\)' : '\\]';
      const end = text.indexOf(close, i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    const env = ENV.exec(text.slice(i, i + 32));
    if (env) {
      const close = `\\end{${env[1]}}`;
      const end = text.indexOf(close, i + env[0].length);
      i = end === -1 ? text.length : end + close.length;
      continue;
    }
    // Not a math delimiter: keep the whole control sequence so the leak
    // report names \frac rather than \f.
    const cmd = /^\\([a-zA-Z]+|.)/.exec(text.slice(i));
    out += cmd[0];
    i += cmd[0].length;
  }
  return out;
}

/** Backslash commands surviving stripMath() are LaTeX the renderer dropped. */
function findLeaks(html) {
  const $ = cheerio.load(html);
  $('script, style, pre, code, .mathjax-skip').remove();
  const text = stripMath($('body').text());
  const found = [];
  for (const m of text.matchAll(/\\[a-zA-Z]+/g)) {
    found.push({
      command: m[0],
      context: text.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, ' ').trim(),
    });
  }
  return found;
}

function record(map, key, sample) {
  const entry = map.get(key) ?? { count: 0, ...sample };
  entry.count++;
  map.set(key, entry);
}

/**
 * @returns {{pageCount, mathCount, undefined: Map, texErrors: Map, leaks: Map}}
 */
export async function checkMath({ root = HERE, siteDir = path.join(root, '_site') } = {}) {
  const cfg = loadMathConfig(root);
  const texErrors = new Map();
  let current = '';
  const MathJax = await startMathJax(cfg, (message, latex) =>
    record(texErrors, message, { page: current, tex: latex.slice(0, 160) })
  );
  const { mathjax, input, output, visitor } = MathJax.startup;

  const files = (await glob('**/*.html', { cwd: siteDir })).filter(f => !f.startsWith('assets/'));
  const undef = new Map();
  const leaks = new Map();
  let mathCount = 0;

  for (const file of files) {
    current = file;
    const html = fs.readFileSync(path.join(siteDir, file), 'utf8');

    const doc = mathjax.document(html, { InputJax: input, OutputJax: output });
    await mathjax.handleRetriesFor(() => {
      doc.findMath().compile();
    });
    for (const item of doc.math) {
      mathCount++;
      if (!item.root) continue;
      const mml = visitor.visitTree(item.root, doc);
      if (!mml.includes('mathcolor="red"') && !mml.includes('<merror')) continue;
      for (const re of [RED_MTEXT, MERROR]) {
        re.lastIndex = 0;
        for (const m of mml.matchAll(re)) {
          const token = m[1].trim();
          // An undefined control sequence echoes its own source and nothing
          // else. A red \color the author asked for, or an merror carrying a
          // sentence, does not — the latter is already in texErrors.
          if (!/^\\([a-zA-Z]+|\S)$/.test(token)) continue;
          record(undef, token, { page: file, tex: (item.math ?? '').slice(0, 160) });
        }
      }
    }

    for (const leak of findLeaks(html)) {
      record(leaks, leak.command, { page: file, context: leak.context });
    }
  }

  return { pageCount: files.length, mathCount, undefined: undef, texErrors, leaks };
}

/**
 * Print the report through verify-build's pass/fail helpers.
 * @returns the number of distinct problems (0 when the build is clean).
 */
export function reportMath(result, { pass, fail, detail = console.error } = {}) {
  const sections = [
    ['macros MathJax cannot resolve (shown to readers as red LaTeX)', result.undefined, e => e.tex],
    ['TeX errors', result.texErrors, e => e.tex],
    ['LaTeX commands outside math', result.leaks, e => e.context],
  ];
  let problems = 0;
  for (const [title, map, sample] of sections) {
    if (map.size === 0) continue;
    problems += map.size;
    fail(`${map.size} ${title}`);
    for (const [key, entry] of [...map].sort((a, b) => b[1].count - a[1].count)) {
      detail(`      ${String(entry.count).padStart(5)}× ${key}   (${entry.page})`);
      detail(`            ${sample(entry).replace(/\s+/g, ' ')}`);
    }
  }
  if (result.undefined.size === 0 && result.texErrors.size === 0) {
    pass(`${result.mathCount} math spans across ${result.pageCount} pages typeset cleanly`);
  }
  if (result.leaks.size === 0) pass('no LaTeX commands outside math');
  return problems;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const siteDir = path.join(HERE, '_site');
  if (!fs.existsSync(siteDir)) {
    console.error('_site not found — run `npm run build` first');
    process.exit(1);
  }
  console.log('\nmath rendering');
  const problems = reportMath(await checkMath({ root: HERE, siteDir }), {
    pass: msg => console.log(`  ✓ ${msg}`),
    fail: msg => console.error(`  ✗ ${msg}`),
  });
  process.exit(problems > 0 ? 1 : 0);
}
