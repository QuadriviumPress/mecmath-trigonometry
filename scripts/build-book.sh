#!/usr/bin/env bash
# Build trigbook.pdf from the pristine mecmath source on TeX Live 2023 or newer.
#
# Replaces the upstream mecmath-trigonometry/trigbook.sh, which targeted
# TeX Live 2011.  Two things changed since then:
#
#   * picins was dropped from TeX Live in 2014 (nonfree licence); it is
#     vendored under vendor/texmf and picked up via TEXMFHOME.
#   * KOMA-Script turned the old \bf/\it/... font commands into hard errors;
#     tex/trigbook-compat.sty reinstates them without touching the source.
#
# The source tree is ground truth and is never written to: everything is
# copied into generated/book/ and built there.
#
# Two knobs, both used by scripts/wrap-ab.sh:
#
#   BOOK_OUT    build directory            (default generated/book)
#   BOOK_WRAP   picins | trigfig           (default picins)
#
# BOOK_WRAP=trigfig puts tex/wrap-trigfig/ first on TEXINPUTS.  That directory
# holds a picins.sty which forwards to our own trigfig.sty, so the source's
# \usepackage{picins} resolves to the replacement and the vendored nonfree
# picins is never read -- again without editing a line of the source.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/mecmath-trigonometry"
OUT="${BOOK_OUT:-$ROOT/generated/book}"
WRAP="${BOOK_WRAP:-picins}"

case "$WRAP" in
  picins)  export TEXINPUTS="$ROOT/tex:" ;;
  trigfig) export TEXINPUTS="$ROOT/tex/wrap-trigfig:$ROOT/tex:" ;;
  *) echo "error: BOOK_WRAP must be picins or trigfig (got '$WRAP')" >&2; exit 1 ;;
esac
export TEXMFHOME="$ROOT/vendor/texmf"

for tool in latex makeindex dvips ps2pdf mktexlsr; do
  command -v "$tool" >/dev/null || { echo "error: $tool not found" >&2; exit 1; }
done

mktexlsr "$TEXMFHOME" >/dev/null

# Preflight: name the Ubuntu package for anything missing, rather than letting
# latex fail 200 lines into a run.
declare -A provides=(
  [scrbook.cls]=texlive-latex-recommended
  [tikz.sty]=texlive-pictures
  [shadethm.sty]=texlive-latex-extra
  [nomencl.sty]=texlive-latex-extra
  [breakurl.sty]=texlive-latex-extra
  [beramono.sty]=texlive-fonts-extra
  [fouriernc.sty]="vendor/texmf (scripts/vendor-texmf.sh)"
  [phaistos.sty]="vendor/texmf (scripts/vendor-texmf.sh)"
)
if [ "$WRAP" = picins ]; then
  provides[picins.sty]="vendor/texmf (scripts/vendor-texmf.sh)"
else
  provides[trigfig.sty]="tex/ (it is part of this repo)"
fi
missing=0
for sty in "${!provides[@]}"; do
  kpsewhich "$sty" >/dev/null 2>&1 || { echo "error: $sty not found -- install ${provides[$sty]}" >&2; missing=1; }
done
[ "$missing" -eq 0 ] || exit 1

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$SRC"/*.tex "$SRC"/*.eps "$SRC"/*.ist "$OUT/"
cd "$OUT"

# \RequirePackage before \documentclass lets the shims register kernel hooks;
# -jobname keeps the .aux/.idx/.nlo names the source expects.
run_latex() {
  latex -interaction=nonstopmode -halt-on-error -file-line-error \
        -jobname=trigbook '\RequirePackage{trigbook-compat}\input{trigbook.tex}'
}

echo "==> pass 1"; run_latex >pass1.log
makeindex -s myindex.ist -o trigbook.ind trigbook.idx
echo "==> pass 2"; run_latex >pass2.log
makeindex trigbook.nlo -s nomencl.ist -o trigbook.nls
echo "==> pass 3"; run_latex >pass3.log
echo "==> pass 4"; run_latex >pass4.log

echo "==> dvips"
dvips -Ppdf -t letter -G0 -z trigbook.dvi -o trigbook.ps

# -dUseCIEColor was in the upstream script; Ghostscript has recommended
# against it for the pdfwrite family since 9.11 and now warns about it.
echo "==> ps2pdf"
ps2pdf -dMaxSubsetPct=100 -dSubsetFonts=true -dEmbedAllFonts=true \
       -dPDFSETTINGS=/printer -dCompatibilityLevel=1.7 \
       trigbook.ps trigbook.pdf

echo
echo "Built $OUT/trigbook.pdf  (wrap: $WRAP)"
grep -a "Output written" pass4.log
