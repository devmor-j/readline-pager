# readpage

Memory-efficient paginated text file reader for Node.js (v18.12+) with async iteration, prefetching, and optional worker support.

Reads large text files page-by-page (array of lines) without loading the entire file into memory.

- ✅ Zero dependencies
- ✅ Async iterator support
- ✅ Forward and backward reading
- ✅ Optional worker thread mode
- ✅ Fully typed (TypeScript)

---

## Installation

```bash
npm install readpage
```

---

## Basic Usage

```js
import { createPageReader } from "readpage";

const reader = createPageReader({
  filepath: "./bigfile.txt",
});

for await (const page of reader) {
  console.log(page[0]); // First line of current page
}
```

---

## Manual Iteration

```js
const reader = createPageReader({
  filepath: "./bigfile.txt",
});

while (true) {
  const page = await reader.next();
  if (!page) break;

  console.log(page[0]);
}
```

`next()` returns:

- `string[]` → next page
- `null` → end of file

---

## Options

```ts
createPageReader({
  filepath: string,       // required
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

## API

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

## Properties

```ts
reader.lineCount; // total lines emitted so far
reader.firstLine; // first line in file (when known)
reader.lastLine; // last line in file (when known)
```
