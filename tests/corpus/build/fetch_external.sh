#!/usr/bin/env bash
# Download pdf.js's regression PDFs (Apache-2.0, https://github.com/mozilla/pdf.js/tree/master/test/pdfs)
# into tests/corpus/external/ as a hostile stress corpus. Not committed; re-run to refresh.
# Usage: tests/corpus/build/fetch_external.sh [max_bytes=300000]
set -euo pipefail
cd "$(dirname "$0")/../../.."
MAX="${1:-300000}"
DEST="tests/corpus/external"
mkdir -p "$DEST"
gh api "repos/mozilla/pdf.js/git/trees/master?recursive=1" \
  --jq ".tree[] | select(.type==\"blob\") | select(.path|startswith(\"test/pdfs/\")) | select(.path|endswith(\".pdf\")) | select(.size<=$MAX) | .path" \
  | sed 's#^test/pdfs/##' \
  | xargs -P 8 -I{} sh -c 'f="$1"; [ -s "'"$DEST"'/$f" ] || curl -fsSL -o "'"$DEST"'/$f" "https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/$f" || rm -f "'"$DEST"'/$f"' _ {}
echo "external corpus: $(ls "$DEST" | wc -l | tr -d ' ') files, $(du -sh "$DEST" | cut -f1)"
