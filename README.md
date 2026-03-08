# 📄 readline-pager

<p align="center">
  <img src="https://raw.githubusercontent.com/devmor-j/readline-pager/main/logo.webp" alt="logo" width="349">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/readline-pager">
    <img src="https://img.shields.io/npm/v/readline-pager?color=brightgreen" alt="version">
  </a>
  <img src="https://img.shields.io/npm/dw/readline-pager" alt="downloads">
  <img src="https://img.shields.io/github/stars/devmor-j/readline-pager" alt="stars">
</p>

⚡ Memory-efficient paginated file reader for Node.js with async and sync iteration, prefetching, backward reading, and optional worker support. `readline-pager` reads large text files page-by-page without loading the entire file into memory.

- ✅ Zero dependencies
- ✅ Async iterator (`for await...of`) + manual `next()` API
- ✅ Sync iterator (`for...of`) + manual `nextSync()` API
- ✅ Forward & backward reading (EOF → BOF)
- ✅ Optional worker thread mode (forward only)
- ✅ Up to ~3× faster than Node.js `readline`
- ✅ ~97% test coverage & fully typed (TypeScript)

> **Important:**  
> Performance depends heavily on the `chunkSize` option. Tune it for your specific I/O hardware. A value of **64 KB** is usually a good starting point. Increasing it may gradually improve throughput until reaching the optimal point for your hardware.

---

## 📦 Installation

```bash
npm install readline-pager
```

---

## 🚀 Quick start

```ts
import { createPager } from "readline-pager";
// const { createPager } = require("readline-pager");

const pager = createPager("./bigfile.txt");

// Async iteration
for await (const page of pager) {
  console.log(page[0]); // first line of the current page
}

// Sync iteration
for (const page of pager) {
}

// Classic while loop
while (true) {
  const page = await pager.next();
  if (!page) break;
}

// Precise condition while loop
let page;
while ((page = pager.nextSync()) !== null) {
  console.log(page[0]);
}
```

## ⚙️ Options

```ts
createPager(filepath, {
  chunkSize?: number,     // default: 64 * 1024 (64 KiB)
  pageSize?: number,      // default: 1_000
  delimiter?: string,     // default: "\n"
  prefetch?: number,      // default: 1
  backward?: boolean,     // default: false
  useWorker?: boolean,    // default: false (forward only)
});
```

- `chunkSize` — number of bytes read per I/O operation.
- `pageSize` — number of lines per page.
- `delimiter` — line separator.
- `prefetch` — maximum number of pages buffered internally. Usually not necessary to tune.
- `backward` — read the file from end → start (not supported with `useWorker`).
- `useWorker` — offload parsing to a worker thread (forward reading only).

---

## 📚 API

### `pager.next(): Promise<string[] | null>`

Returns the next page asynchronously.

Returns `null` when the end of the file is reached.

Empty lines are preserved.

---

### `pager.nextSync(): string[] | null`

Synchronous version of `pager.next()`.

Returns the next page immediately or `null` when the end of the file is reached.

---

### `pager.close(): Promise<void>`

Stops reading and releases resources asynchronously. Safe to call at any time.

---

**Note:**
Unlike Node.js `readline`, which may skip empty files or leading empty lines, `readline-pager` always returns all lines.

- A completely empty file (`0` bytes) produces `[""]` on the first read.
- A file containing multiple empty lines returns each line as an empty string (for example `["", ""]` for two empty lines).

## 📊 Benchmark

Run the included benchmark:

```bash
# default run
npm run benchmark

# or customize with args
node test/_benchmark.ts --lines=20000 --page-size=500 --backward
```

> Test setup: generated text files with uuid, run on a fast NVMe machine with default options; values are averages from multiple runs. Results are machine-dependent.
>
> The **Average Throughput (MB/s)** is computed for two strategies: reading files line by line and page by page.
>
> In addition to _Node_, the two other popular JavaScript runtimes were also tested with `readline-pager`.

### Line by line

| Runtime / Method | 1M lines (35 MB) | 10M lines (353 MB) | 100M lines (3,529 MB) | 1,000M lines (35,286 MB) |
| ---------------- | ---------------: | -----------------: | --------------------: | -----------------------: |
| Node — node:line |              369 |                435 |                   455 |                      455 |
| Deno — node:line |              203 |                230 |                   230 |                      229 |
| Deno — deno:line |              738 |                901 |                   915 |                      809 |
| Bun — node:line  |              246 |                279 |                   283 |                      280 |
| Bun — bun:line   |              938 |              1,540 |                 1,668 |                    1,315 |

### Page by page

| Runtime / Method      | 1M lines (35 MB) | 10M lines (353 MB) | 100M lines (3,529 MB) | 1,000M lines (35,286 MB) |
| --------------------- | ---------------: | -----------------: | --------------------: | -----------------------: |
| Node — readline-pager |            1,053 |              1,311 |                 1,278 |                      936 |
| Deno — deno:page      |              852 |                909 |                   908 |                      783 |
| Deno — readline-pager |            1,131 |              1,268 |                 1,271 |                      911 |
| Bun — bun:page        |              411 |                440 |                   449 |                      428 |
| Bun — readline-pager  |              827 |              1,021 |                 1,040 |                      804 |

**Runtime Environment:** Node.js v25.6.1 & Bun v1.3.9 & Deno 2.6.10

---

## 🛠 Development & Contributing

- Minimum supported Node.js: **v18.12 (lts/hydrogen)**.
- Development/test environment: **Node v25.6 & TypeScript v5.9**.

Run tests:

```bash
npm ci
npm test
```

Contributions are welcome — feel free to open an issue or PR.

---

## 📜 License

MIT — © Morteza Jamshidi
