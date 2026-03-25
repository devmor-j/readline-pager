import { closeSync, openSync, readSync, statSync } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";
import { createRingBuffer } from "../queue.js";
import type { Pager, ReaderOptions } from "../types.js";

export function createForwardReader(
  filepath: string,
  options: ReaderOptions,
): Pager {
  const { chunkSize, pageSize, delimiter, prefetch } = options;

  const pageQueue = createRingBuffer<string[]>(Math.max(2, prefetch + 1));
  const local: string[] = [];

  let fd: FileHandle | null = null;
  let fdSync: number | null = null;
  let pos = 0;
  let size = 0;
  let buffer = "";
  let done = false;
  let closed = false;
  let flushed = false;

  fdSync = openSync(filepath, "r");
  size = statSync(filepath).size;

  if (size === 0) {
    pageQueue.push([buffer]);
    done = true;
    pageQueue.wake();
  }

  (async () => {
    try {
      fd = await open(filepath, "r");
      size = (await fd.stat()).size;

      if (size === 0) {
        if (!done) {
          pageQueue.push([buffer]);
          done = true;
        }
        if (fd) {
          await fd.close();
          fd = null;
        }
        pageQueue.wake();
        return;
      }

      while (!done && !closed) {
        while (pageQueue.count < prefetch && pos < size && !closed) {
          const readSize = Math.min(chunkSize, size - pos);
          const buf = Buffer.allocUnsafe(readSize);
          const { bytesRead } = await fd.read(buf, 0, readSize, pos);
          pos += bytesRead;

          buffer = buffer + buf.toString("utf8", 0, bytesRead);

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

        if (pos >= size && !flushed) {
          flushed = true;

          local.push(buffer.length > 0 ? buffer : "");
          buffer = "";

          while (local.length > 0 && !closed) {
            const page = local.slice(0, pageSize);
            local.length -= page.length;
            pageQueue.push(page);
          }

          done = true;
          if (fd) {
            await fd.close();
            fd = null;
          }
          pageQueue.wake();
          break;
        }

        if (!done && !closed) {
          await new Promise((r) => setImmediate(r));
        }
      }
    } catch {
      done = true;
      pageQueue.wake();
      try {
        if (fd) {
          await fd.close();
          fd = null;
        }
      } catch {}
    }
  })();

  function fillSync() {
    if (done || closed) return;
    if (fdSync === null) return;

    while (pageQueue.count < prefetch && pos < size && !closed) {
      const readSize = Math.min(chunkSize, size - pos);
      const buf = Buffer.allocUnsafe(readSize);
      const bytesRead = readSync(fdSync, buf, 0, readSize, pos);
      pos += bytesRead;

      buffer = buffer + buf.toString("utf8", 0, bytesRead);

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

    if (pos >= size && !flushed) {
      flushed = true;

      local.push(buffer.length > 0 ? buffer : "");
      buffer = "";

      while (local.length > 0) {
        const page = local.slice(0, pageSize);
        local.length -= page.length;
        pageQueue.push(page);
      }

      done = true;
      if (fdSync !== null) {
        closeSync(fdSync);
        fdSync = null;
      }
      pageQueue.wake();
    }
  }

  async function next() {
    if (closed) return null;

    const page = await pageQueue.shift();
    return page;
  }

  function nextSync() {
    if (closed) return null;
    fillSync();

    const page = pageQueue.shiftSync();
    return page;
  }

  async function close() {
    closed = true;
    done = true;
    pageQueue.clear();

    if (fd) {
      try {
        await fd.close();
      } catch {}
      fd = null;
    }

    if (fdSync !== null) {
      try {
        closeSync(fdSync);
      } catch {}
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
        await close();
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
        closed = true;
        done = true;
        pageQueue.clear();

        try {
          if (fdSync !== null) {
            closeSync(fdSync);
          }
        } catch {}
        fdSync = null;

        try {
          if (fd?.fd) {
            closeSync(fd.fd);
          }
        } catch {}
        fd = null;
      }
    },
  };
}
