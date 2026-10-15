# Parser and renderer architecture

The original LaTeX in `mecmath-trigonometry/` is ground truth. Make conversion
changes in the tooling rather than editing the source. See [README.md](README.md)
for setup, builds, and deployment.

## Build pipeline

`lib/book-data.js` exposes `buildBook({ root })` and coordinates these stages:

1. `lib/parse/book.js` follows the master file's `\include{}` commands,
   extracts the inline History chapter, and splits chapters into sections.
2. `lib/model/numbering.js` creates pages in reading order with their URLs
   and chapter/section numbers.
3. `lib/parse/tokenizer.js` turns each chapter introduction or section into
   blocks, math spans, and assets.
4. `lib/model/content.js` assigns content numbers and builds the label map.
5. `lib/render/inline.js` and `lib/render/transform.js` render HTML and
   resolve references. `lib/model/book-index.js` collects index entries.

`_data/book.js` exposes the result to Eleventy. Build diagnostics and print
metadata go to `generated/build-report.json` and `generated/print-manifest.json`.

## Tokenizer ordering and special cases

Protect raw content before stripping comments: verbatim listings, TikZ,
gnuplot inputs, and image commands can contain `%`, `$`, and backslashes that
later stages would otherwise interpret. After comment stripping, protect math
before parsing blocks. Keep nested math inside `\text{}` intact for MathJax.

The block parser handles several source-specific patterns:

- Sibling `minipage` blocks with separate captions and labels inside one
  figure become a `figureRow` of independently numbered figures. Single
  minipages are unwrapped.
- `\piccaption` plus `\parpic` represents a floating figure; `\parpic` may
  also appear without a caption.
- `\suspend{enumerate}` and `\resume{enumerate}` preserve list numbering.
  Content between them is parsed as blocks, including the chapter 3 exercise
  table. Item collection masks nested content without changing its positions
  and treats `multicols` and `center` as transparent wrappers.
- Table cells may use `\multicolumn` with rule-bearing specifications such
  as `|c||`.
- `\lstset{caption=...,label=...}` attaches metadata to the next listing.

## Numbering and references

Figures use `N.M.k` within each section. Tables, equations, examples, and
definitions use chapter-based `N.k` numbers. Theorems and corollaries share a
chapter counter; definitions have their own counter. Listings are numbered
sequentially across the book.

Labels in flowing text refer to the innermost numbered item, such as an
exercise, example, theorem, or figure. Section labels can follow
`\startexercises`; table labels can occur inside `\statecomment`. Preserve
these associations when changing the parser. `\pageref` to a section becomes
a section link. Equation numbers are inserted as `\tag{...}` by the build;
MathJax uses `tags: 'none'`.

## Figures and math validation

`lib/figures.js` assigns stable content-hash asset IDs and creates standalone
LaTeX wrappers. `scripts/convert-figures.js` compiles assets to SVG or PNG in
`generated/figures/`. The renderer uses the same registry to locate them.

After a build, `npm run verify` checks site integrity and math rendering.
`npm run verify:math` runs the math check separately: it typesets built math
with the shipped `assets/js/math-config.js`, checks for undefined commands and
TeX errors, and detects LaTeX commands left in prose. Keep that configuration
aligned with the book's preamble when adding macro support.
