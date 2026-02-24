# readline-pager

Memory-efficient paginated file reader for Node.js (v18.12+) with async iteration, prefetching, backward reading and optional worker support.

Reads large text files page-by-page (array of lines) without loading the entire file into memory. Uses Node.js `readline` under the hood.

- ✅ Zero dependencies
- ✅ Async iterator support
- ✅ Forward and backward reading
- ✅ Optional worker thread mode
- ✅ Fully typed (TypeScript)
- ✅ ~95% Test coverage
- ✅ ~2.5x Faster than vanilla Node.js `readline`

---

## 📦 Installation

```bash
npm install readline-pager
```

---

## 🚀 Basic Usage

```js
import { createPager } from "readline-pager";

const pager = createPager("./bigfile.txt");

for await (const page of pager) {
  console.log(page[0]); // First line of current page
}
```

---

## 🔁 Manual Iteration

```js
// This is the faster usage (refer to [Iteration Performance Notes])

const pager = createPager("./bigfile.txt");

while (true) {
  const page = await pager.next();
  if (!page) break;

  console.log(page[0]);
}
```

`next()` returns:

- `string[]` → next page
- `null` → end of file

> **Note:** using `if (!page) break;` is safe; because truthiness of `[""]` is not confused with `null`.

---

## ⚙️ Options

```ts
createPager(filepath, {
  pageSize?: number,      // default: 1000
  prefetch?: number,      // default: 1
  useWorker?: boolean,    // default: false
  backward?: boolean,     // default: false
  delimiter?: string      // default: "\n"
})
```

### pageSize

Number of lines per page.

### prefetch

Maximum number of pages buffered internally.

Higher values increase throughput but use more memory.

### useWorker

Reads file in a worker thread (forward mode only).

Use this only if you want file parsing off the main thread.

### backward

Reads file from end to start (not supported with `useWorker`).

### delimiter

Line separator. Default is `"\n"`.

---

## 🔌 API

### pager.next()

```ts
Promise<string[] | null>;
```

Returns the next page or `null` when finished. Empty lines are not skipped.

---

### pager.close()

Stops reading and releases resources immediately. Safe to call at any time.

---

## 📝 Properties

```ts
pager.lineCount; // total lines emitted so far
pager.firstLine; // first line read (available on first page read)
pager.lastLine; // last line read (available & updated on each page read)
```

## ⚡ Benchmark

Minimal benchmark to compare `readline` and `readline-pager`:

```bash
# rely on default options
node test/benchmark.js
# or pass your own options
node test/benchmark.ts --lines=20000 --page-size=500 --prefetch=4 --backward
```

Benchmarks were executed on a high-end consumer Linux machine with a 5.5GHz CPU & SSD with read speed upto 7GB/s using generated files (filled with random UUIDs).

### 📊 Summary (Average of Multiple Runs)

| Lines       | File Size (MB) | Implementation | Avg Time (ms) | Avg Throughput (MB/s) | Speedup vs `readline` |
| ----------- | -------------- | -------------- | ------------- | --------------------- | --------------------- |
| 1,000,000   | 35.29 MB       | readline       | 100.21        | 352.31                | —                     |
| 1,000,000   | 35.29 MB       | readline-pager | 43.31         | 815.71                | **2.32× faster**      |
| 10,000,000  | 352.86 MB      | readline       | 802.61        | 439.80                | —                     |
| 10,000,000  | 352.86 MB      | readline-pager | 292.33        | 1207.77               | **2.75× faster**      |
| 100,000,000 | 3528.59 MB     | readline       | 7777.52       | 453.75                | —                     |
| 100,000,000 | 3528.59 MB     | readline-pager | 2742.99       | 1286.50               | **2.83× faster**      |

---

### 🔎 Key Takeaways

- `readline-pager` is consistently **2.3×–2.8× faster** than Node.js `readline`
- Performance advantage increases with file size
- Sustained throughput exceeds **1.2 GB/s** on large files
- Scales efficiently up to multi-GB inputs

#### `pageSize` Impact

- For **small files (1k lines)**, page size barely matters — all results are within ~1ms.
- For **large files (1M+ lines)**, `pageSize = 1` is dramatically slower (≈1.5× slower at 1M or 10M).
- Beyond `pageSize = 100`, gains flatten — 100 and 1000 perform nearly the same.
- Best overall balance across all datasets appears around **pageSize = 100–1000**.
- Extremely large page sizes do not meaningfully outperform 1000 (ex. 5000).
- Performance scales roughly linearly with total line count when page size is reasonable.

#### `prefetch` Impact:

Prefetch is about:

- Reducing latency between next() calls
- Keeping pages ready in memory
- Smoothing consumer-side pauses

It helps when:

- The consumer does CPU work between pages.
- You use async iteration with intermittent delays.
- You want the next page already buffered when requested.

It does not help when:

- The consumer immediately calls next() again.
- Full-file sequential reading.
- Disk I/O and parsing are already the bottleneck.

---

## 📌 Iteration Performance Notes

### ⚡ Recommended: `while` + `next()`

For maximum performance, prefer explicit iteration using `next()`:

```ts
let page;
while ((page = await pager.next()) !== null) {
  // process page
}
```

**Why this is faster**

- Avoids async iterator protocol overhead
- Skips extra wrapper allocations
- Reduces microtask scheduling cost
- Gives tighter control over flow

In large datasets, this can result in **noticeably better throughput**, especially in hot paths.

---

### 🐢 Slower: `for await...of`

```ts
for await (const page of pager) {
  // process page
}
```

While cleaner and more idiomatic, this syntax:

- Uses the async iterator protocol
- Adds extra promise wrapping
- Introduces additional microtask scheduling
- Prevents certain internal optimizations

In benchmarks with large inputs, this pattern can be **measurably slower** than manual `next()` loops.

---

### Recommendation

> The tradeoff is: **ergonomics vs. raw performance.**

- Use `while + next()` in performance-critical paths.
- Use `for await...of` when readability is more important than raw speed.

If you are processing millions of lines or benchmarking throughput, prefer the explicit loop.
