# Vendored TeX fonts (minimal)

Small TDS tree so CI can build TikZ figures without `texlive-fonts-extra`.

| Package | Source | License |
|---------|--------|---------|
| fouriernc | CTAN `fonts/fouriernc` | LPPL |
| fourier (Fourier-GUTenberg) | CTAN `fonts/fourier-GUT` | LPPL |
| phaistos | CTAN `fonts/archaic/phaistos` | LPPL |

Regenerate with: `bash scripts/vendor-texmf.sh`

Set `TEXMFHOME` to this directory (or its parent `vendor/texmf`) and run
`mktexlsr "$TEXMFHOME"` plus `updmap-user` before `pdflatex`.
