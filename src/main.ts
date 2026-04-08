import { createNativePager } from "./native.js";
import {
  createBackwardReader,
  createForwardReader,
  createWorkerReader,
} from "./reader/index.reader.js";
import type {
  NativeReaderOptions,
  Output,
  Pager,
  PagerOptions,
  ReaderOptions,
} from "./types.js";

export function createPager<T extends Output>(
  filepath: string,
  options: PagerOptions & { output: T },
): Pager<T>;

export function createPager(
  filepath: string,
  options: PagerOptions,
): Pager<"array">;

export function createPager<T extends Output>(
  filepath: string,
  options: PagerOptions & { output?: T } = {},
): Pager {
  const {
    chunkSize = 64 * 1_024,
    pageSize = 1_000,
    delimiter = "\n",
    prefetch = 8,
    backward = false,
    useWorker = false,
    tryNative = true,
    output = "array",
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

  const readerOptions: ReaderOptions = {
    chunkSize,
    pageSize,
    prefetch,
    delimiter,
    output,
  };

  let nativeReader: Pager | undefined;

  if (tryNative) {
    const nativeOptions: NativeReaderOptions = {
      pageSize,
      delimiter,
      backward,
      output,
    };

    try {
      nativeReader = createNativePager(filepath, nativeOptions);
    } catch {}
  }

  const reader =
    tryNative && nativeReader
      ? nativeReader
      : useWorker
        ? createWorkerReader(filepath, readerOptions)
        : backward
          ? createBackwardReader(filepath, readerOptions)
          : createForwardReader(filepath, readerOptions);

  if (process.env.PAGER_TEST_CLEANUPS) {
    (globalThis as any).__pager_test_cleanups__ ??= [];
    (globalThis as any).__pager_test_cleanups__.push(reader.close);
  }

  return reader;
}

export type * from "./types.js";
export { createNativePager };
export default createPager;
