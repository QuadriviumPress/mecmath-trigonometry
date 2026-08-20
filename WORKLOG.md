# MecmathTrigonometryTextbook — Work Log

Building an Eleventy website that renders the mecmath *Trigonometry* textbook
(Michael Corral) with the LaTeX source as ground truth, mirroring the
`ElectromagneticsVolOneTextbook` project architecture, deployable to GitHub
Pages under the `QuadriviumPress` org.

## Status

- **Build engine**: complete. `buildBook()` runs clean — **36 pages / 11
  chapters / 0 warnings**.
- **Site shell / deployment**: complete. Figure pipeline, Eleventy templates,
  CSS, MathJax config, verify script, and GitHub Actions workflows are in place.
  Local `npm run build && npm run verify` passes (226 figures, 254 index refs).

## Completed

### Corpus (ground truth)
- `mecmath-trigonometry/` — verbatim copy of the LaTeX source:
  `trigbook.tex` (KOMA `scrbook` master driving `\include{}`s), preface,
  chapters 1–6, appendix A, appendix B, `gnufdl.tex`; inline `\addchap{History}`
  lives in the master.
- Corpus facts (via grep/pattern counts): 217 `tikzpicture`, 83 `parpic`,
  80 `subfloat`, 57 `statecomment`, 25 `\startexercises`, 97 `\divider`,
  127 `exmp`, 11 `statethm`, 3 `statecor`, 208 `\index{}`, 103 `multicols`.
  One `\includegraphics` (`wgnuplot.eps`, appendix B). 8 gnuplot epslatex
  figures via `\input{xxx.tex}` (`sinx2`, `3sinx4cosx`, `cos6xsin4x`,
  `modulated`, `cosineeqx`, `cosinefixed`, `sine`, `tutorial`, plus
  `spiral.tex` wrapped in `\scalebox{0.90}{...}`).
- Local toolchain: pdflatex (TeX Live 2023), dvisvgm 3.2.1, gs 10.02.1,
  node v22. No root / no passwordless sudo.
- `picins.sty` (nonfree, CTAN latex209 tree) fetched to
  `/tmp/opencode/picins.sty` — only needed for an optional full-book
  ground-truth compile (`.aux` `\newlabel` cross-check). Not part of build.

### Engine (all in `lib/`)
- `lib/paths.js` — `SRC_ROOT = 'mecmath-trigonometry'`, source file mapping,
  `generated/` + `generated/figures/` dirs.
- `lib/parse/tex-utils.js` — `stripLineComment`, `extractBraceGroup`,
  `extractBracketGroup`, `splitTopLevel`, `skipWs`, `extractEnv`, `texStrip`.
- `lib/parse/book.js` — `parseBook` (master `\include` handling, per-file
  `mainCounter`, inline History extraction), `parseChapterFile` (chapter /
  `\section` splitting — coordinate bug fixed; chapters 3–6 start with a
  `\section` near the top).
- `lib/parse/tokenizer.js` — the core engine:
  - Stage 0 raw protection: `verbatim`/`tikzpicture`/`\input{...}`/
    `\includegraphics`/`\lstset` bodies shielded from parsing.
  - `protectMath`: `\[...\]`, `$..$`, `$$..$$`, math envs (incl. `alignat`
    optional args), `empheq` unwrap to inner env.
  - `parseBlocks` + `blockMacroAt` for `statethm`/`statecor`/`statedefn`,
    `statecomment`, `startexercises`, `divider`, `subheading`, `centerline`,
    `piccaption`+`parpic` pair, bare `parpic`, `probs`, `scalebox`.
  - `parseParpicTail` (dimension `(..)(..)`, opts, content group).
  - `parseFigure` — figure floats, incl. `subfloat` panels; **multi-panel
    figures**: sibling `minipage`s each with its own `\caption`/`\label` are
    split into a `figureRow` of independently numbered figures
    (`splitMinipagePanels`, `parseSingleFigure`); single-minipage figures are
    unwrapped via `unwrapMinipages` (innermost-last so siblings/nesting work).
  - `parseTableFloat`, `parseEnumerate` (`\suspend`/`\resume`), `collectItems`
    (length-preserving masking `' '.repeat(pos - i)`; `TRANSPARENT_ENVS =
    multicols, center`; captures `prefix` = content before first `\item`),
    `parseTabular` + `parseCell` (with `\multicolumn{span}{spec}` where the
    spec may include rules like `|c||`), `paragraphBlocks`.
  - Enumerate *between* chunks (content between `\suspend` and `\resume`) now
    run through `parseBlocks` instead of becoming raw paragraphs.
  - Minor layout-only blocks are buffered: `bufCommandsOnly` gate for
    `{\small ...}` groups that only change type size.
- `lib/model/numbering.js` — chapter/section/page model; URLs like
  `/1-1-angles/`; chapter slugs (appendix prefix, `gnu-fdl`, `preface`).
- `lib/model/content.js` — counter/anchors, per-equation `\tag` injection,
  `registerTextLabels` + `refNumber` threading (exercise/example/figure/table/
  listing labels resolve to the innermost enclosing counter).
- `lib/model/slugs.js` — copied from EM project.
- `lib/model/book-index.js` — `\index{term!sub}` entries → book index.
- `lib/render/inline.js` — inline renderer; `preprocessMathTex` (`\qed`→
  `\text{qed}`, `\fbox{$X$}`→`\boxed{X}`, Greek accents → `\text{τ}` etc.);
  SYMBOLS/DROP/DROP_WITH_ARGS, bare style switches (`\bf/\it/\tt/...`),
  `\sfrac`, `\ovalbox`, `\phantom`, `\footnotemark`/`\footnotetext`,
  `\pageref{secX}` → `§ N.M` link, `\ref` resolution.
- `lib/render/transform.js` — block renderer: theorem/example/note/proof boxes,
  tableFloat, parpic float, lists with `start` attr, `figureRow`, verbatim
  asset images, tabular with `colspan`.
- `lib/figures.js` — asset registry: content-hash `assetId`, `tikzStandalone`
  (standalone class + tikz libs + book color defs + `\providecommand{\Degrees}`),
  `gnuplotStandalone`, `collectBookAssets`.
- `lib/book-data.js` — orchestration parse→tokenize→annotate→render;
  writes `generated/build-report.json` + `generated/print-manifest.json`;
  returns `summaryJson`; per-page render ctx carries `warnings` + `notices`;
  `renderAsset` for verbatim listings; listing labels registered as anchors
  with sequential numbers (listings package default).

### Site shell
- `scripts/convert-figures.js` — content-hash ids, parallel `pdflatex` →
  `dvisvgm --pdf`, gs eps→pdf/png fallbacks; CI gate unless `--allow-failures`.
- `_data/site.js`, `_data/build.js`, `_data/book.js`, `eleventy.config.js`
  (`PATH_PREFIX = /MecmathTrigonometryTextbook/`).
- Templates: `index.njk` (home landing page), `pages.njk`, `print.njk`,
  `summary-json.njk`, `summary.njk`, `sw.njk`, `manifest.njk`, `book-index.njk`.
- `assets/css/book.css` — Trigonometry palette (`#005587`/`#0074C8`), theorem/
  example/statecomment/proofbar/multicols/parpic/tabular styles.
- `assets/js/math-config.js` — book macros + `\cancel` via MathJax `[tex]/cancel`.
- `assets/pwa/offline.html`, `scripts/build-index.js`, `scripts/verify-build.js`,
  `scripts/generate-pdf-parallel.js` (`trig-*` PDF names), `scripts/lib/`.
- `.github/workflows/ci.yml` + `deploy.yml` (TeX Live + figure cache + Pages).

### Numbering rules (print-faithful)
- Figures: per-section `N.M.k` (`\numberwithin{figure}{section}`).
- Tables, equations, examples (`Example N.k`), theorems/corollaries (shared
  counter), definitions (own counter): per-chapter `N.k`.

### Label idioms handled
- `\startexercises\label{secNdotM}` (section labels, referenced via
  `\pageref`).
- `\begin{exmp}\label{exmp:...}`, `\item\label{exer:...}`.
- Figure labels inside `\begin{minipage}` inside `figure` — including the
  multi-panel figure case (e.g. §4.3: three sibling minipages, each an
  independently numbered figure).
- Table labels inside `\statecomment{...\label{tbl:...}}`.
- `\lstset{caption=...,label=lst:secant}` attaches to the next `lstlisting`
  (Java `secant.java`, §6.2) — referenced via `\ref{lst:secant}`.
- Chapter 3 exercise table: two sibling minipages between
  `\suspend{enumerate}` and `\resume{enumerate}`.
- Ch2 §2.1 ambiguous-case table: `\multicolumn` with rule-bearing specs.

## Remaining (optional)

1. **Optional**: full-book ground-truth compile with fetched `picins.sty` to
   cross-check `.aux` `\newlabel` entries against the model.
2. **Optional**: generate chapter PDFs locally (`npm run generate:pdf` after
   `npm run serve`) — CI deploy workflow runs this automatically.

## Verification

```
npm ci
npm run update:vendor
npm run build
npm run verify
```

Expect: `36 pages`, `226 figures`, `0 failures`. Dev server:

```
npm run serve
# http://localhost:4000/MecmathTrigonometryTextbook/
```

Engine-only check:

```
node --input-type=module -e "import { buildBook } from './lib/book-data.js'; buildBook({ root: process.cwd() });"
```

## Relevant files

- `lib/book-data.js` — build orchestration / entry point.
- `lib/parse/tokenizer.js` — main parser (block/env/item math/table logic).
- `lib/parse/book.js`, `lib/model/{numbering,content,slugs,book-index}.js`.
- `lib/render/{inline,transform}.js`, `lib/figures.js`, `lib/paths.js`.
- Reference project: `/home/veillette/QuadriviumPress/ElectromagneticsVolOneTextbook/`
  (assets, JS, MathJax, templates, workflows adapted from this).
