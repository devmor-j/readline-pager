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

⚡ High-performance paginated file reader for Node.js. Efficiently process large text files without loading them into memory.

- 📦 Zero dependencies
- ⚡ Up to ~3× faster than Node.js `readline`
- 🚀 Up to ~6× faster with optional native C++ acceleration
- 🔁 Async (`for await...of`) and sync (`for...of`) iteration
- 📄 Page-based reading with manual control (`next`, `nextSync`)
- 🔀 Forward and backward reading support
- 🧪 Fully typed with high test coverage (~95%)

> **Important:**  
> Performance depends heavily on the `chunkSize` option. Tune it for your storage device. A value of **64 KiB** is usually a good starting point. Increasing it may improve throughput until you reach the best value for your hardware.

---

## 📦 Installation

```bash
npm install readline-pager
```

---

## 🚀 Quick start

```ts
import { createPager } from "readline-pager";

for await (const page of createPager("./bigfile.txt")) {
  console.log(page[0]);
}
```

---

### Other usage patterns

```ts
import { createPager, createNativePager } from "readline-pager";

// Sync iteration
for (const page of createPager("./bigfile.txt")) {
}

// Manual async
const pager = createPager("./bigfile.txt");
while (true) {
  const page = await pager.next();
  if (!page) break;
}

// Manual sync
let page;
const pager = createPager("./bigfile.txt");
while ((page = pager.nextSync()) !== null) {}

// Native C++ (fastest)
for await (const page of createNativePager("./bigfile.txt")) {
}
```

---

## ⚙️ Options

```ts
createPager(filepath, {
  chunkSize?: number,   // default: 64 * 1024 (64 KiB)
  pageSize?: number,    // default: 1_000
  delimiter?: string,   // default: "\n"
  prefetch?: number,    // default: 8
  backward?: boolean,   // default: false
  useWorker?: boolean,  // default: false
});
```

- `chunkSize` — number of bytes read per I/O operation.
- `pageSize` — number of lines per page.
- `delimiter` — line separator.
- `prefetch` — maximum number of pages buffered internally.
- `backward` — read the file from end to start.
- `useWorker` — offload reading to a worker thread (forward reading only).

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

### `createNativePager(filepath, options?): Pager`

Creates a pager backed by the optional native C++ addon.

If the native addon is not available for the current platform, this function throws.

---

> **Note:**
> Unlike Node.js `readline`, which may skip empty files or leading empty lines, `readline-pager` always returns all lines.
>
> - A completely empty file (`0` bytes) produces `[""]` on the first read.
> - A file containing multiple empty lines returns each line as an empty string.

---

## 📊 Benchmark

Run the benchmark locally:

```bash
npm run benchmark:node

# or customize with args
node test/_benchmark.ts --lines=20000 --page-size=500 --backward
```

> Test setup: generated text files (UUID lines), NVMe SSD, Node.js runtime.
> Results are averaged across multiple runs. Actual performance depends on hardware.

---

### ⚡ Throughput (MB/s)

| Method                 | 1M lines (35 MB) | 10M lines (353 MB) | 100M lines (3.5 GB) | 1B lines (35.3 GB) |
| ---------------------- | ---------------: | -----------------: | ------------------: | -----------------: |
| `readline`             |        ~370 MB/s |          ~460 MB/s |           ~460 MB/s |          ~460 MB/s |
| `readline-pager` (JS)  |       ~1100 MB/s |         ~1300 MB/s |          ~1300 MB/s |         ~1150 MB/s |
| `readline-pager` (C++) |       ~2200 MB/s |         ~2500 MB/s |          ~2500 MB/s |         ~2450 MB/s |

---

## 🛠 Development & Contributing

- Minimum supported Node.js: **v18.12**
- Development/test environment: **Node v25.8** and **TypeScript v6.0**

Run tests:

```bash
npm ci
npm test
```

Contributions are welcome. Open an issue or submit a PR.

---

## 📜 License

MIT — © Morteza Jamshidi
