import { FileHandle, open } from "node:fs/promises";
import { CHUNK_SIZE } from "../constants.js";
import { createPageQueue } from "../queue.js";
import type { Pager, ReaderOptions } from "../types.js";

export function createBackwardReader(
  filepath: string,
  options: ReaderOptions,
): Pager {
  const { pageSize, delimiter, prefetch } = options;

  const pageQueue = createPageQueue();

  let fd: FileHandle | null = null;
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
    fd = await open(filepath, "r");
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
      local.push(buffer);
      buffer = "";

      while (local.length > 0) {
        const sliceSize = Math.min(pageSize, local.length);
        const page = local.splice(local.length - sliceSize, sliceSize);
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

    firstLine ??= page[0];
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
