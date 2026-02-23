import * as fs from "node:fs";
import { Worker } from "node:worker_threads";

const CHUNK_SIZE = 64 * 1024;

/* =========================
   Public Types
========================= */

export interface PageReaderOptions {
  pageSize?: number;
  prefetch?: number;
  useWorker?: boolean;
  backward?: boolean;
  delimiter?: string;
}

export interface PageReader extends AsyncIterable<string[]> {
  next(): Promise<string[] | null>;
  close(): void;
  readonly lineCount: number;
  readonly firstLine?: string | null;
  readonly lastLine?: string | null;
}

/* =========================
   Factory
========================= */

export function createPageReader(
  filepath: string,
  options: PageReaderOptions = {},
): PageReader {
  const {
    pageSize = 1000,
    prefetch = 1,
    useWorker = false,
    backward = false,
    delimiter = "\n",
  } = options;

  if (!filepath) throw new Error("filepath required");
  if (pageSize <= 0) throw new RangeError("pageSize must be > 0");
  if (prefetch <= 0) throw new RangeError("prefetch must be >= 1");

  if (backward && useWorker)
    throw new Error("backward not supported with useWorker");

  return useWorker
    ? createWorkerReader(filepath, pageSize, prefetch, delimiter)
    : backward
      ? createBackwardReader(filepath, pageSize, prefetch, delimiter)
      : createForwardReader(filepath, pageSize, prefetch, delimiter);
}

/* =========================
   Shared Queue Engine
========================= */

function createPageQueue() {
  const queue: string[][] = [];
  let resolver: (() => void) | null = null;

  return {
    queue,
    push(page: string[]) {
      queue.push(page);
      resolver?.();
      resolver = null;
    },
    wake() {
      resolver?.();
      resolver = null;
    },
    async shift(done: () => boolean) {
      if (queue.length) return queue.shift()!;
      if (done()) return null;
      await new Promise<void>((r) => (resolver = r));
      if (queue.length) return queue.shift()!;
      if (done()) return null;
      return null;
    },
  };
}

/* =========================
   Forward Reader (fd-based)
========================= */

function createForwardReader(
  filepath: string,
  pageSize: number,
  prefetch: number,
  delimiter: string,
): PageReader {
  const pageQueue = createPageQueue();

  let fd: fs.promises.FileHandle | null = null;
  let pos = 0;
  let size = 0;
  let buffer = "";
  let done = false;
  let closed = false;

  let emittedCount = 0;
  let firstLine: string | null = null;
  let lastLine: string | null = null;

  const local: string[] = [];

  async function init() {
    if (fd) return;
    fd = await fs.promises.open(filepath, "r");
    size = (await fd.stat()).size;
    if (size === 0) done = true;
  }

  async function fill() {
    if (done || closed) return;
    await init();
    if (!fd) return;

    while (pageQueue.queue.length < prefetch && pos < size) {
      const readSize = Math.min(CHUNK_SIZE, size - pos);
      const buf = Buffer.allocUnsafe(readSize);
      const { bytesRead } = await fd.read(buf, 0, readSize, pos);
      pos += bytesRead;

      buffer += buf.toString("utf8", 0, bytesRead);

      let idx: number;
      while ((idx = buffer.indexOf(delimiter)) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + delimiter.length);
        local.push(line);

        while (local.length >= pageSize) {
          pageQueue.push(local.splice(0, pageSize));
        }
      }
    }

    if (pos >= size) {
      if (buffer.length > 0) {
        const parts = buffer.split(delimiter);
        for (const line of parts) {
          local.push(line);
        }
        buffer = "";
      }

      while (local.length > 0) {
        pageQueue.push(local.splice(0, pageSize));
      }

      done = true;
      if (fd) {
        await fd.close();
        fd = null;
      }
    }
  }

  async function next() {
    if (closed) return null;
    await fill();
    const page = await pageQueue.shift(() => done);
    if (!page) return null;
    emittedCount += page.length;

    if (firstLine === null) firstLine = page[0];
    lastLine = page[page.length - 1];

    return page;
  }

  async function close() {
    closed = true;
    done = true;
    pageQueue.queue.length = 0;
    if (fd) await fd.close();
  }

  return {
    next,
    close,
    get lineCount() {
      return emittedCount;
    },
    get firstLine() {
      return firstLine;
    },
    get lastLine() {
      return lastLine;
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        const p = await next();
        if (!p) break;
        yield p;
      }
    },
  };
}

/* =========================
   Backward Reader (fd-based)
========================= */

function createBackwardReader(
  filepath: string,
  pageSize: number,
  prefetch: number,
  delimiter: string,
): PageReader {
  const pageQueue = createPageQueue();

  let fd: fs.promises.FileHandle | null = null;
  let pos = 0;
  let buffer = "";
  let done = false;
  let closed = false;

  let emittedCount = 0;
  let firstLine: string | null = null;
  let lastLine: string | null = null;

  const local: string[] = [];

  async function init() {
    if (fd) return;
    fd = await fs.promises.open(filepath, "r");
    pos = (await fd.stat()).size;
    if (pos === 0) done = true;
  }

  async function fill() {
    if (done || closed) return;
    await init();
    if (!fd) return;

    while (pageQueue.queue.length < prefetch && pos > 0) {
      const readSize = Math.min(CHUNK_SIZE, pos);
      pos -= readSize;

      const buf = Buffer.allocUnsafe(readSize);
      await fd.read(buf, 0, readSize, pos);

      buffer = buf.toString("utf8") + buffer;

      let idx: number;
      while ((idx = buffer.lastIndexOf(delimiter)) !== -1) {
        const line = buffer.slice(idx + delimiter.length);
        buffer = buffer.slice(0, idx);
        local.push(line);

        while (local.length >= pageSize) {
          const page = local.splice(0, pageSize);
          pageQueue.push(page);
        }
      }
    }

    if (pos === 0) {
      if (buffer.length > 0) local.push(buffer);

      while (local.length > 0) {
        const sliceSize = Math.min(pageSize, local.length);
        const page = local.splice(0, sliceSize);
        pageQueue.push(page);
      }

      done = true;
      if (fd) {
        await fd.close();
        fd = null;
      }
    }
  }

  async function next() {
    if (closed) return null;
    await fill();
    const page = await pageQueue.shift(() => done);
    if (!page) return null;
    emittedCount += page.length;

    if (firstLine === null) firstLine = page[0];
    lastLine = page[page.length - 1];

    return page;
  }

  async function close() {
    closed = true;
    done = true;
    pageQueue.queue.length = 0;
    if (fd) await fd.close();
  }

  return {
    next,
    close,
    get lineCount() {
      return emittedCount;
    },
    get firstLine() {
      return firstLine;
    },
    get lastLine() {
      return lastLine;
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        const p = await next();
        if (!p) break;
        yield p;
      }
    },
  };
}

/* =========================
   Worker (forward only)
========================= */

function createWorkerReader(
  filepath: string,
  pageSize: number,
  prefetch: number,
  delimiter: string,
): PageReader {
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    workerData: { filepath, pageSize, delimiter },
  });

  const pageQueue = createPageQueue();

  let done = false;
  let closed = false;
  let emittedCount = 0;
  let firstLine: string | null = null;
  let lastLine: string | null = null;

  worker.on("message", (msg: any) => {
    if (msg.type === "page") {
      pageQueue.push(msg.data);
    }
    if (msg.type === "meta") {
      firstLine ??= msg.firstLine;
      lastLine = msg.lastLine ?? lastLine;
    }
    if (msg.type === "done") {
      done = true;
      pageQueue.wake();
    }
  });

  async function next() {
    if (closed) return null;
    const page = await pageQueue.shift(() => done);
    if (!page) return null;
    emittedCount += page.length;
    return page;
  }

  async function close() {
    closed = true;
    done = true;
    worker.terminate();
  }

  return {
    next,
    close,
    get lineCount() {
      return emittedCount;
    },
    get firstLine() {
      return firstLine;
    },
    get lastLine() {
      return lastLine;
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        const p = await next();
        if (!p) break;
        yield p;
      }
    },
  };
}
