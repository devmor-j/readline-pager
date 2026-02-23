# pagereader

Memory-efficient paginated text file reader for Node.js (v18.12+) with async iteration, prefetching, and optional worker support.

Reads large text files page-by-page (array of lines) without loading the entire file into memory.

- ✅ Zero dependencies
- ✅ Async iterator support
- ✅ Forward and backward reading
- ✅ Optional worker thread mode
- ✅ Fully typed (TypeScript)
- ✅ ~2.8x faster than Node.js `readline` pacakge

---

## 📦 Installation

```bash
npm install pagereader
```

---

## 🚀 Basic Usage

```js
import { createPageReader } from "pagereader";

const pageReader = createPageReader("./bigfile.txt");

for await (const page of pageReader) {
  console.log(page[0]); // First line of current page
}
```

---

## 🔁 Manual Iteration

```js
// This is the faster usage (refer to [Iteration Performance Notes](#iteration-performance-notes))

const pageReader = createPageReader("./bigfile.txt");

while (true) {
  const page = await pageReader.next();
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
createPageReader(filepath, {
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

### reader.next()

```ts
Promise<string[] | null>;
```

Returns the next page or `null` when finished.

---

### reader.close()

Stops reading and releases resources.

Safe to call at any time.

---

## 📝 Properties

```ts
reader.lineCount; // total lines emitted so far
reader.firstLine; // first line in file (when known)
reader.lastLine; // last line in file (when known)
```

## ⚡ Benchmark

Minimal benchmark to measure read performance:

```bash
# rely on default options
node test/benchmark.js
# or pass your own options
node test/benchmark.ts --lines=20000 --page-size=500 --prefetch=4 --backward
```

It will output:

```
Took `t`ms to read `x` lines with page size of `y`
```

### Benchmark Report Using [hyperfine](https://github.com/sharkdp/hyperfine)

These results were obtained on a high-end consumer Linux machine with a 5.5GHz CPU & SSD with read speed upto 7GB/s.

#### Lines = 1,000

| pageSize | mean time (ms) | range (ms)  |
| -------- | -------------- | ----------- |
| 1        | 43.5           | 35.1 – 56.2 |
| 100      | 42.2           | 33.8 – 59.6 |
| 1000     | 41.9           | 34.3 – 54.7 |

---

#### Lines = 1,000,000

| pageSize | mean time (ms) | range (ms)    |
| -------- | -------------- | ------------- |
| 1        | 724.2          | 688.1 – 743.0 |
| 100      | 494.0          | 462.0 – 536.6 |
| 1000     | 501.2          | 476.8 – 534.8 |

---

#### Lines = 10,000,000

| pageSize | mean time (s) | range (s)     |
| -------- | ------------- | ------------- |
| 1        | 5.615         | 5.370 – 5.839 |
| 100      | 3.514         | 3.373 – 3.801 |
| 1000     | 3.560         | 3.410 – 3.713 |

---

### 📌 Observations

- For **small files (1k lines)**, page size barely matters — all results are within ~1ms.
- For **large files (1M+ lines)**, `pageSize = 1` is dramatically slower (≈1.5× slower at 1M or 10M).
- Beyond `pageSize = 100`, gains flatten — 100 and 1000 perform nearly the same.
- Best overall balance across all datasets appears around **pageSize = 100–1000**.
- Extremely large page sizes do not meaningfully outperform 1000.
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

### VS Native Node.js `readline`

```ts
// readline (native method)
const lineReader = createInterface(createReadStream(filepath));
for await (const _ of lineReader) {
}

// readpage (this pacakge)
const reader = createPageReader(filepath);
for await (const _ of lineReader) {
}

// compare for yourself; with default options,
// on my machine gains are between 2.5x-3.1x (average ~2.8x)
```

---

## Iteration Performance Notes

### ⚡ Recommended: `while` + `next()`

For maximum performance, prefer explicit iteration using `next()`:

```ts
let page;
while ((page = await reader.next()) !== null) {
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
for await (const page of reader) {
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
