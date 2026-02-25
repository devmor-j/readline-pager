# 📄 readline-pager

<p align="center"><img src="logo.webp" alt="logo" width="349"></p>

Memory-efficient, paginated file reader for Node.js with async iteration, prefetching, backward reading and optional worker support.

`readline-pager` reads large text files page-by-page without loading the entire file into memory.

- ✅ Zero dependencies
- ✅ Async iterator (`for await...of`) + manual `next()` API
- ✅ Forward & backward reading (EOF → BOF)
- ✅ Optional worker thread mode (forward only)
- ✅ Up to ~3× faster than Node.js `readline`
- ✅ ~97% test coverage & fully typed (TypeScript)

> **Important:**
> Performance is heavily dependent on the `chunkSize` option; ensure you fine-tune it for your specific I/O hardware. A setting of **64 KB** is typically a good starting point. Increasing it might gradually improve read speeds, usually reaching an optimal peak depending on your hardware's capabilities.

---

## 📦 Installation

```bash
npm install readline-pager
```

---

## 🚀 Quick start

```ts
import { createPager } from "readline-pager";

const pager = createPager("./bigfile.txt");

for await (const page of pager) {
  console.log(page[0]); // first line of the current page
}
```

---

**Recommended for highest throughput:**

```ts
const pager = createPager("./bigfile.txt");

while (true) {
  const page = await pager.next();
  if (!page) break;
}

// or
let page;
while ((page = await pager.next()) !== null) {
  // process page
}
```

- `while + next()` is the fastest iteration method (avoids extra async-iterator overhead).
- `for await of` is more ergonomic and convenient.

---

## ⚙️ Options

```ts
createPager(filepath, {
  chunkSize?: number,     // default: 64 * 1024 (64 KiB)
  pageSize?: number,      // default: 1_000
  delimiter?: string,      // default: "\n"
  prefetch?: number,      // default: 1
  backward?: boolean,     // default: false
  useWorker?: boolean,    // default: false (forward only)
});
```

- `chunkSize`: number of bytes read per I/O operation. **Tune this** — default is `64 * 1024`.
- `pageSize` — number of lines per page.
- `delimiter` — line separator.
- `prefetch` — max number of pages buffered internally. Not required for typical use; tuning has little effect once the engine is optimized.
- `backward` — read file from end → start (not supported with `useWorker`).
- `useWorker` — offload parsing to a worker thread (forward only).

---

## 📚 API

### `pager.next(): Promise<string[] | null>`

Returns the next page or `null` when finished. Empty lines are preserved.

**Note:** Unlike Node.js `readline`, which may skip empty files or leading empty lines, `readline-pager` always returns all lines.

- A completely empty file (`0` bytes) produces `[""]` on the first read.
- A file with multiple empty lines returns each line as an empty string (e.g., `["", ""]` for two empty lines). Node.js `readline` may emit fewer or no `line` events in these cases.

### `pager.close(): void`

Stops reading and releases resources immediately. Safe to call at any time.

### Read-only properties

- `pager.lineCount` — lines emitted so far
- `pager.firstLine` — first emitted line (available after first read)
- `pager.lastLine` — last emitted line (updated per page)

---

## 📊 Benchmark

Run the included benchmark:

```bash
# default run
node test/_benchmark.ts

# or customize with args
node test/_benchmark.ts --lines=20000 --page-size=500 --backward
```

> Test setup: generated text files with uuid, run on a fast NVMe machine with default options; values are averages from multiple runs. Results are machine-dependent.

|  Lines |  File MB | Node `readline` (MB/s) | Bun streaming (MB/s) | `readline-pager` (Node) (MB/s) |
| -----: | -------: | ---------------------: | -------------------: | -----------------------------: |
|    10M |   352.86 |                   ~423 |                 ~296 |                     **~1,327** |
|   100M |  3528.59 |                   ~441 |                 ~298 |                     **~1,378** |
| 1,000M | 35285.95 |                   ~426 |                 ~294 |                     **~1,168** |

**Takeaway:** `readline-pager` delivers multi-GB/s memory-to-memory throughput on large files on typical NVMe hardware; results vary with `chunkSize`, runtime (Node vs Bun), and CPU/OS.

---

## 🛠 Development & Contributing

- Minimum supported Node.js: **v18.12** (lts/hydrogen).
- Development/test environment: **Node v25.6**, **TypeScript v5.9**.

Run tests:

```bash
npm ci
npm test
```

Contributions are welcome — feel free to open an issue or PR.

---

## 📜 License

MIT — © Morteza Jamshidi
