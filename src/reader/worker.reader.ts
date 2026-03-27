import { Worker } from "node:worker_threads";
import { createRingBuffer } from "../helper.js";
import type { Pager, ReaderOptions, WorkerMessage } from "../types.js";

// TODO: refactor with better technique
const isESM = typeof import.meta !== "undefined";

const workerFile = isESM
  ? new URL("./worker.mjs", import.meta.url)
  : require.resolve("./worker.cjs");

export function createWorkerReader(
  filepath: string,
  options: ReaderOptions,
): Pager {
  const { prefetch } = options;

  let done = false;
  let closed = false;

  const pageQueue = createRingBuffer<string[]>(Math.max(2, prefetch + 1));

  const worker = new Worker(new URL(workerFile, import.meta.url), {
    workerData: {
      filepath,
      options,
    },
  });

  worker.on("message", (msg: WorkerMessage) => {
    switch (msg.type) {
      case "page": {
        pageQueue.push(msg.data);
        break;
      }
      case "done":
      case "error": {
        done = true;
        pageQueue.wake();
        break;
      }
    }
  });

  worker.on("error", () => {
    done = true;
    pageQueue.wake();
  });

  worker.on("exit", () => {
    done = true;
    pageQueue.wake();
  });

  async function next() {
    if (closed) return null;
    return pageQueue.shift(done);
  }

  function nextSync() {
    if (closed) return null;
    return pageQueue.shiftSync();
  }

  async function close() {
    if (closed) return;
    closed = true;
    done = true;
    pageQueue.clear();

    try {
      await worker.terminate();
    } catch {}
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
