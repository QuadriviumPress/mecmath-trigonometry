# Trigonometry — Web Edition

Eleventy build of **Trigonometry** by Michael Corral, rendering the original
LaTeX source to a searchable, offline-capable web textbook.

- **Repository:** https://github.com/QuadriviumPress/mecmath-trigonometry
- **Original text:** https://www.mecmath.net/trig/
- **License:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## How it works

The verbatim mecmath source lives in [`mecmath-trigonometry/`](mecmath-trigonometry/)
— **it is ground truth and is never modified**. Everything else is build tooling:

```
mecmath-trigonometry/   LaTeX source (trigbook.tex + chapters + 226 figures)
tex/                    trigbook-compat.sty (TeX Live 2023+ shims)
lib/parse/              trigbook.tex tokenizer (math protected first)
lib/model/              chapter/section/figure/equation numbering, book index
lib/render/             blocks → HTML; math passes through to MathJax
_data/book.js           exposes the rendered book to Eleventy
pages.njk               paginates every section to its own page
scripts/                figure conversion (pdflatex + dvisvgm), search index,
                        verify-build integrity checks, chapter PDF generation,
                        full-book PDF build (build-book.sh)
assets/                 viewer JS, CSS, self-hosted MathJax v4 + MiniSearch
```

## Developing

Requires Node ≥ 22. For figure conversion also install TeX Live plus
`ghostscript`, `dvisvgm`, and `mupdf-tools`; without them the site builds with
figures missing.

```sh
npm ci
npm run update:vendor   # populate self-hosted MathJax + MiniSearch (once)
npm run build           # figures → Eleventy → search index
npm run verify          # integrity checks over _site
npm run serve           # dev server at http://localhost:4000/mecmath-trigonometry/
```

## Building the original book PDF

`scripts/build-book.sh` typesets the upstream `trigbook.pdf` (270 pages) from
the pristine source. Everything is copied into `generated/book/` first, so the
source tree is never written to.

```sh
sudo apt install texlive-latex-base texlive-latex-recommended \
  texlive-latex-extra texlive-fonts-recommended texlive-fonts-extra \
  texlive-pictures lmodern ghostscript
bash scripts/vendor-texmf.sh   # once, if vendor/texmf is not populated
bash scripts/build-book.sh     # -> generated/book/trigbook.pdf
```

Upstream's `mecmath-trigonometry/trigbook.sh` targeted **TeX Live 2011** and has
not compiled on a current distribution since 2014. Two things broke, and both
are fixed without editing a line of the source:

| Breakage | Fix |
|---|---|
| `picins` was dropped from TeX Live 2014 (non-free licence); the preamble needs it for 83 `\parpic`/`\piccaption`/`\picskip` calls | vendored in `vendor/texmf`, found via `TEXMFHOME` |
| KOMA-Script turned `\bf` and friends into hard **errors**; `gnufdl.tex` uses `{\Large\bf …}` 13 times | `tex/trigbook-compat.sty` reinstates the LaTeX 2.09 font commands via a `class/scrbook/after` hook |

The compat package is injected on the command line rather than `\usepackage`d:

```sh
latex -jobname=trigbook '\RequirePackage{trigbook-compat}\input{trigbook.tex}'
```

It also declares the `LPH/fnc` → `LPH/cmr` substitution that `\PHcat`
(Figure 1.5.x) otherwise triggers a font warning for. `dvips`/`ps2pdf` are
still used, as upstream intended — only `-dUseCIEColor` is dropped, which
Ghostscript has advised against for `pdfwrite` since 9.11.

Verified on **TeX Live 2023** (Ubuntu 24.04): four `latex` passes under
`-halt-on-error`, zero errors, identical 270-page output. The one remaining
warning is PGF's *"Snakes have been superseded by decorations"* — the
`snakes` library is still shipped but deprecated, and the three `snake=brace`
draws in Chapters 1 and 6 will need `decorations.pathreplacing` if PGF ever
removes it.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`: build → verify →
chapter PDFs (Playwright) → rebuild with PDF download links → GitHub Pages.
Pull requests run the same build + verify via `ci.yml`.

## Attribution

Content © Michael Corral, licensed under the Creative Commons
Attribution-ShareAlike 4.0 International license.
