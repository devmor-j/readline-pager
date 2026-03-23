import { createRequire } from "node:module";
import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pager } from "./types.js";

const require = createRequire(import.meta.url);

type AddonFD = object | null;
type AddonData = Buffer | null;

interface NativeAddon {
  open: (filepath: string, pageSize: number, delimiter: string) => AddonFD;
  next: (fd: AddonFD) => Promise<AddonData>;
  nextSync: (fd: AddonFD) => AddonData;
  close: (fd: AddonFD) => Promise<void>;
}

function loadNativeAddon(): NativeAddon {
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
): Pager {
  const pagerNative = loadNativeAddon();

  let fd: AddonFD = null;
  let closed = false;

  const init = () => {
    // TODO: process pageSize on native addon (cc)
    fd = pagerNative.open(filepath, pageSize, delimiter);
  };

  const next = async () => {
    if (closed || !fd) return null;

    const data = await pagerNative.next(fd);
    if (!data) return null;

    return data.toString("utf8").split(delimiter);
  };

  const nextSync = () => {
    if (closed || !fd) return null;

    const data = pagerNative.nextSync(fd);
    if (!data) return null;

    return data.toString("utf8").split(delimiter);
  };

  const close = async () => {
    if (!closed || fd) {
      closed = true;
      await pagerNative.close(fd);
      fd = null;
    }
  };

  function tryClose() {
    void close().catch(() => {});
  }

  init();

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
