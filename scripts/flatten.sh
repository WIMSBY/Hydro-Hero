#!/usr/bin/env bash
#
# flatten.sh — strip the alpha channel from every PNG in a folder so the
# screenshots are accepted by App Store Connect (which rejects transparency).
#
# Usage:
#   ./scripts/flatten.sh <folder>
#
#   <folder>   folder containing raw .png screenshots, e.g. ~/Desktop/asc-iphone
#
# Output:
#   Flattened, upload-ready copies are written to <folder>/ready/, keeping the
#   original filenames and exact pixel dimensions.
#
set -euo pipefail

SRC="${1:-}"
if [[ -z "$SRC" || ! -d "$SRC" ]]; then
  echo "Usage: $(basename "$0") <folder-with-pngs>"
  echo "  e.g. $(basename "$0") ~/Desktop/asc-iphone"
  exit 1
fi

OUTDIR="$SRC/ready"
mkdir -p "$OUTDIR"

shopt -s nullglob nocaseglob
files=("$SRC"/*.png)
shopt -u nocaseglob

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No .png files found in $SRC" >&2
  exit 2
fi

count=0
for f in "${files[@]}"; do
  base="$(basename "$f")"
  out="$OUTDIR/$base"
  tmp="$(mktemp -t flatten).jpg"
  sips -s format jpeg -s formatOptions 100 "$f" --out "$tmp" >/dev/null 2>&1
  sips -s format png "$tmp" --out "$out" >/dev/null 2>&1
  rm -f "$tmp"
  w="$(sips -g pixelWidth "$out" | awk '/pixelWidth/{print $2}')"
  h="$(sips -g pixelHeight "$out" | awk '/pixelHeight/{print $2}')"
  a="$(sips -g hasAlpha "$out" | awk '/hasAlpha/{print $2}')"
  printf "  %-28s -> %s x %s (alpha: %s)\n" "$base" "$w" "$h" "$a"
  count=$((count + 1))
done

echo "Flattened $count file(s) into: $OUTDIR"
