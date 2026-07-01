# readline-pager — Agent Working Notes

## Repository Overview

High-performance paginated file reader for Node.js. Processes large text files without loading them into memory. Offers both JavaScript and native C++ implementations, forward/backward reading, and async/sync iteration.

**Key Stats:** 100% coverage target, zero external dependencies, ~3× faster than Node.js `readline` (JS), ~6× faster with native C++.

## Codemem

MANDATORY: Before ANY file operation, load `.claude/skills/codemem/SKILL.md`. No exceptions.

MEMORY RULE: Save user decisions, preferences, and project rules as `codemem` memories.
If I say "always do X" or "I prefer Y" — store it.

## Code Quality Rules

- Never organize or group imports — instead, run `npm run prettier` before done (the `prettier-plugin-organize-imports` plugin auto-sorts them).
- No external dependencies ever — only Node.js built-ins.

## Exact Commands

```bash
npm i
npm run build              # builds native (node-gyp) + JS (tsdown)
npm test                   # runs tests with c8 coverage
npm run benchmark          # default Node.js
npm run benchmark -- deno  # or bun
npm run prettier           # format + sort imports
npm run test:coverage      # regenerate coverage.svg badge
```

### Test Patterns

```bash
# Single test file
node --test test/files.test.ts

# Single test
node --test --test-name-pattern="empty file" test/**/*.test.ts
```

Tests import from `../dist/main.mjs` — build first or they fail.

## Architecture

### Source Layout

```text
src/
  main.ts              # exports createPager (JS factory)
  native.ts            # exports createNativePager (C++ addon factory)
  types.ts             # Pager, PagerOptions, ReaderOptions interfaces
  helper.ts            # createRingBuffer utility
  reader/
    forward.reader.ts  # async/sync forward reader
    backward.reader.ts # async/sync backward reader
  native/
    pager.native.cc    # C++23 N-API module (mmap + SIMD)

test/
  cleanup.test.ts      # resource teardown (5 tests)
  errors.test.ts       # construction rejection, permissions (5 tests)
  iterate.test.ts      # iteration correctness, boundaries, truncation (8 tests)
  content.test.ts      # returned-page correctness (6 tests)
  utils.ts             # createTmpFile, createTextLines, benchmark helpers
  benchmark.ts         # CLI benchmark tool
```

### Key Architecture Details

- **Dual-FD pattern**: Both readers open TWO file descriptors — one sync (`openSync`) for `nextSync()`, one async (`fs/promises.open`) for the background prefetch loop. They are closed independently.
- **Async prefetch**: A voided IIFE starts on construction, fills a ring buffer to `prefetch` depth, and yields via `setImmediate` between fill bursts. `flushTail()` pushes remaining data as the final page.
- **Ring buffer** (`helper.ts`): Grows dynamically (doubles on full). The async `shift(done)` method waits on a consumer-waiter promise when empty. `wake()` resolves pending waiters (used by `close()`).
- **Native cleanup**: `native.ts` uses fire-and-forget `void close().catch(() => {})` in `Symbol.dispose` and sync iterator `finally` blocks.

### API Contract

```ts
Pager<T> {
  next(): Promise<ResolvePageOutput<T> | null>;
  nextSync(): ResolvePageOutput<T> | null;
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<ResolvePageOutput<T>>;
  [Symbol.iterator](): Iterator<ResolvePageOutput<T>>;
  [Symbol.asyncDispose](): Promise<void>;
  [Symbol.dispose](): void;
}
```

- Returns `null` at EOF
- Empty file → `[""]` on first read
- Empty lines preserved; do not signal EOF
- `close()` must be called or rely on iterator `finally` to cleanup

### Important Options

| Option | Default | Notes |
|--------|---------|-------|
| `chunkSize` | 64 KiB | Strongly affects performance; tune per storage device |
| `pageSize` | 1,000 | Lines per page returned |
| `prefetch` | 8 | Internal page buffer size |
| `delimiter` | `\n` | Line separator |
| `backward` | `false` | Read from end to start |
| `output` | `"string"` | `"string"` or `"buffer"` (raw chunks) |

## Testing Conventions

- Tests use `createTmpFile` to write to `./tmp/test/` with UUID filenames
- Tests use Node.js built-in test runner: `suite`/`test` from `node:test`, `assert` from `node:assert`
- Test cleanup uses `try/finally` with `tryDeleteFile(filepath)`
- All tests are async (even for sync-only paths)
- Test script runs: `c8 --reporter=text --reporter=lcov node --test --experimental-strip-types --enable-source-maps --test-concurrency=4 --test-timeout=120000 "test/**/*.test.ts"`

## Operational Gotchas

1. **Dual FD close**: The sync fd is closed in `fillSync()` when a sync read reaches EOF, the async fd is closed in the background IIFE `finally`. If using only `next()`, the sync fd stays open until `close()`.
2. **`Symbol.iterator` finally**: Closes both fds. The async fd is fire-and-forget (`fd.close().catch(() => {})`). Dispose cannot await.
3. **Native mode**: Requires x86 AVX2 or ARM NEON (throws on unsupported CPUs). Linux-only. No multi-character delimiters.
4. **Empty file**: Both readers push `[""]` (or empty `Buffer`) immediately on construction when `size === 0`. The async IIFE checks `done` flag to avoid double-push.
5. **Musl detection**: `isMusl()` in `native.ts` checks `process.report.getReport()` for `glibcVersionRuntime`.
6. **Backward reader**: Uses `lastIndexOf`, prepends to buffer, tracks `startsWithDelimiter` for leading-newline edge case. Page order is naturally reversed.
7. **Buffer output**: Pages are raw `Buffer` objects. Concatenate (reversing for backward) to reconstruct the original: `Buffer.concat(chunks)` / `Buffer.concat(chunks.toReversed())`.
8. **Build artifacts**: `dist/main.{cjs,mjs,d.mts}` + `dist/native.{cjs,mjs}`. Tests import from `dist/main.mjs`.
9. **Platform packages**: Optional dependencies (`@devmor-j/readline-pager-linux-{x64,arm64}`, musl variants) are published per-platform and loaded by platform detection in `native.ts`.

## Code Style & Conventions

- ESM by default (`type: module` in `package.json`)
- Strict TypeScript (`"strict": true`)
- No external dependencies
- Maintain 90%+ line coverage
- Must work for both ESM and CommonJS consumers via dual exports
- Run `npm run prettier` before committing (formats + sorts imports)

## Commit Rules

1. **Natural casing**: First letter capitalized, proper nouns/acronyms (SQL, Node.js, etc.) capitalized normally. Never force lowercase.
2. **No attributions**: No "Generated with", "Assisted by", or agent names in commit messages.

## Type Details

- `Output` = `"string" | "buffer"`
- `PageOutput` = `string[] | Buffer`
- `ResolvePageOutput<T>` = `T extends "buffer" ? Buffer : string[]`
- `Pager<T>` is generic — `next()` return type resolves based on `output` option
- `ReaderOptions`: `chunkSize, pageSize, delimiter, prefetch, output`
- `NativeReaderOptions`: `pageSize, delimiter, backward, output`

## Environment

- Minimum Node.js: 18.12, Dev: 26.x, TypeScript 6.x
- Bundler: `tsdown` v0.22.x, Native build: `node-gyp`
- CI: GitHub Actions (Linux x64 + arm64, Alpine for musl)
- MCP: `codemem` server configured in `.mcp.json`
