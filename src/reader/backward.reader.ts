import { closeSync, openSync, readSync, statSync } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";
import { createRingBuffer } from "../helper.js";
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
  let flushed = false;
  let startsWithDelimiter = false;

  function consumeBuffer() {
    let idx: number;
    while ((idx = buffer.lastIndexOf(delimiter)) !== -1) {
      const line = buffer.slice(idx + delimiter.length);
      buffer = buffer.slice(0, idx);
      local.push(line);

      while (local.length >= pageSize) {
        pageQueue.push(local.splice(0, pageSize));
      }
    }
  }

  function flushTail() {
    if (flushed) return;
    flushed = true;

    if (buffer.length > 0) {
      local.push(buffer);
    } else if (startsWithDelimiter) {
      local.push("");
    }

    buffer = "";

    while (local.length > 0) {
      const page = local.slice(local.length - Math.min(pageSize, local.length));
      local.length -= page.length;
      pageQueue.push(page);
    }

    done = true;
    pageQueue.wake();
  }

  fdSync = openSync(filepath, "r");
  pos = statSync(filepath).size;

  if (pos === 0) {
    pageQueue.push([""]);
    done = true;
    flushed = true;
    pageQueue.wake();
  }

  void (async () => {
    fd = await open(filepath, "r");
    pos = (await fd.stat()).size;

    if (pos === 0) {
      if (!done) {
        pageQueue.push([""]);
        done = true;
        flushed = true;
      }

      if (fd) {
        try {
          await fd.close();
        } catch {}
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
        const { bytesRead } = await fd.read(buf, 0, readSize, pos);

        buffer = buf.toString("utf8", 0, bytesRead) + buffer;

        if (pos === 0 && buffer.startsWith(delimiter)) {
          startsWithDelimiter = true;
        }

        consumeBuffer();
      }

      if (pos === 0 && !flushed) {
        flushTail();

        if (fd) {
          try {
            await fd.close();
          } catch {}
          fd = null;
        }

        break;
      }

      if (!done && !closed) {
        await new Promise((r) => setImmediate(r));
      }
    }
  })();

  function fillSync() {
    if (done || closed || !fdSync) return;

    while (pageQueue.count < prefetch && pos > 0 && !closed) {
      const readSize = Math.min(chunkSize, pos);
      pos -= readSize;

      const buf = Buffer.allocUnsafe(readSize);
      const bytesRead = readSync(fdSync, buf, 0, readSize, pos);

      buffer = buf.toString("utf8", 0, bytesRead) + buffer;

      if (pos === 0 && buffer.startsWith(delimiter)) {
        startsWithDelimiter = true;
      }

      consumeBuffer();
    }

    if (pos === 0 && !flushed) {
      flushTail();

      if (fdSync) {
        try {
          closeSync(fdSync);
        } catch {}
        fdSync = null;
      }
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
    if (closed) return;
    closed = true;
    done = true;
    pageQueue.clear();

    if (fdSync) {
      try {
        closeSync(fdSync);
      } catch {}
      fdSync = null;
    }

    if (fd) {
      try {
        await fd.close();
      } catch {}
      fd = null;
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

        if (fdSync) {
          try {
            closeSync(fdSync);
          } catch {}
          fdSync = null;
        }

        if (fd?.fd) {
          try {
            closeSync(fd.fd);
          } catch {}
          fd = null;
        }
      }
    },
  };
}
