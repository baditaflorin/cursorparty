#!/usr/bin/env bash
# Local CI substitute — runs the production build and verifies the docs/
# output contains the entry HTML and a JS bundle. No GitHub Actions.
set -euo pipefail

cd "$(dirname "$0")/.."

npm run build

if [ ! -f docs/index.html ]; then
  echo "smoke: docs/index.html missing"
  exit 1
fi

if ! ls docs/assets/*.js >/dev/null 2>&1; then
  echo "smoke: no JS bundle in docs/assets"
  exit 1
fi

if ! grep -q 'src="./assets/' docs/index.html && ! grep -q 'src="assets/' docs/index.html; then
  echo "smoke: docs/index.html does not reference assets/"
  exit 1
fi

echo "smoke: OK"
