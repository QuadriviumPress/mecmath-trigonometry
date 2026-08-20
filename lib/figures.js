// figures.js — the figure-asset registry shared by the build and the
// prebuild converter. Every tikzpicture, gnuplot epslatex figure and
// \includegraphics image in the book becomes one asset with a stable
// content-hash id; scripts/convert-figures.js compiles each to SVG/PNG in
// generated/figures/, and the renderer points <img> at /figures/<id>.<ext>.
import crypto from 'node:crypto';
import { parseBook } from './parse/book.js';
import { buildModel } from './model/numbering.js';
import { tokenize } from './parse/tokenizer.js';

export function assetId(asset) {
  const key =
    asset.kind === 'tikz' ? asset.content : `${asset.kind}:${asset.file}`;
  return 'fig-' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
}

/** Standalone LaTeX wrapper for one tikz asset (book preamble subset). */
export function tikzStandalone(content) {
  return `\\documentclass[border=2pt,tikz]{standalone}
\\usetikzlibrary{arrows,patterns,decorations,intersections,matrix,snakes,calc,backgrounds}
\\usepackage{amsmath,amssymb}
\\usepackage{fouriernc}
\\usepackage{phaistos}
\\usepackage{pifont}
\\usepackage{xcolor}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\definecolor{captioncolor}{HTML}{005587}
\\definecolor{linecolor}{HTML}{0074C8}
\\definecolor{fillcolor}{cmyk}{0.1,0.05,0,0}
\\definecolor{brickcolor}{HTML}{F0D8B2}
\\definecolor{blockcolor}{HTML}{B6B6B6}
\\definecolor{groundcolor}{HTML}{E4D8C5}
\\definecolor{earthcolor}{HTML}{C5FFFF}
\\definecolor{watercolor}{cmyk}{0.1,0.05,0,0}
\\definecolor{codecolor}{HTML}{FFF7E0}
\\providecommand{\\Degrees}{\\ensuremath{^\\circ}}
\\providecommand{\\abs}[1]{\\lvert\\mspace{1mu}#1\\mspace{1mu}\\rvert}
\\providecommand{\\Abs}[1]{\\bigl\\lvert\\mspace{1mu}#1\\mspace{1mu}\\bigr\\rvert}
\\providecommand{\\norm}[1]{\\lVert\\mspace{1mu}#1\\mspace{1mu}\\rVert}
\\providecommand{\\Norm}[1]{\\bigl\\lVert\\mspace{1mu}#1\\mspace{1mu}\\bigr\\rVert}
\\providecommand{\\NORM}[1]{\\Biggl\\lVert\\mspace{1mu}#1\\mspace{1mu}\\Biggr\\rVert}
\\providecommand{\\ssub}[2]{#1_{\\scriptscriptstyle #2}}
\\providecommand{\\ssubsum}[3]{#1_{\\scriptscriptstyle #3} + #2_{\\scriptscriptstyle #3}}
\\providecommand{\\Reals}{\\mathbb{R}}
\\providecommand{\\Complex}{\\mathbb{C}}
\\providecommand{\\Rationals}{\\mathbb{Q}}
\\providecommand{\\Naturals}{\\mathbb{N}}
\\providecommand{\\Integers}{\\mathbb{Z}}
\\providecommand{\\ival}[2]{\\lbrack #1,#2 \\rbrack}
\\begin{document}
${content}
\\end{document}
`;
}

/** Standalone LaTeX wrapper for a gnuplot epslatex figure asset. */
export function gnuplotStandalone(file) {
  return `\\documentclass[border=2pt]{standalone}
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\begin{document}
\\input{${file}.tex}
\\end{document}
`;
}

/**
 * Parse the book and collect every asset (deduped by id) plus per-page
 * warnings. Also attaches ids to the assets referenced by each page.
 */
export function collectBookAssets(root) {
  const structure = parseBook(root);
  const model = buildModel(structure);
  const warnings = [...structure.warnings];
  const byId = new Map();

  for (const page of model.pages) {
    const t = tokenize(page.tex, { name: page.name });
    warnings.push(...t.warnings);
    page.blocks = t.blocks;
    page.mathSpans = t.mathSpans;
    page.assets = t.assets;
    for (const asset of page.assets) {
      if (asset.kind === 'verbatim') continue;
      const id = assetId(asset);
      asset.id = id;
      if (!byId.has(id)) byId.set(id, { ...asset, id, usedIn: [] });
      byId.get(id).usedIn.push(page.name);
    }
  }

  const assets = [...byId.values()];
  return { structure, model, assets, warnings };
}
