import {
  createBackwardReader,
  createForwardReader,
  createWorkerReader,
} from "./reader/index.reader.js";
import type { Pager, PagerOptions } from "./types.js";

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
  } = options;

  if (!filepath) throw new Error("filepath required");
  if (pageSize < 1) throw new RangeError("pageSize must be >= 1");
  if (prefetch < 1) throw new RangeError("prefetch must be >= 1");

  if (backward && useWorker)
    throw new Error("backward not supported with useWorker");

  return useWorker
    ? createWorkerReader(filepath, { chunkSize, pageSize, prefetch, delimiter })
    : backward
      ? createBackwardReader(filepath, {
          chunkSize,
          pageSize,
          prefetch,
          delimiter,
        })
      : createForwardReader(filepath, {
          chunkSize,
          pageSize,
          prefetch,
          delimiter,
        });
}

export default createPager;

export { createNativePager } from "./native.js";

export type * from "./types.js";
