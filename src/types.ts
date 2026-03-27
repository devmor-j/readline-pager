export interface ReaderOptions {
  chunkSize: number;
  pageSize: number;
  delimiter: string;
  prefetch: number;
}

export interface PagerOptions extends Partial<ReaderOptions> {
  backward?: boolean;
  useWorker?: boolean;
  tryNative?: boolean;
}

export interface NativeReaderOptions {
  pageSize: number;
  delimiter: string;
  backward: boolean;
}

export type WorkerMessage =
  | {
      type: "page";
      data: string[];
    }
  | {
      type: "error";
      error: unknown;
    }
  | {
      type: "done";
    };

type AddonFD = object | null;
type AddonData = Buffer | null;

export interface NativeAddon {
  open: (
    filepath: string,
    pageSize: number,
    delimiter: string,
    backward: boolean,
  ) => AddonFD;
  next: (fd: AddonFD) => Promise<AddonData>;
  nextSync: (fd: AddonFD) => AddonData;
  close: (fd: AddonFD) => Promise<void>;
}

export interface Pager {
  next(): Promise<string[] | null>;
  nextSync(): string[] | null;
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<string[]>;
  [Symbol.iterator](): Iterator<string[]>;
}
