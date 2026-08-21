#!/usr/bin/env bash
# A/B the picins build against the trigfig build, page image by page image.
#
# Removing picins is only safe if the pages do not move, so this is the gate:
# it builds both variants, rasterises every page of both, and reports the
# per-page RMSE.  Anything above --threshold is listed with a side-by-side
# image so the difference can be looked at rather than guessed about.
#
#   scripts/wrap-ab.sh                 build both, compare, report
#   scripts/wrap-ab.sh --reuse         skip builds, compare what is there
#   scripts/wrap-ab.sh --dpi 150       rasterise finer (default 100)
#   scripts/wrap-ab.sh --threshold 0.001
#
# As of the last run: 269 of 270 pages compare at RMSE 0.  Page 241 differs at
# 0.125 -- a ~3.6pt vertical gap after equation 6.10 on printed page 233, with
# identical line breaks and text.  See the header of tex/trigfig.sty.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AB="$ROOT/generated/ab"
DPI=100
THRESHOLD=0.0005      # ~0.05% RMSE: below this is antialiasing, not layout
REUSE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --reuse)     REUSE=1; shift ;;
    --dpi)       DPI="$2"; shift 2 ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    *) echo "usage: $0 [--reuse] [--dpi N] [--threshold F]" >&2; exit 2 ;;
  esac
done

for tool in pdftoppm compare pdfinfo; do
  command -v "$tool" >/dev/null || {
    echo "error: $tool not found -- install poppler-utils and imagemagick" >&2; exit 1; }
done

if [ "$REUSE" -eq 0 ]; then
  echo "==> building picins baseline"
  BOOK_OUT="$AB/picins"  BOOK_WRAP=picins  "$ROOT/scripts/build-book.sh" >"$AB-picins.log" 2>&1 \
    || { echo "picins build failed; see $AB-picins.log" >&2; exit 1; }
  echo "==> building trigfig candidate"
  BOOK_OUT="$AB/trigfig" BOOK_WRAP=trigfig "$ROOT/scripts/build-book.sh" >"$AB-trigfig.log" 2>&1 \
    || { echo "trigfig build failed; see $AB-trigfig.log" >&2; exit 1; }
fi

A="$AB/picins/trigbook.pdf"
B="$AB/trigfig/trigbook.pdf"
for f in "$A" "$B"; do
  [ -f "$f" ] || { echo "error: $f missing -- run without --reuse" >&2; exit 1; }
done

pages_a=$(pdfinfo "$A" | awk '/^Pages:/{print $2}')
pages_b=$(pdfinfo "$B" | awk '/^Pages:/{print $2}')
echo
echo "picins  : $pages_a pages"
echo "trigfig : $pages_b pages"
if [ "$pages_a" != "$pages_b" ]; then
  echo
  echo "PAGE COUNT DIFFERS -- the notch arithmetic is off somewhere; fix that first."
  exit 1
fi

echo "==> rasterising at ${DPI}dpi (this takes a minute)"
rm -rf "$AB/png"; mkdir -p "$AB/png/a" "$AB/png/b" "$AB/diff"
pdftoppm -r "$DPI" -png -gray "$A" "$AB/png/a/p"
pdftoppm -r "$DPI" -png -gray "$B" "$AB/png/b/p"

echo "==> comparing"
report="$AB/report.tsv"
: >"$report"
worst=0; worst_page=0; over=0
for f in "$AB"/png/a/p-*.png; do
  n="${f##*/p-}"; n="${n%.png}"
  g="$AB/png/b/p-$n.png"
  if [ ! -f "$g" ]; then echo "missing render for page $n" >&2; exit 1; fi
  # compare exits nonzero whenever the images differ at all, which under
  # `set -e` would end the run on the first differing page.
  raw=$(compare -metric RMSE "$f" "$g" null: 2>&1 || true)
  rmse=$(printf '%s' "$raw" | sed -n 's/.*(\([0-9.e-]*\)).*/\1/p')
  rmse=${rmse:-1}
  printf '%s\t%s\n' "$((10#$n))" "$rmse" >>"$report"
  if awk -v a="$rmse" -v b="$worst" 'BEGIN{exit !(a>b)}'; then worst=$rmse; worst_page=$((10#$n)); fi
  if awk -v a="$rmse" -v t="$THRESHOLD" 'BEGIN{exit !(a>t)}'; then
    over=$((over+1))
    compare "$f" "$g" "$AB/diff/page-$n.png" >/dev/null 2>&1 || true
  fi
done

echo
echo "pages over threshold ($THRESHOLD): $over of $pages_a"
echo "worst page: $worst_page at RMSE $worst"
if [ "$over" -gt 0 ]; then
  echo
  echo "worst 20:"
  sort -k2 -g -r "$report" | head -20 | awk '{printf "  page %-4s RMSE %s\n", $1, $2}'
  echo
  echo "difference images: $AB/diff/"
fi
echo "full table: $report"
