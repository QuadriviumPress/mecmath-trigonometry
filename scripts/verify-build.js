#!/usr/bin/env node

/**
 * verify-build.js — integrity assertions over the built Trigonometry site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import * as cheerio from 'cheerio';
import { parseBook } from '../lib/parse/book.js';
import { buildModel } from '../lib/model/numbering.js';
import { collectBookAssets } from '../lib/figures.js';
import { checkMath, reportMath } from './check-math.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const siteDir = path.join(root, '_site');
const PREFIX = process.env.VERCEL ? '' : '/mecmath-trigonometry';
const CI = !!process.env.CI;

let failures = 0;
let checks = 0;
const fail = msg => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const pass = msg => {
  checks++;
  console.log(`  ✓ ${msg}`);
};
const note = msg => console.log(`  · ${msg}`);

if (!fs.existsSync(siteDir)) {
  console.error('_site not found — run `npm run build` first');
  process.exit(1);
}

console.log('\npage set');
const model = buildModel(parseBook(root));
let missingPages = 0;
for (const page of model.pages) {
  const file = path.join(siteDir, page.url, 'index.html');
  if (!fs.existsSync(file)) {
    fail(`missing page: ${page.url}`);
    missingPages++;
  }
}
if (missingPages === 0) pass(`all ${model.pages.length} model pages emitted`);
if (model.pages.length < 30) fail(`page floor: expected >=30 model pages, got ${model.pages.length}`);
else pass('page count above floor (30)');

const htmlFiles = (await glob('**/*.html', { cwd: siteDir })).filter(f => !f.startsWith('assets/'));
const pages = new Map();
for (const file of htmlFiles) {
  const $ = cheerio.load(fs.readFileSync(path.join(siteDir, file), 'utf8'));
  const ids = new Set();
  $('[id]').each((_, el) => ids.add($(el).attr('id')));
  pages.set(file, { $, ids });
}

const resolveTarget = href => {
  let p = href;
  if (PREFIX && p.startsWith(PREFIX)) p = p.slice(PREFIX.length);
  if (p === '' || p === '/') p = '/index.html';
  if (p.endsWith('/')) p += 'index.html';
  if (!path.extname(p)) p += '/index.html';
  return p.replace(/^\//, '');
};

console.log('\nlinks');
let badLinks = 0;
let badFragments = 0;
let linkCount = 0;
for (const [file, { $, ids }] of pages) {
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (/^(https?:|mailto:|#)/.test(href)) {
      if (href.startsWith('#') && href.length > 1 && !ids.has(href.slice(1))) {
        fail(`${file}: dead same-page fragment ${href}`);
        badFragments++;
      }
      return;
    }
    if (!href.startsWith('/')) return;
    linkCount++;
    const [pathPart, fragment] = href.split('#');
    const target = resolveTarget(pathPart);
    const targetPage = pages.get(target);
    if (!targetPage && !fs.existsSync(path.join(siteDir, target))) {
      fail(`${file}: broken link ${href}`);
      badLinks++;
      return;
    }
    if (fragment && targetPage && !targetPage.ids.has(fragment)) {
      fail(`${file}: dead fragment ${href}`);
      badFragments++;
    }
  });
}
if (badLinks === 0) pass(`all ${linkCount} internal links resolve`);
if (badFragments === 0) pass('all fragments resolve');

console.log('\nfigures');
const figureRefs = new Set();
for (const [, { $ }] of pages) {
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src.includes('/figures/')) figureRefs.add(src.slice(src.indexOf('/figures/') + 9));
  });
}
const { assets } = collectBookAssets(root);
const figDir = path.join(siteDir, 'figures');
let missingFigs = 0;
for (const ref of figureRefs) {
  if (!fs.existsSync(path.join(figDir, ref))) missingFigs++;
}
if (missingFigs > 0) {
  if (CI) fail(`${missingFigs}/${figureRefs.size} referenced figure files missing`);
  else note(`${missingFigs}/${figureRefs.size} figure files missing (convert-figures not run locally)`);
} else {
  pass(`all ${figureRefs.size} referenced figures exist`);
}
if (figureRefs.size < 200) note(`only ${figureRefs.size} figure refs (expected ~${assets.length})`);

// Typeset every math span with the shipped MathJax config and scan the prose
// around it: a preamble macro missing from assets/js/math-config.js is not a
// build error, it just reaches the reader as red LaTeX. See check-math.js.
console.log('\nmath rendering');
reportMath(await checkMath({ root, siteDir }), { pass, fail }); // fail() counts

console.log('\nreferences');
let missingRefs = 0;
for (const [, { $ }] of pages) {
  missingRefs += $('.missing-ref').length;
}
if (missingRefs === 0) pass('no unresolved cross-references');
else fail(`${missingRefs} unresolved cross-references (.missing-ref)`);

console.log('\nbuild report');
const reportPath = path.join(root, 'generated', 'build-report.json');
if (!fs.existsSync(reportPath)) {
  fail('generated/build-report.json missing');
} else {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (report.warnings.length === 0) pass('zero build warnings');
  else fail(`${report.warnings.length} build warnings (first: ${report.warnings[0]})`);
  if (report.unknownConstructs.length === 0) pass('zero unknown LaTeX constructs');
  else fail(`unknown LaTeX constructs: ${report.unknownConstructs.map(u => u.command).join(', ')}`);
  if (report.notices?.length > 0) note(`${report.notices.length} notices (non-fatal source quirks)`);
}

console.log('\nsearch');
const indexPath = path.join(siteDir, 'search_index.json');
if (!fs.existsSync(indexPath)) {
  fail('search_index.json missing (postbuild not run?)');
} else {
  const docs = JSON.parse(fs.readFileSync(indexPath, 'utf8')).documents;
  if (docs.length >= 30) pass(`search index: ${docs.length} documents`);
  else fail(`search index too small: ${docs.length} documents`);
}

console.log('\napp shell');
for (const file of [
  'sw.js',
  'manifest.webmanifest',
  'SUMMARY.html',
  'summary.json',
  'assets/js/mathjax/tex-chtml.js',
  'assets/js/mathjax/input/tex/extensions/cancel.js',
  'assets/js/mathjax/input/tex/extensions/ams.js',
  'assets/js/mathjax/input/tex/extensions/enclose.js',
  'assets/js/mathjax/input/tex/extensions/mathtools.js',
  'assets/js/mathjax/input/tex/extensions/textmacros.js',
  'assets/js/vendor/minisearch.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
]) {
  if (fs.existsSync(path.join(siteDir, file))) pass(file);
  else fail(`missing: ${file}`);
}

console.log('\nbook index');
const bookIndexFile = pages.get('book-index.html');
if (!bookIndexFile) {
  fail('book-index.html missing');
} else {
  const letters = bookIndexFile.$('.book-index h2').length;
  const refs = bookIndexFile.$('.index-entries a').length;
  if (letters >= 15) pass(`${letters} letter sections`);
  else fail(`only ${letters} letter sections`);
  if (refs >= 150) pass(`${refs} linked index references`);
  else fail(`only ${refs} linked index references`);
}

console.log(`\n${checks} checks passed, ${failures} failures`);
process.exit(failures > 0 ? 1 : 0);
