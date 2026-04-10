import { createNativePager } from "./native.js";
import { createBackwardReader } from "./reader/backward.reader.js";
import { createForwardReader } from "./reader/forward.reader.js";
import type { Output, Pager, PagerOptions, ReaderOptions } from "./types.js";

export function createPager<T extends Output>(
  filepath: string,
  options: PagerOptions & { output: T },
): Pager<T>;

export function createPager(
  filepath: string,
  options?: PagerOptions,
): Pager<"string">;

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
    output = "string",
  } = options;

  if (!filepath) throw new Error("filepath required");
  if (pageSize < 1) throw new RangeError("pageSize must be >= 1");
  if (prefetch < 1) throw new RangeError("prefetch must be >= 1");

  const readerOptions: ReaderOptions = {
    chunkSize,
    pageSize,
    prefetch,
    delimiter,
    output,
  };

  const reader = backward
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
