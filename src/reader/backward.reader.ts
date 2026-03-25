import { closeSync, openSync, readSync, statSync } from "node:fs";
import { FileHandle, open } from "node:fs/promises";
import { createRingBuffer } from "../queue.js";
import type { Pager, ReaderOptions } from "../types.js";

export function createBackwardReader(
  filepath: string,
  options: ReaderOptions,
): Pager {
  const { chunkSize, pageSize, delimiter, prefetch } = options;

  const pageQueue = createRingBuffer<string[]>(Math.max(2, prefetch + 1));
  const local: string[] = [];

  let fd: FileHandle | null = null;
  let fdSync: number | null = null;
  let pos = 0;
  let buffer = "";
  let done = false;
  let closed = false;
  let startsWithDelimiter = false;

  fdSync = openSync(filepath, "r");
  pos = statSync(filepath).size;

  if (pos === 0) {
    pageQueue.push([buffer]);
    done = true;
    pageQueue.wake();
  }

  (async () => {
    try {
      fd = await open(filepath, "r");
      pos = (await fd.stat()).size;
      if (pos === 0) {
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
        while (pageQueue.count < prefetch && pos > 0 && !closed) {
          const readSize = Math.min(chunkSize, pos);
          pos -= readSize;

          const buf = Buffer.allocUnsafe(readSize);
          await fd.read(buf, 0, readSize, pos);

          buffer = buf.toString("utf8") + buffer;

          if (pos === 0 && buffer.startsWith(delimiter)) {
            startsWithDelimiter = true;
          }

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

        if (pos === 0 && !done) {
          if (buffer.length > 0) {
            local.push(buffer);
          } else if (startsWithDelimiter) {
            local.push("");
          }
          buffer = "";

          while (local.length > 0 && !closed) {
            const page = local.slice(
              local.length - Math.min(pageSize, local.length),
            );
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

    while (pageQueue.count < prefetch && pos > 0 && !closed) {
      const readSize = Math.min(chunkSize, pos);
      pos -= readSize;

      const buf = Buffer.allocUnsafe(readSize);
      readSync(fdSync, buf, 0, readSize, pos);

      buffer = buf.toString("utf8") + buffer;

      if (pos === 0 && buffer.startsWith(delimiter)) {
        startsWithDelimiter = true;
      }

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

    if (pos === 0 && !done) {
      if (buffer.length > 0) {
        local.push(buffer);
      } else if (startsWithDelimiter) {
        local.push("");
      }
      buffer = "";

      while (local.length > 0) {
        const page = local.slice(
          local.length - Math.min(pageSize, local.length),
        );
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
    return pageQueue.shift(done);
  }

  function nextSync() {
    if (closed) return null;
    fillSync();
    return pageQueue.shiftSync();
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
          if (fdSync) {
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
