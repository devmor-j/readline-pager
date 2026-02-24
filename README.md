# readline-pager

Memory-efficient, paginated file reader for Node.js with async iteration, prefetching, backward reading and optional worker support.

`readline-pager` reads large text files page-by-page without loading the entire file into memory.

- ✅ Zero dependencies
- ✅ Async iterator support (`for await...of`)
- ✅ Forward & backward reading (read from EOF → BOF)
- ✅ Optional worker thread mode (forward only)
- ✅ Up to ~3× faster than vanilla Node.js `readline`
- ✅ ~97% test coverage & Fully typed (TypeScript)

---

## Installation

```bash
npm install readline-pager
```

---

## Quick Start

```ts
import { createPager } from "readline-pager";

const pager = createPager("./bigfile.txt");

for await (const page of pager) {
  console.log(page[0]); // first line of the current page
}
```

---

## Manual iteration (recommended for max throughput)

```ts
const pager = createPager("./bigfile.txt");

let page;
while ((page = await pager.next()) !== null) {
  // page: string[]
  // process page
}
```

`pager.next()` returns:

- `Promise<string[]>` — next page
- `Promise<null>` — end of file

> Use `while + next()` when raw throughput matters (see Iteration Performance Notes).

---

## Options

```ts
createPager(filepath, {
  pageSize?: number,      // default: 1_000
  delimiter?: string      // default: "\n"
  prefetch?: number,      // default: 1
  backward?: boolean,     // default: false
  useWorker?: boolean,    // default: false (forward only)
});
```

- `pageSize` — number of lines per page.
- `delimiter` — line separator.
- `prefetch` — max pages buffered internally. Higher increases throughput but uses more memory.
- `backward` — read file from end → start (not supported with `useWorker`).
- `useWorker` — move parsing to a worker thread (forward only).

---

## API

### `pager.next(): Promise<string[] | null>`

Returns the next page or `null` when finished. Empty lines are preserved.

**Note:** Unlike Node.js `readline`, which skips empty files or empty lines at the start, `readline-pager` always returns all lines.

- A completely empty file (`0` bytes) produces `[""]` on the first read.
- A file with multiple empty lines returns each line as an empty string (e.g., `["", ""]` for two empty lines). Node.js `readline` would emit fewer or no `line` events in these cases.

✅ Key points:

- A 0-byte file → `[""]`
- Consecutive `\n\n` → `["", ""]`
- Node.js `readline` skips first empty line(s) and might emit nothing for empty files.

### `pager.close(): void`

Stops reading and releases resources immediately. Safe to call any time.

### Properties

```ts
pager.lineCount; // total lines emitted so far
pager.firstLine; // first line emitted (available after first read)
pager.lastLine; // last line emitted (updated each page)
```

---

## Benchmark

Run the included benchmark:

```bash
# default run
node test/benchmark.ts

# or customize
node test/benchmark.ts --lines=20000 --page-size=500 --prefetch=4 --backward
```

Benchmarks were executed on a high-end consumer Linux machine (SSD + fast CPU) using generated files.

### Summary (averages)

| Lines       | File Size (MB) | Implementation | Avg Time (ms) | Avg Throughput (MB/s) | Speedup vs `readline` |
| ----------- | -------------- | -------------- | ------------- | --------------------: | --------------------: |
| 1,000,000   | 35.29 MB       | readline       | 100.21        |                352.31 |                     — |
| 1,000,000   | 35.29 MB       | readline-pager | 43.31         |                815.71 |      **2.32× faster** |
| 10,000,000  | 352.86 MB      | readline       | 802.61        |                439.80 |                     — |
| 10,000,000  | 352.86 MB      | readline-pager | 292.33        |               1207.77 |      **2.75× faster** |
| 100,000,000 | 3528.59 MB     | readline       | 7777.52       |                453.75 |                     — |
| 100,000,000 | 3528.59 MB     | readline-pager | 2742.99       |               1286.50 |      **2.83× faster** |

**Key takeaways**

- `readline-pager` is consistently **~2.3×–2.8× faster** than Node.js `readline`.
- Relative gain increases with file size.
- Sustained throughput exceeds **1.2 GB/s** on large files (machine-dependent).

---

## Iteration performance notes

- **Fastest**: manual `while ((page = await pager.next()) !== null) { ... }`
  Avoids async-iterator protocol overhead and microtask churn.

- **More ergonomic**: `for await (const page of pager) { ... }`
  Cleaner but slightly slower in hot paths.

**Recommendation:** use the explicit `next()` loop for benchmarks and performance-critical code; use `for await...of` for clarity in less performance-sensitive code.

---

## Development & Contributing

- Minimum supported Node.js: **18.12+** (LTS).
- Development/test environment used by the author: **Node v25.6.1**, TypeScript `~5.9.x`.
- To run tests & coverage:

```bash
npm ci
npm test
```

If you want to contribute, open an issue or PR. A `CONTRIBUTING.md` is welcome for larger workflow notes.

---

## License

MIT — © Morteza Jamshidi
