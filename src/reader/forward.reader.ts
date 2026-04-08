import { closeSync, openSync, readSync, statSync } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";
import { createRingBuffer } from "../helper.js";
import type { Output, PageOutput, Pager, ReaderOptions } from "../types.js";

export function createForwardReader<T extends Output>(
  filepath: string,
  options: ReaderOptions & { output: T },
): Pager {
  const { chunkSize, pageSize, delimiter, prefetch, output } = options;

  const pageQueue = createRingBuffer<PageOutput>(Math.max(2, prefetch + 1));

  const isBufferOutput = output === "buffer";
  const emptyPage = isBufferOutput ? Buffer.allocUnsafe(0) : [""];
  const local: string[] = [];

  let fd: FileHandle | null = null;
  let fdSync: number | null = null;

  let pos = 0;
  let size = 0;
  let buffer = "";

  let done = false;
  let closed = false;
  let flushed = false;

  function consumeBuffer() {
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

  function flushTail() {
    if (flushed) return;
    flushed = true;

    if (!isBufferOutput) {
      local.push(buffer.length > 0 ? buffer : "");
      buffer = "";

      while (local.length > 0) {
        pageQueue.push(local.splice(0, pageSize));
      }
    }

    done = true;
    pageQueue.wake();
  }

  fdSync = openSync(filepath, "r");
  size = statSync(filepath).size;

  if (size === 0) {
    pageQueue.push(emptyPage);
    done = true;
    flushed = true;
    pageQueue.wake();
  }

  void (async () => {
    fd = await open(filepath, "r");
    size = (await fd.stat()).size;

    if (size === 0) {
      if (!done) {
        pageQueue.push(emptyPage);
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
      while (pageQueue.count < prefetch && pos < size && !closed) {
        const readSize = Math.min(chunkSize, size - pos);
        const buf = Buffer.allocUnsafe(readSize);
        const { bytesRead } = await fd.read(buf, 0, readSize, pos);
        pos += bytesRead;

        if (isBufferOutput) {
          pageQueue.push(buf.subarray(0, bytesRead));
        } else {
          buffer = buffer + buf.toString("utf8", 0, bytesRead);
          consumeBuffer();
        }
      }

      if (pos >= size && !flushed) {
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

    while (pageQueue.count < prefetch && pos < size && !closed) {
      const readSize = Math.min(chunkSize, size - pos);
      const buf = Buffer.allocUnsafe(readSize);
      const bytesRead = readSync(fdSync, buf, 0, readSize, pos);
      pos += bytesRead;

      if (isBufferOutput) {
        pageQueue.push(buf.subarray(0, bytesRead));
      } else {
        buffer = buffer + buf.toString("utf8", 0, bytesRead);
        consumeBuffer();
      }
    }

    if (pos >= size && !flushed) {
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
  } as Pager;
}
