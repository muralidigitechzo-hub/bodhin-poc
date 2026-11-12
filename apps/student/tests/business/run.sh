#!/bin/bash
# Business-rule tests: run the real src/api/client.ts against the mock DB in Node.
# Usage (from apps/student):  bash tests/business/run.sh
# After the backend is connected, keep these rules as server tests (see docs/BACKEND_INTEGRATION.md).
set -e
APP=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$(mktemp -d)
for t in "$APP"/tests/business/*.test.ts; do
  echo "▶ $(basename "$t")"
  npx --yes esbuild@0.24.0 "$t" --bundle --platform=node --format=cjs --log-level=error \
    --alias:@="$APP/src" --external:pyodide --external:sql.js --outfile="$OUT/t.cjs" \
    --banner:js="globalThis.setTimeout=(f)=>{Promise.resolve().then(f);return 0};"
  NODE_PATH="$APP/node_modules" node "$OUT/t.cjs"
done
