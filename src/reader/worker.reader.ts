import { Worker } from "node:worker_threads";
import { createPageQueue } from "../queue.js";
import type { Pager, ReaderOptions } from "../types.js";

// TODO: refactor with better technique
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

    return page;
  }

  function nextSync() {
    if (closed) return null;

    if (pageQueue.queue.length) return pageQueue.queue.shift()!;
    if (done) return null;

    return null;
  }

  // TODO: merge partial closes into close api
  async function close() {
    closed = true;
    done = true;

    await worker.terminate();
  }

  function tryClose() {
    void close().catch(() => {});
  }

  return {
    next,
    nextSync,
    close,
    async *[Symbol.asyncIterator]() {
      try {
        while (true) {
          const p = await next();
          if (!p) break;
          yield p;
        }
      } finally {
        tryClose();
      }
    },
    *[Symbol.iterator]() {
      try {
        while (true) {
          const p = nextSync();
          if (!p) break;
          yield p;
        }
      } finally {
        tryClose();
      }
    },
  };
}
