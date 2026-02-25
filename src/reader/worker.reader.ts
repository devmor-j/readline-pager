import { Worker } from "node:worker_threads";
import { createPageQueue } from "../queue.js";
import type { Pager, ReaderOptions } from "../types.js";

const isESM = typeof import.meta !== "undefined";

const workerFile = isESM
  ? new URL("./worker.mjs", import.meta.url)
  : require.resolve("./worker.cjs");

export function createWorkerReader(
  filepath: string,
  options: ReaderOptions,
): Pager {
  const {
    chunkSize,
    pageSize,
    delimiter,
    prefetch, // TODO: design prefetch logic for workers
  } = options;

  const worker = new Worker(new URL(workerFile, import.meta.url), {
    workerData: { filepath, chunkSize, pageSize, delimiter },
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

    firstLine ??= page[0];
    lastLine = page[page.length - 1];

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
