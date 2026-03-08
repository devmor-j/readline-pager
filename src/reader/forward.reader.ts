import { closeSync, openSync, readSync, statSync } from "node:fs";
import { FileHandle, open } from "node:fs/promises";
import { createPageQueue } from "../queue.js";
import type { Pager, ReaderOptions } from "../types.js";

export function createForwardReader(
  filepath: string,
  options: ReaderOptions,
): Pager {
  const { chunkSize, pageSize, delimiter, prefetch } = options;

  const pageQueue = createPageQueue();
  const local: string[] = [];

  let fd: FileHandle | null = null;
  let fdSync: number | null = null;
  let pos = 0;
  let size = 0;
  let buffer = "";
  let done = false;
  let closed = false;

  async function init() {
    if (fd) return;
    fd = await open(filepath, "r");
    size = (await fd.stat()).size;
    if (size === 0) done = true;
  }

  function initSync() {
    if (fdSync) return;
    fdSync = openSync(filepath, "r");
    size = statSync(filepath).size;
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

  function fillSync() {
    if (done || closed) return;
    initSync();
    if (fdSync === null) return;

    while (pageQueue.queue.length < prefetch && pos < size) {
      const readSize = Math.min(chunkSize, size - pos);
      const buf = Buffer.allocUnsafe(readSize);
      const bytesRead = readSync(fdSync, buf, 0, readSize, pos);
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
      const parts = buffer.length > 0 ? buffer.split(delimiter) : [""];
      for (const line of parts) {
        local.push(line);
      }
      buffer = "";

      while (local.length > 0) {
        pageQueue.push(local.splice(0, pageSize));
      }

      done = true;
      if (fdSync !== null) {
        closeSync(fdSync);
        fdSync = null;
      }
    }
  }

  async function next() {
    if (closed) return null;
    await fill();

    const page = await pageQueue.shift(() => done);
    if (!page) return null;

    return page;
  }

  function nextSync() {
    if (closed) return null;
    fillSync();

    if (pageQueue.queue.length) return pageQueue.queue.shift()!;
    if (done) return null;

    return null;
  }

  async function close() {
    closed = true;
    done = true;
    pageQueue.queue.length = 0;

    if (fd) {
      await fd.close();
      fd = null;
    }

    if (fdSync !== null) {
      closeSync(fdSync);
      fdSync = null;
    }
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
        await close().catch(() => {});
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
        close().catch(() => {});
      }
    },
  };
}
