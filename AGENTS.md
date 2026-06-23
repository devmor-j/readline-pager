# readline-pager — Agent Working Notes

## Repository Overview

High-performance paginated file reader for Node.js. Processes large text files without loading them into memory. Offers both JavaScript and native C++ implementations, forward/backward reading, and async/sync iteration.

**Key Stats:** 100% coverage target, zero external dependencies, ~3× faster than Node.js `readline` (JS), ~6× faster with native C++.

## Exact Commands

### Setup & Build

```bash
npm i
npm run build      # builds JS + native addon
npm test          # runs tests with coverage
npm run benchmark:node
```

### Test Patterns

```bash
# Single test file
node --test test/files.test.ts

# Single test
node --test --test-name-pattern="empty file" test/**/*.test.ts

# Coverage report
npm run test:coverage
```

## Architecture

### Source Layout

```text
src/
  main.ts              # pager factory, exports createPager/createNativePager
  types.ts             # Pager, PagerOptions, ReaderOptions interfaces
  helper.ts            # createRingBuffer utility
  reader/
    forward.reader.ts  # async/sync forward reader
    backward.reader.ts # async/sync backward reader
  native.ts            # native addon factory (uses @node-rs/native-bundle-loader)

test/
  all.test.ts          # full test suite with validation/files/api/stress/coverage suites
  utils.ts             # createTmpFile, createTextLines, benchmark helpers
  benchmark.ts         # CLI benchmark tool
```

### Native Addon (C++)

- C++23, N-API module
- Uses `mmap` + `madvise` for zero-copy forward reads; backward reads allocate memory
- SIMD vectorization (AVX2/NEON) for delimiter scanning
- Background `std::jthread` feeds bounded power-of-two ring buffer
- Atomic reference counting bridges N-API, background thread, and V8 finalizers
- Limited to single-character delimiters (SIMD-based)

### Important Options

| Option | Default | Notes |
|--------|---------|-------|
| `chunkSize` | 64 KiB | Strongly affects performance; tune per storage device |
| `pageSize` | 1,000 | Lines per page returned |
| `prefetch` | 8 | Internal page buffer size |
| `delimiter` | `\n` | Line separator |
| `backward` | `false` | Read from end to start |
| `output` | `"string"` | `"string"` or `"buffer"` (raw chunks) |

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

## Testing Conventions

- Tests use `createTmpFile` to write to `./tmp/test/` with UUID filenames
- Sync iterator (`for...of`) cleanup runs in a `finally` block and properly closes the `FileHandle`

## Build Artifacts

- `dist/main.cjs` — CommonJS
- `dist/main.mjs` — ESM
- `dist/main.d.mts` — TypeScript declarations
- `coverage/lcov.info` — Coverage data
- `coverage.svg` — Badge (regenerated via `npm run test:coverage`)

## Operational Gotchas

1. **Iterator cleanup**: Sync iterator (`for...of`) cleanup runs in a `finally` block that closes both the sync fd and the async `FileHandle`. Breaking out of `for...of` or exhausting the loop is safe — cleanup handles both. Manual users must still explicitly `await pager.close()`.

2. **Truncation handling**: If a file is truncated mid-read, both readers handle it gracefully by returning empty pages until EOF.

3. **Native mode limitations**: `createNativePager` requires x86 AVX2 or ARM NEON, throws on unsupported CPUs, and does not support multi-character delimiters.

4. **Buffer output integrity**: When using `output: "buffer"`, pages are raw `Buffer` objects. Concatenate them (reversing for backward reads) to reconstruct the original file content.

5. **Test environment**: Tests require Node.js v26.x and TypeScript v6.x for the dev environment; minimum runtime is v18.12.

## Common Patterns

```ts
// Async iterator
for await (const page of createPager("file.txt", { pageSize: 1000 })) {
  console.log(page[0]);
}

// Manual async
const pager = createPager("file.txt", { pageSize: 1000 });
while (true) {
  const page = await pager.next();
  if (!page) break;
  // process page
}
await pager.close();

// Manual sync
let pager = createPager("file.txt", { pageSize: 1000 });
while (true) {
  const page = pager.nextSync();
  if (!page) break;
  // process page
}
pager.close();

// Buffer output
const pager = createPager("file.txt", { output: "buffer", pageSize: 1 });
const chunks: Buffer[] = [];
for await (const chunk of pager) chunks.push(chunk);
const original = Buffer.concat(chunks);
```

## Code Style & Conventions

- ESM by default (`type: module` in `package.json`)
- Strict TypeScript (`"strict": true`)
- No external dependencies — only Node.js built-ins
- Keep PRs small and focused
- Maintain 90%+ line coverage
- Maintain existing API shape; breaking changes require issue discussion
- Must work for both ESM and CommonJS consumers via dual exports
- No external dependencies ever

## Type Details

- `Output` = `"string" | "buffer"`
- `PageOutput` = `string[] | Buffer`
- `ResolvePageOutput<T>` = `T extends "buffer" ? Buffer : string[]`
