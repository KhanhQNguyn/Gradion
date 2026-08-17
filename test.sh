#!/usr/bin/env bash
# Not `set -e`: we pipe `npm test` through `tee` below, and need the real
# exit code of `npm test` (via PIPESTATUS), not `tee`'s (which is always 0).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

# Tests never call Gemini — the backend suite injects a stub client
# (fake-client.js) for every test, the same code path GEMINI_FAKE=1 uses
# at runtime. This run never burns quota, regardless of what's in .env.
npm test 2>&1 | tee TEST-REPORT.txt
status="${PIPESTATUS[0]}"

echo ""
echo "Full output written to TEST-REPORT.txt"
exit "$status"
