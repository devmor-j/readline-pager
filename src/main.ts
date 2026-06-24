import { createBackwardReader } from "./reader/backward.reader.ts";
import { createForwardReader } from "./reader/forward.reader.ts";
import type { Output, Pager, PagerOptions, ReaderOptions } from "./types.ts";

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

  return reader;
}

export { createNativePager } from "./native.ts";
export type { Pager, PagerOptions } from "./types.ts";
