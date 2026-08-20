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
lib/parse/              trigbook.tex tokenizer (math protected first)
lib/model/              chapter/section/figure/equation numbering, book index
lib/render/             blocks → HTML; math passes through to MathJax
_data/book.js           exposes the rendered book to Eleventy
pages.njk               paginates every section to its own page
scripts/                figure conversion (pdflatex + dvisvgm), search index,
                        verify-build integrity checks, chapter PDF generation
assets/                 viewer JS, CSS, self-hosted MathJax v4 + MiniSearch
```

## Developing

Requires Node ≥ 22. For figure conversion also install TeX Live plus
`ghostscript`, `dvisvgm`, and `mupdf-tools`; without them the site builds with
figures missing.

```sh
npm install
npm run update:vendor   # populate self-hosted MathJax + MiniSearch (once)
npm run build           # figures → Eleventy → search index
npm run verify          # integrity checks over _site
npm run serve           # dev server at http://localhost:4000/MecmathTrigonometryTextbook/
```

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`: build → verify →
chapter PDFs (Playwright) → rebuild with PDF download links → GitHub Pages.
Pull requests run the same build + verify via `ci.yml`.

## Attribution

Content © Michael Corral, licensed under the Creative Commons
Attribution-ShareAlike 4.0 International license.
