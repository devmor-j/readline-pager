import { createRequire } from "node:module";
import { arch, platform } from "node:os";
import type { NativeAddon, NativeReaderOptions, Pager } from "./types.js";

const require = createRequire(import.meta.url);

function isMusl(): boolean {
  if (platform() !== "linux") return false;

  try {
    const report = process.report?.getReport?.() as any;
    return !report?.header?.glibcVersionRuntime;
  } catch {
    return false;
  }
}

function getPackageName(): string {
  const p = platform();
  const a = arch();

  switch (p) {
    case "darwin":
    case "win32": {
      return `@devmor-j/readline-pager-${p}-${a}`;
    }
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
    const UNAVAILABLE = `Native addon not available for ${p}/${a}.`;
    throw new Error(UNAVAILABLE);
  }
}

export function createNativePager(
  filepath: string,
  options?: Partial<NativeReaderOptions>,
): Pager {
  const {
    pageSize = 1_000,
    delimiter = "\n",
    backward = false,
  } = options ?? {};

  if (!filepath) throw new Error("filepath required");
  if (pageSize < 1) throw new RangeError("pageSize must be >= 1");
  if (delimiter.length !== 1) {
    throw new RangeError(
      "native reader only supports single-character delimiters",
    );
  }

  const nativePager = loadNativeAddon();
  let fd = nativePager.open(filepath, pageSize, delimiter, backward);
  let closed = false;

  const next = async () => {
    if (closed || !fd) return null;

    const data = await nativePager.next(fd);
    if (!data) return null;

    return data.toString("utf8").split(delimiter);
  };

  const nextSync = () => {
    if (closed || !fd) return null;

    const data = nativePager.nextSync(fd);
    if (!data) return null;

    return data.toString("utf8").split(delimiter);
  };

  const close = async () => {
    if (closed) return;
    closed = true;

    if (fd) {
      try {
        await nativePager.close(fd);
      } catch {}
      fd = null;
    }
  };

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
