import { createRequire } from "node:module";
import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

type PagerHandle = object | null;
type PagerData = Buffer | null;

export interface PagerNative {
  open: (filepath: string, pageSize: number, delimiter: string) => PagerHandle;
  next: (fd: PagerHandle) => Promise<PagerData>;
  nextSync: (fd: PagerHandle) => PagerData;
  close: (fd: PagerHandle) => void;
}

function loadNativeAddon(): PagerNative {
  const p = platform();
  const a = arch();

  const getDirname = () => {
    try {
      return dirname(fileURLToPath(import.meta.url));
    } catch {
      return __dirname;
    }
  };

  const addonPath = join(
    getDirname(),
    "..",
    "prebuilds",
    `${p}-${a}`,
    "readline-pager.node",
  );

  try {
    return require(addonPath);
  } catch {
    throw new Error("native addon not found, please run build script.");
  }
}

export function createNativePager(
  filepath: string,
  { pageSize = 1_000, delimiter = "\n" } = {},
) {
  const pagerNative = loadNativeAddon();

  let fd: PagerHandle = null;
  let closed = false;

  const init = () => {
    fd = pagerNative.open(filepath, pageSize, delimiter);
  };

  const next = () => {
    if (closed || !fd) return null;
    return pagerNative.next(fd);
  };

  const nextSync = (): PagerData => {
    if (closed || !fd) return null;
    return pagerNative.nextSync(fd);
  };

  const close = () => {
    if (fd && !closed) {
      closed = true;
      pagerNative.close(fd);
      fd = null;
    }
  };

  init();

  return {
    next,
    nextSync,
    close,
    async *[Symbol.asyncIterator]() {
      try {
        while (true) {
          const buffer = await next();
          if (!buffer) break;
          yield buffer;
        }
      } finally {
        close();
      }
    },
    *[Symbol.iterator]() {
      try {
        while (true) {
          const buffer = nextSync();
          if (!buffer) break;
          yield buffer;
        }
      } finally {
        close();
      }
    },
  };
}
