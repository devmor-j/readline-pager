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
    pageSize = 1_000,
    delimiter = "\n",
    prefetch = 1,
    backward = false,
    useWorker = false,
  } = options;

  if (!filepath) throw new Error("filepath required");
  if (pageSize <= 0) throw new RangeError("pageSize must be > 0");
  if (prefetch <= 0) throw new RangeError("prefetch must be >= 1");

  if (backward && useWorker)
    throw new Error("backward not supported with useWorker");

  return useWorker
    ? createWorkerReader(filepath, { pageSize, prefetch, delimiter })
    : backward
      ? createBackwardReader(filepath, { pageSize, prefetch, delimiter })
      : createForwardReader(filepath, { pageSize, prefetch, delimiter });
}

export type * from "./types.js";
