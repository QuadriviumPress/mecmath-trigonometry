// convert-figures.js — compile tikz / gnuplot / EPS assets to SVG (or PNG).
//
// Runs as `prebuild`. Output lands in generated/figures/ (git-ignored) and is
// passthrough-copied to /figures/ by eleventy.config.js.
//
// Each asset gets a stable content-hash id (fig-<sha1 10>). Compilation path:
//   tikz / gnuplot → pdflatex → dvisvgm --pdf
//   gnuplot epslatex figures: Ghostscript EPS→PDF in the work dir first
//   raster EPS images: Ghostscript PNG fallback when SVG is empty
//
// Requires pdflatex, dvisvgm, and ghostscript on PATH. When absent locally
// the script warns and exits 0 so contributors without TeX can still build HTML;
// in CI (CI=true) it is a hard failure unless --allow-failures is set.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectBookAssets, tikzStandalone, gnuplotStandalone } from '../lib/figures.js';
import { generatedFiguresDir, srcRoot } from '../lib/paths.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = generatedFiguresDir(root);
const srcDir = srcRoot(root);
const allowFailures = process.argv.includes('--allow-failures');
const concurrency = Number(process.env.FIGURE_CONCURRENCY || os.cpus().length || 4);

const DVISVGM_OPTS = ['--no-fonts', '--optimize', '--precision=2'];

function toolOk(cmd, args = ['--version']) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  return !res.error && res.status === 0;
}

const hasPdflatex = toolOk('pdflatex');
const hasDvisvgm = toolOk('dvisvgm');
const hasGs = toolOk('gs');

if (!hasPdflatex || !hasDvisvgm) {
  const msg = '[figures] pdflatex/dvisvgm not found — skipping figure conversion';
  if (process.env.CI) {
    console.error(`${msg} (fatal in CI; install texlive + dvisvgm + ghostscript)`);
    process.exit(1);
  }
  console.warn(`${msg} (figure images will be missing from the local build)`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

const { assets } = collectBookAssets(root);
let converted = 0;
let skipped = 0;
const failures = [];

/** An SVG with no drawable elements (photos come out empty via the PDF path). */
const svgIsEmpty = file =>
  !/<(path|image|use|text|polygon|rect|circle|line|polyline|ellipse)[\s/>]/.test(
    fs.readFileSync(file, 'utf8')
  );

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8' });
}

function assetSourceKey(asset) {
  if (asset.kind === 'tikz') return asset.content;
  if (asset.kind === 'gnuplot') return `${asset.file}.tex:${asset.file}.eps`;
  return asset.file;
}

function isFresh(asset, ext) {
  const out = path.join(outDir, `${asset.id}.${ext}`);
  if (!fs.existsSync(out)) return false;
  const outMtime = fs.statSync(out).mtimeMs;
  if (asset.kind === 'tikz') return outMtime >= Date.now() - 86400000; // content-hash id
  const base = asset.kind === 'gnuplot' ? asset.file : path.basename(asset.file, path.extname(asset.file));
  const deps = asset.kind === 'image' ? [path.join(srcDir, asset.file)] : [
    path.join(srcDir, `${base}.tex`),
    path.join(srcDir, `${base}.eps`),
  ];
  return deps.every(f => !fs.existsSync(f) || fs.statSync(f).mtimeMs <= outMtime);
}

function pdflatexToSvg(workDir, texName, outSvg) {
  const texPath = path.join(workDir, texName);
  const res = run('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', texName], workDir);
  if (res.status !== 0) {
    return { ok: false, stderr: (res.stdout + res.stderr).trim().slice(-800) };
  }
  const pdf = texPath.replace(/\.tex$/, '.pdf');
  if (!fs.existsSync(pdf)) {
    return { ok: false, stderr: 'pdflatex produced no PDF' };
  }
  const dvi = run('dvisvgm', ['--pdf', ...DVISVGM_OPTS, '-o', outSvg, pdf], workDir);
  if (dvi.status !== 0) {
    return { ok: false, stderr: (dvi.stderr || dvi.stdout || '').trim().slice(-800) };
  }
  if (!fs.existsSync(outSvg)) {
    return { ok: false, stderr: 'dvisvgm produced no SVG' };
  }
  return { ok: true };
}

function epsToPdf(eps, pdf) {
  if (!hasGs) return false;
  const gs = run(
    'gs',
    ['-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite', '-dEPSCrop', '-o', pdf, eps],
    path.dirname(eps)
  );
  return gs.status === 0 && fs.existsSync(pdf);
}

function epsToPng(eps, png) {
  if (!hasGs) return false;
  const gs = run(
    'gs',
    [
      '-dBATCH',
      '-dNOPAUSE',
      '-sDEVICE=png16m',
      '-r200',
      '-dEPSCrop',
      '-dTextAlphaBits=4',
      '-dGraphicsAlphaBits=4',
      '-o',
      png,
      eps,
    ],
    path.dirname(eps)
  );
  return gs.status === 0 && fs.existsSync(png);
}

function compileAsset(asset) {
  if (isFresh(asset, 'svg') || isFresh(asset, 'png')) {
    skipped += 1;
    return;
  }

  const workDir = fs.mkdtempSync(path.join(outDir, `.build-${asset.id}-`));
  const outSvg = path.join(outDir, `${asset.id}.svg`);
  const outPng = path.join(outDir, `${asset.id}.png`);

  try {
    if (asset.kind === 'tikz') {
      fs.writeFileSync(path.join(workDir, 'figure.tex'), tikzStandalone(asset.content));
      const res = pdflatexToSvg(workDir, 'figure.tex', outSvg);
      if (!res.ok) {
        failures.push({ id: asset.id, kind: asset.kind, stderr: res.stderr });
        return;
      }
      if (svgIsEmpty(outSvg)) {
        fs.rmSync(outSvg, { force: true });
        failures.push({ id: asset.id, kind: asset.kind, stderr: 'empty SVG from tikz' });
        return;
      }
      converted += 1;
      return;
    }

    if (asset.kind === 'gnuplot') {
      for (const ext of ['.tex', '.eps']) {
        const src = path.join(srcDir, `${asset.file}${ext}`);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(workDir, `${asset.file}${ext}`));
      }
      const eps = path.join(workDir, `${asset.file}.eps`);
      const pdf = path.join(workDir, `${asset.file}.pdf`);
      if (fs.existsSync(eps)) epsToPdf(eps, pdf);
      fs.writeFileSync(path.join(workDir, 'figure.tex'), gnuplotStandalone(asset.file));
      const res = pdflatexToSvg(workDir, 'figure.tex', outSvg);
      if (!res.ok) {
        failures.push({ id: asset.id, kind: asset.kind, file: asset.file, stderr: res.stderr });
        return;
      }
      if (svgIsEmpty(outSvg)) {
        fs.rmSync(outSvg, { force: true });
        if (fs.existsSync(eps) && epsToPng(eps, outPng)) {
          converted += 1;
          return;
        }
        failures.push({ id: asset.id, kind: asset.kind, file: asset.file, stderr: 'empty SVG' });
        return;
      }
      converted += 1;
      return;
    }

    if (asset.kind === 'image') {
      const eps = path.join(srcDir, asset.file);
      if (!fs.existsSync(eps)) {
        failures.push({ id: asset.id, kind: asset.kind, file: asset.file, stderr: 'missing EPS' });
        return;
      }
      const tmpPdf = path.join(workDir, 'image.pdf');
      if (epsToPdf(eps, tmpPdf)) {
        const dvi = run('dvisvgm', ['--pdf', ...DVISVGM_OPTS, '-o', outSvg, tmpPdf], workDir);
        if (dvi.status === 0 && fs.existsSync(outSvg) && !svgIsEmpty(outSvg)) {
          converted += 1;
          return;
        }
        fs.rmSync(outSvg, { force: true });
      }
      if (epsToPng(eps, outPng)) {
        converted += 1;
        return;
      }
      failures.push({ id: asset.id, kind: asset.kind, file: asset.file, stderr: 'EPS rasterize failed' });
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function runPool(items, worker, limit) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        await worker(items[i]);
      }
    })
  );
}

console.log(`[figures] compiling ${assets.length} assets (concurrency ${concurrency})`);
await runPool(assets, compileAsset, concurrency);

console.log(
  `[figures] ${converted} converted, ${skipped} up to date, ${failures.length} failed (${assets.length} total)`
);
for (const f of failures.slice(0, 20)) {
  console.error(`[figures] FAILED ${f.id} (${f.kind}${f.file ? ` ${f.file}` : ''})\n${f.stderr ?? ''}`);
}
if (failures.length > 20) console.error(`[figures] ...and ${failures.length - 20} more failures`);

if (failures.length > 0 && !allowFailures) process.exit(1);
