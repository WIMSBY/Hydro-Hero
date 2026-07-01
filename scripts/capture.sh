#!/usr/bin/env bash
#
# capture.sh — grab an App Store-ready screenshot from a booted simulator.
#
# Usage:
#   ./scripts/capture.sh <label> [iphone|ipad|watch]
#
#   <label>     filename (without extension) for the screenshot, e.g. home-01
#   [category]  optional; only needed if more than one simulator is booted
#               (e.g. an iPhone + paired Watch). One of: iphone | ipad | watch
#
# What it does:
#   1. Finds the booted simulator (auto-detects iPhone / iPad / Watch).
#   2. Captures a screenshot at native resolution.
#   3. Strips the alpha channel — App Store Connect rejects screenshots that
#      contain transparency, and every simulator capture has an alpha channel.
#   4. Saves the upload-ready PNG to ~/Desktop/asc-<category>/ready/<label>.png
#
# Examples:
#   ./scripts/capture.sh home-01            # single booted sim
#   ./scripts/capture.sh watch-01 watch     # pick the Watch when several booted
#
set -euo pipefail

LABEL="${1:-}"
CATEGORY="$(printf '%s' "${2:-}" | tr '[:upper:]' '[:lower:]')"

if [[ -z "$LABEL" ]]; then
  echo "Usage: $(basename "$0") <label> [iphone|ipad|watch]"
  echo "  e.g. $(basename "$0") home-01 iphone"
  exit 1
fi

category_of() {
  local n; n="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  if [[ "$n" == *ipad* ]]; then echo ipad
  elif [[ "$n" == *watch* ]]; then echo watch
  else echo iphone; fi
}

# --- collect booted simulators --------------------------------------------
declare -a UDIDS NAMES
while IFS= read -r line; do
  [[ "$line" == *"(Booted)"* ]] || continue
  trimmed="${line%% (Booted)*}"          # drop ' (Booted)' and trailing text
  udid="${trimmed##*\(}"; udid="${udid%\)}"   # last (...) group = UDID
  name="${trimmed% (*}"                  # everything before ' (UDID)'
  name="${name#"${name%%[![:space:]]*}"}"     # left-trim whitespace
  UDIDS+=("$udid"); NAMES+=("$name")
done < <(xcrun simctl list devices booted)

if [[ ${#UDIDS[@]} -eq 0 ]]; then
  echo "No booted simulator found. Boot one in Simulator first." >&2
  exit 2
fi

# --- choose the target device ---------------------------------------------
TARGET_UDID=""; TARGET_NAME=""
for i in "${!UDIDS[@]}"; do
  c="$(category_of "${NAMES[$i]}")"
  if [[ -n "$CATEGORY" && "$c" != "$CATEGORY" ]]; then continue; fi
  if [[ -n "$TARGET_UDID" ]]; then
    echo "Multiple booted simulators match. Re-run with a category: iphone|ipad|watch" >&2
    echo "Booted: ${NAMES[*]}" >&2
    exit 3
  fi
  TARGET_UDID="${UDIDS[$i]}"; TARGET_NAME="${NAMES[$i]}"
done

if [[ -z "$TARGET_UDID" ]]; then
  echo "No booted simulator matches category '${CATEGORY}'." >&2
  echo "Booted: ${NAMES[*]}" >&2
  exit 4
fi

CAT="$(category_of "$TARGET_NAME")"
OUTDIR="$HOME/Desktop/asc-$CAT/ready"
mkdir -p "$OUTDIR"
OUT="$OUTDIR/$LABEL.png"

# --- capture + flatten alpha (PNG -> JPEG -> PNG drops the alpha channel) --
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
xcrun simctl io "$TARGET_UDID" screenshot "$TMP/raw.png" >/dev/null
sips -s format jpeg -s formatOptions 100 "$TMP/raw.png" --out "$TMP/flat.jpg" >/dev/null 2>&1
sips -s format png "$TMP/flat.jpg" --out "$OUT" >/dev/null 2>&1

# --- report ----------------------------------------------------------------
W="$(sips -g pixelWidth  "$OUT" | awk '/pixelWidth/{print $2}')"
H="$(sips -g pixelHeight "$OUT" | awk '/pixelHeight/{print $2}')"
A="$(sips -g hasAlpha    "$OUT" | awk '/hasAlpha/{print $2}')"

echo "Captured from : $TARGET_NAME"
echo "Category      : $CAT"
echo "Saved         : $OUT"
echo "Size / alpha  : ${W} x ${H}  (alpha: ${A})"

# Map the actual pixel size to the App Store Connect slot it belongs in.
case "${W}x${H}" in
  1320x2868|2868x1320|1290x2796|2796x1290) SLOT='iPhone 6.9-inch Display';;
  1242x2688|2688x1242|1284x2778|2778x1284) SLOT='iPhone 6.5-inch Display';;
  2064x2752|2752x2064|2048x2732|2732x2048) SLOT='iPad 13-inch Display';;
  410x502|502x410)                         SLOT='Apple Watch Ultra';;
  416x496|496x416)                         SLOT='Apple Watch Series 10 (46mm)';;
  396x484|484x396)                         SLOT='Apple Watch (45mm)';;
  368x448|448x368)                         SLOT='Apple Watch (44mm)';;
  *) SLOT='UNRECOGNIZED — not a standard ASC size, double-check before upload';;
esac
echo "ASC slot      : $SLOT"
