import { createRequire } from "node:module";
import { arch, platform } from "node:os";
import type { NativeAddon, NativeReaderOptions, Pager } from "./types.js";

const require = createRequire(import.meta.url);

function isMusl(): boolean {
  if (platform() !== "linux") return false;

  try {
    const report = process.report?.getReport?.() as any;
    return !report?.header?.glibcVersionRuntime;
  } catch {}

  return false;
}

function getPackageName(): string {
  const p = platform();
  const a = arch();

  switch (p) {
    case "linux": {
      const libc = isMusl() ? "musl-" : "";
      return `@devmor-j/readline-pager-${p}-${libc}${a}`;
    }
    default: {
      throw new Error(`Unsupported platform: ${p}/${a}`);
    }
  }
}

function loadNativeAddon(): NativeAddon {
  try {
    return require(getPackageName());
  } catch {
    const p = platform();
    const a = arch();
    throw new Error(`Native addon not available for ${p}/${a}.`);
  }
}

export function createNativePager(
  filepath: string,
  options: Partial<NativeReaderOptions> = {},
): Pager {
  const { pageSize = 1_000, delimiter = "\n", backward = false } = options;

  if (!filepath) throw new Error("filepath required");
  if (pageSize < 1) throw new RangeError("pageSize must be >= 1");
  if (delimiter?.length > 1) {
    throw new RangeError(
      "native reader only supports single-character delimiters",
    );
  }

  const nativeReader = loadNativeAddon();

  if (process.env.PAGER_TEST_CLEANUPS) {
    (globalThis as any).__pager_test_cleanups__ ??= [];
    (globalThis as any).__pager_test_cleanups__.push(nativeReader.close);
  }

  let fd = nativeReader.open(filepath, pageSize, delimiter, backward);
  let closed = false;

  async function next() {
    if (closed || !fd) return null;

    const data = await nativeReader.next(fd);
    if (!data) return null;

    return data.toString("utf8").split(delimiter);
  }

  function nextSync() {
    if (closed || !fd) return null;

    const data = nativeReader.nextSync(fd);
    if (!data) return null;

    return data.toString("utf8").split(delimiter);
  }

  async function close() {
    if (closed || !fd) return;
    closed = true;

    if (fd) {
      try {
        await nativeReader.close(fd);
      } catch {}
      fd = null;
    }
  }

  function tryClose() {
    void close().catch(() => {});
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
        tryClose();
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
        tryClose();
      }
    },
  };
}
