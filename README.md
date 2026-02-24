# 📄 readline-pager

Memory-efficient, paginated file reader for Node.js with async iteration, prefetching, backward reading, and optional worker support.

`readline-pager` reads large text files page-by-page without loading the entire file into memory.

- ✅ Zero dependencies
- ✅ Async iterator support (`for await...of`)
- ✅ Forward & backward reading (EOF → BOF)
- ✅ Optional worker thread mode (forward only)
- ✅ Up to ~3× faster than Node.js `readline`
- ✅ ~97% test coverage & fully typed (TypeScript)

---

## 📦 Installation

```bash
npm install readline-pager
```

---

## 🚀 Quick Start

```ts
import { createPager } from "readline-pager";

const pager = createPager("./bigfile.txt");

for await (const page of pager) {
  console.log(page[0]); // first line of the current page
}
```

---

## ⚡ Manual iteration (recommended for maximum throughput)

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

## ⚙️ Options

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
- `prefetch` — max number of pages buffered internally. Higher values increase throughput but use more memory.
- `backward` — read file from end → start (not supported with `useWorker`).
- `useWorker` — offload parsing to a worker thread (forward mode only).

---

## 📚 API

### `pager.next(): Promise<string[] | null>`

Returns the next page or `null` when finished. Empty lines are preserved.

**Note:** Unlike Node.js `readline`, which may skip empty files or leading empty lines, `readline-pager` always returns all lines.

- A completely empty file (`0` bytes) produces `[""]` on the first read.
- A file with multiple empty lines returns each line as an empty string (e.g., `["", ""]` for two empty lines). Node.js `readline` may emit fewer or no `line` events in these cases.

✅ Key points:

- A 0-byte file → `[""]`
- Consecutive `\n\n` → `["", ""]`
- Node.js `readline` may skip initial empty line(s) and emit nothing for empty files.

### `pager.close(): void`

Stops reading and releases resources immediately. Safe to call at any time.

### Properties

```ts
pager.lineCount; // total lines emitted so far
pager.firstLine; // first line emitted (available after first read)
pager.lastLine; // last line emitted (updated per page)
```

---

## 📊 Benchmark

Run the included benchmark:

```bash
# default run
node test/_benchmark.ts

# customize
node test/_benchmark.ts --lines=20000 --page-size=500 --prefetch=4 --backward
```

Benchmarks were executed on a high-end Linux machine (SSD + fast CPU) using generated files.

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
- Relative performance gains increase with file size.
- Sustained throughput exceeds **1.2 GB/s** on large files (machine-dependent).

---

## 🧠 Iteration Performance Notes

- **Fastest**: manual
  `while ((page = await pager.next()) !== null) { ... }`
  Avoids async-iterator protocol overhead and microtask churn.

- **More ergonomic**:
  `for await (const page of pager) { ... }`
  Cleaner, but slightly slower in hot paths.

**Recommendation:** use the explicit `next()` loop for benchmarks and performance-critical workloads; use `for await...of` for clarity elsewhere.

---

## 🛠 Development & Contributing

- Minimum supported Node.js: **18.12+** (LTS).
- Development/test environment: **Node v25.6.1**, TypeScript `~5.9.x`.

Run tests:

```bash
npm ci
npm test
```

Contributions are welcome — feel free to open an issue or PR.

---

## 📜 License

MIT — © Morteza Jamshidi
