#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "${1:-}" in
deno)
  shift
  deno --allow-write --allow-read --allow-env --allow-sys --allow-ffi "$ROOT/test/benchmark.ts" "$@"
  ;;
bun)
  shift
  bun "$ROOT/test/benchmark.ts" "$@"
  ;;
node)
  shift
  node "$ROOT/test/benchmark.ts" "$@"
  ;;
--help | -h)
  echo "Usage: $0 [node|deno|bun] [benchmark-flags...]"
  echo ""
  echo "Run benchmark with the specified runtime (default: node)."
  echo "All remaining arguments are forwarded to the benchmark script."
  exit 0
  ;;
*)
  # default to node, pass all args through
  node "$ROOT/test/benchmark.ts" "$@"
  ;;
esac
