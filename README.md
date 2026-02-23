# readpage

⚡ High-performance paginated file reader for Node.js with controlled prefetching.

`readpage` streams large text files efficiently and returns them page-by-page (array of lines), without loading the entire file into memory.

Built with:

- ✅ Native Node.js streams
- ✅ Zero runtime dependencies
- ✅ Async iterator support
- ✅ Controlled prefetch buffering
- ✅ Optional worker thread mode
- ✅ Full TypeScript types

---

## 📦 Installation

```bash
npm install readpage
```

Node.js **>= 18.12.0** required.

---

## 🚀 Basic Usage

```js
import { createPageReader } from "readpage";
// const { createPageReader } = require("readpage");

const reader = createPageReader({
  filepath: "./bigfile.txt",
  pageSize: 1_000, // lines per page
  prefetch: 1, // pages buffered in memory
});

for await (const page of reader) {
  console.log(page[0]); // first line of page
}
```

---

## 🔁 Manual Iteration

```js
const reader = createPageReader({
  filepath: "./bigfile.txt",
  pageSize: 1_000,
  prefetch: 2,
});

while (true) {
  const page = await reader.next();
  if (!page) break; // page is `null` when EOF is reached

  console.log(page[0]);
}
```

---

## ⚙️ Options

```ts
createPageReader({
  filepath: string,     // required
  pageSize?: number,    // default: 1_000
  prefetch?: number,    // default: 1
  useWorker?: boolean   // default: false
})
```

### `pageSize`

Number of lines per page.

### `prefetch`

Number of pages kept ready in memory.

- `1` → no prefetch (minimal memory)
- `2+` → background page buffering
- Higher value = smoother throughput, more memory usage

### `useWorker`

Moves page processing to a Worker thread.

Recommended only if you perform CPU-heavy processing per page.

---

## 🔄 API

### `reader.next()`

```ts
Promise<string[] | null>;
```

Returns:

- `string[]` → next page
- `null` → end of file

---

### Async Iterator

```ts
for await (const page of reader)
```

Each `page` is:

```ts
string[]
```

---

### `reader.close()`

Immediately stops reading and releases resources.

Safe to call at any time.

---

## 🧠 Design Philosophy

- Streaming, not buffering entire files
- Deterministic pagination
- Minimal abstraction
- No hidden magic
- No dependencies

Optimized for large file workloads.

---

## 📊 When to Use Worker Mode

Use `useWorker: true` only if:

- You perform heavy CPU transformations per page
- You want to isolate file parsing from main thread

For pure file reading, default stream mode is faster.
