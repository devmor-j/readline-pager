import * as fs from "node:fs";
import * as readline from "node:readline";
import { Worker } from "node:worker_threads";

/* =========================
   Public Types
========================= */

export interface PageReaderOptions {
  filepath: string;
  pageSize?: number;
  /** Number of pages kept prefetched in memory. 1 = no prefetch. */
  prefetch?: number;
  useWorker?: boolean;
}

export interface PageReader extends AsyncIterable<string[]> {
  /** Returns next page or null when finished. */
  next(): Promise<string[] | null>;

  /** Immediately stops reading and releases resources. */
  close(): void;
}

export interface PageReader extends AsyncIterable<string[]> {
  /** Returns next page or null when finished. */
  next(): Promise<string[] | null>;

  /** Immediately stops reading and releases resources. */
  close(): void;
}

/* =========================
   Factory
========================= */

export function createPageReader(options: PageReaderOptions): PageReader {
  const {
    filepath,
    pageSize = 1_000,
    prefetch = 1,
    useWorker = false,
  } = options;

  if (!filepath) throw new Error("filepath required");
  if (pageSize <= 0) throw new RangeError("pageSize must be > 0");
  if (prefetch <= 0) throw new RangeError("prefetch must be >= 1");

  return useWorker
    ? createWorkerReader(filepath, pageSize, prefetch)
    : createStreamReader(filepath, pageSize, prefetch);
}

/* =========================
   Stream Implementation
========================= */

function createStreamReader(
  filepath: string,
  pageSize: number,
  prefetch: number,
): PageReader {
  const stream = fs.createReadStream(filepath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const queue: string[][] = [];
  let buffer: string[] = [];
  let done = false;
  let closed = false;
  let paused = false;
  let error: Error | null = null;
  let resolver: (() => void) | null = null;

  function maybePause(): void {
    if (!paused && queue.length >= prefetch) {
      rl.pause();
      paused = true;
    }
  }

  function maybeResume(): void {
    if (paused && queue.length < prefetch) {
      rl.resume();
      paused = false;
    }
  }

  rl.on("line", (line: string) => {
    if (closed) return;

    buffer.push(line);

    if (buffer.length === pageSize) {
      queue.push(buffer);
      buffer = [];

      resolver?.();
      resolver = null;

      maybePause();
    }
  });

  rl.on("close", () => {
    if (!closed && buffer.length) {
      queue.push(buffer);
    }
    done = true;
    resolver?.();
  });

  rl.on("error", (err: Error) => {
    error = err;
    done = true;
    resolver?.();
  });

  async function next(): Promise<string[] | null> {
    if (closed) return null;
    if (error) throw error;

    if (queue.length) {
      const page = queue.shift()!;
      maybeResume();
      return page;
    }

    if (done) return null;

    await new Promise<void>((r) => (resolver = r));

    if (queue.length) {
      const page = queue.shift()!;
      maybeResume();
      return page;
    }

    return null;
  }

  function close(): void {
    if (closed) return;
    closed = true;

    queue.length = 0;
    buffer.length = 0;

    rl.removeAllListeners();
    stream.removeAllListeners();

    rl.close();
    stream.destroy();

    done = true;
    resolver?.();
  }

  return {
    next,
    close,
    async *[Symbol.asyncIterator]() {
      while (true) {
        const page = await next();
        if (!page) break;
        yield page;
      }
    },
  };
}

/* =========================
   Worker Implementation
========================= */

function createWorkerReader(
  filepath: string,
  pageSize: number,
  prefetch: number,
): PageReader {
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    workerData: { filepath, pageSize },
  });

  const queue: string[][] = [];
  let done = false;
  let closed = false;
  let error: Error | null = null;
  let resolver: (() => void) | null = null;

  worker.on("message", (msg: any) => {
    if (closed) return;

    if (msg.type === "page") {
      queue.push(msg.data);
      resolver?.();
      resolver = null;

      if (queue.length >= prefetch) worker.postMessage({ type: "pause" });
    }

    if (msg.type === "done") {
      done = true;
      resolver?.();
    }
  });

  worker.on("error", (err: Error) => {
    error = err;
    done = true;
    resolver?.();
  });

  async function next(): Promise<string[] | null> {
    if (closed) return null;
    if (error) throw error;

    if (queue.length) {
      const page = queue.shift()!;
      worker.postMessage({ type: "resume" });
      return page;
    }

    if (done) return null;

    await new Promise<void>((r) => (resolver = r));

    if (queue.length) {
      const page = queue.shift()!;
      worker.postMessage({ type: "resume" });
      return page;
    }

    return null;
  }

  function close(): void {
    if (closed) return;
    closed = true;

    queue.length = 0;

    worker.removeAllListeners();
    worker.terminate();

    done = true;
    resolver?.();
  }

  return {
    next,
    close,
    async *[Symbol.asyncIterator]() {
      while (true) {
        const page = await next();
        if (!page) break;
        yield page;
      }
    },
  };
}
