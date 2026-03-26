import { createNativePager } from "./native.js";
import {
  createBackwardReader,
  createForwardReader,
  createWorkerReader,
} from "./reader/index.reader.js";
import type {
  NativeReaderOptions,
  Pager,
  PagerOptions,
  ReaderOptions,
} from "./types.js";

export function createPager(
  filepath: string,
  options: PagerOptions = {},
): Pager {
  const {
    chunkSize = 64 * 1_024,
    pageSize = 1_000,
    delimiter = "\n",
    prefetch = 8,
    backward = false,
    useWorker = false,
    tryNative = true,
  } = options;

  if (!filepath) throw new Error("filepath required");
  if (pageSize < 1) throw new RangeError("pageSize must be >= 1");
  if (prefetch < 1) throw new RangeError("prefetch must be >= 1");

  if (useWorker) {
    if (backward) throw new Error("backward not supported with useWorker");
    if (tryNative) throw new Error("tryNative not supported with useWorker");
  }

  if (tryNative) {
    if (delimiter.length !== 1) {
      throw new RangeError(
        "native reader only supports single-character delimiters",
      );
    }
  }

  const _options: ReaderOptions = {
    chunkSize,
    pageSize,
    prefetch,
    delimiter,
  };

  let nativeReader: Pager | undefined;

  if (tryNative) {
    const _nativeOptions: NativeReaderOptions = {
      pageSize,
      delimiter,
      backward,
    };

    try {
      nativeReader = createNativePager(filepath, _nativeOptions);
    } catch {}
  }

  const reader =
    tryNative && nativeReader
      ? nativeReader
      : useWorker
        ? createWorkerReader(filepath, _options)
        : backward
          ? createBackwardReader(filepath, _options)
          : createForwardReader(filepath, _options);

  if (process.env.TEST_CLEANUPS) {
    (globalThis as any).__test_cleanups__ ??= [];
    (globalThis as any).__test_cleanups__.push(reader.close);
  }

  return reader;
}

export default createPager;

export { createNativePager } from "./native.js";

export type * from "./types.js";
