#!/usr/bin/env bash
# Populate vendor/texmf with the small CTAN font set needed for TikZ figures
# (fouriernc + fourier + phaistos) so CI need not install texlive-fonts-extra,
# plus picins, which the book preamble needs and which TeX Live dropped in 2014.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEXMF="$ROOT/vendor/texmf"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rm -rf "$TEXMF"
mkdir -p "$TEXMF"
cd "$TMP"

echo "Downloading fouriernc.tds.zip…"
curl -fsSL 'https://mirrors.ctan.org/install/fonts/fouriernc.tds.zip' -o fouriernc.tds.zip
unzip -q fouriernc.tds.zip -d "$TEXMF"
rm -rf "$TEXMF/doc"

echo "Downloading fourier-GUT.zip…"
curl -fsSL 'https://mirrors.ctan.org/fonts/fourier-GUT.zip' -o fourier.zip
unzip -q fourier.zip
mkdir -p \
  "$TEXMF/tex/latex/fourier" \
  "$TEXMF/fonts/tfm/public/fourier" \
  "$TEXMF/fonts/vf/public/fourier" \
  "$TEXMF/fonts/type1/public/fourier" \
  "$TEXMF/fonts/afm/public/fourier" \
  "$TEXMF/fonts/map/dvips/fourier"
cp -a fourier-GUT/latex/. "$TEXMF/tex/latex/fourier/"
cp -a fourier-GUT/tfm/. "$TEXMF/fonts/tfm/public/fourier/"
cp -a fourier-GUT/vf/. "$TEXMF/fonts/vf/public/fourier/"
cp -a fourier-GUT/type1/. "$TEXMF/fonts/type1/public/fourier/"
cp -a fourier-GUT/afm/. "$TEXMF/fonts/afm/public/fourier/" 2>/dev/null || true
cp -a fourier-GUT/map/. "$TEXMF/fonts/map/dvips/fourier/"

echo "Downloading phaistos.zip…"
curl -fsSL 'https://mirrors.ctan.org/fonts/archaic/phaistos.zip' -o phaistos.zip
unzip -q phaistos.zip
mkdir -p phaistos-build
cp phaistos/latex/phaistos.dtx phaistos/latex/phaistos.ins phaistos-build/
(cd phaistos-build && latex -interaction=nonstopmode phaistos.ins >/dev/null)
mkdir -p \
  "$TEXMF/tex/latex/phaistos" \
  "$TEXMF/fonts/tfm/public/phaistos" \
  "$TEXMF/fonts/type1/public/phaistos" \
  "$TEXMF/fonts/afm/public/phaistos" \
  "$TEXMF/fonts/map/dvips/phaistos"
cp phaistos-build/phaistos.sty "$TEXMF/tex/latex/phaistos/"
cp phaistos/tfm/phaistos.tfm "$TEXMF/fonts/tfm/public/phaistos/"
cp phaistos/type1/phaistos.pfb "$TEXMF/fonts/type1/public/phaistos/"
cp phaistos/afm/phaistos.afm "$TEXMF/fonts/afm/public/phaistos/"
cp phaistos/dvips/phaistos.map "$TEXMF/fonts/map/dvips/phaistos/"

# picins was removed from TeX Live in 2014: its licence ("Aenderungen nur mit
# Zustimmung der Autoren") is not free, so no distribution ships it any more.
# trigbook.tex uses \parpic/\piccaption/\picskip in 83 places, so the book
# cannot be typeset without it.  Redistributed here verbatim and unmodified.
echo "Downloading picins.zip…"
curl -fsSL 'https://mirrors.ctan.org/macros/latex209/contrib/picins.zip' -o picins.zip
unzip -q picins.zip
mkdir -p "$TEXMF/tex/latex/picins"
cp picins/picins.sty picins/picins.txt "$TEXMF/tex/latex/picins/"

mkdir -p "$TEXMF/web2c"
cat > "$TEXMF/web2c/updmap.cfg" <<'EOF'
Map fourier.map
Map phaistos.map
EOF

cat > "$TEXMF/README.md" <<'EOF'
# Vendored TeX fonts (minimal)

Small TDS tree so figure conversion can use `fouriernc` / `phaistos` without
installing Debian's `texlive-fonts-extra` (~1.7 GB).

| Package | Source | License |
|---------|--------|---------|
| fouriernc | CTAN `fonts/fouriernc` | LPPL |
| fourier (Fourier-GUTenberg) | CTAN `fonts/fourier-GUT` | LPPL |
| phaistos | CTAN `fonts/archaic/phaistos` | LPPL |

Regenerate with: `bash scripts/vendor-texmf.sh`
EOF

mktexlsr "$TEXMF"
echo "Done: $(du -sh "$TEXMF" | cut -f1) in $TEXMF"
