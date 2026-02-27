import { FileHandle, open } from "node:fs/promises";
import { createPageQueue } from "../queue.js";
import type { Pager, ReaderOptions } from "../types.js";

export function createForwardReader(
  filepath: string,
  options: ReaderOptions,
): Pager {
  const { chunkSize, pageSize, delimiter, prefetch } = options;

  const pageQueue = createPageQueue();

  let fd: FileHandle | null = null;
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
    fd = await open(filepath, "r");
    size = (await fd.stat()).size;
    if (size === 0) done = true;
  }

  async function fill() {
    if (done || closed) return;
    await init();
    if (!fd) return;

    while (pageQueue.queue.length < prefetch && pos < size) {
      const readSize = Math.min(chunkSize, size - pos);
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
      // Split remaining buffer; every split counts, even empty strings
      const parts = buffer.length > 0 ? buffer.split(delimiter) : [""];
      for (const line of parts) {
        local.push(line);
      }
      buffer = "";

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

    firstLine ??= page[0];
    lastLine = page[page.length - 1];

    return page;
  }

  async function close() {
    closed = true;
    done = true;
    pageQueue.queue.length = 0;

    if (fd) {
      await fd.close();
      fd = null;
    }
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
      try {
        while (true) {
          const p = await next();
          if (!p) break;
          yield p;
        }
      } finally {
        await close();
      }
    },
  };
}
