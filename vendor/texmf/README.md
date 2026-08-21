# Vendored TeX packages (minimal)

Small TDS tree so CI can build TikZ figures without `texlive-fonts-extra`, and
so the full book can be typeset with `picins`, which TeX Live dropped in 2014.

| Package | Source | License |
|---------|--------|---------|
| fouriernc | CTAN `fonts/fouriernc` | LPPL |
| fourier (Fourier-GUTenberg) | CTAN `fonts/fourier-GUT` | LPPL |
| phaistos | CTAN `fonts/archaic/phaistos` | LPPL |
| picins | CTAN `macros/latex209/contrib/picins` | non-free, verbatim only |

Regenerate with: `bash scripts/vendor-texmf.sh`

Set `TEXMFHOME` to this directory (or its parent `vendor/texmf`) and run
`mktexlsr "$TEXMFHOME"` plus `updmap-user` before `pdflatex`.

## A note on `picins`

`picins` is the one non-free item here. Its header reads *"Aenderungen nur mit
Zustimmung der Autoren"* (changes only with the authors' consent), which is why
TeX Live removed it in 2014 and no Linux distribution ships it today. The copy
in `tex/latex/picins/` is verbatim and unmodified from CTAN.

`trigbook.tex` calls `\parpic`, `\piccaption` and `\picskip` in 83 places, so
there is no way to typeset the book without it. The usual replacements
(`wrapfig`, `picinpar`) are not drop-in: most of those call sites sit inside
theorem environments and exercise lists, where `wrapfig` is documented not to
work.
