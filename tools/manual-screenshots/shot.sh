#!/bin/bash
# Retakes one user-manual screenshot (public/manuals/img/<name>.png).
#
# Setup (two terminals, from the repo root):
#   node tools/manual-screenshots/mock-api.cjs                 # made-up staff + patients
#   VITE_API_URL=http://localhost:8787 npx vite --port 5199
#   cp tools/manual-screenshots/preview.html __mytime_preview.html   (gitignored)
#
# Usage: tools/manual-screenshots/shot.sh <name> <role> <route> <width> <height> <action>
#   role:   staff | reception | admin | none
#   action: a step list from preview.html's ACTIONS, e.g. nextDay or profBalances,editHours
# Example: tools/manual-screenshots/shot.sh schedule staff / 1280 800 nextDay
cd "$(dirname "$0")/../.."
OUT=public/manuals/img
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
D=$(mktemp -d)
HASH=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote('|'.join(sys.argv[1:]),safe=''))" "$2" "$3" "$4" "$5" "$6")
"$CH" --headless=new --disable-gpu --user-data-dir=$D --hide-scrollbars --force-device-scale-factor=2 --window-size=$4,$5 --virtual-time-budget=16000 --screenshot=$OUT/$1.png "http://localhost:5199/__mytime_preview.html#$HASH" >/dev/null 2>&1 &
CPID=$!; for i in $(seq 1 50); do kill -0 $CPID 2>/dev/null || break; sleep 1; done; kill $CPID 2>/dev/null
rm -rf "$D"
echo "$OUT/$1.png"
