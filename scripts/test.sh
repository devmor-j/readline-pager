#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Build native addon
node-gyp rebuild

# Build JS
npx tsdown --config "$ROOT/tsdown.config.ts"

# Ensure coverage dir exists
mkdir -p "$ROOT/coverage"

# Run tests with coverage
node --test \
  --experimental-test-coverage \
  --experimental-strip-types \
  --enable-source-maps \
  --test-concurrency=4 \
  --test-reporter=spec \
  --test-reporter-destination=stdout \
  --test-reporter=lcov \
  --test-reporter-destination="$ROOT/coverage/lcov.info" \
  "$ROOT/test/cleanup.test.ts" \
  "$ROOT/test/content.test.ts" \
  "$ROOT/test/errors.test.ts" \
  "$ROOT/test/iterate.test.ts"

# Generate coverage badge
npx lcov-badge2 "$ROOT/coverage/lcov.info" -o "$ROOT/coverage.svg"
