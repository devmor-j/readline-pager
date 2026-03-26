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

export interface Pager extends AsyncIterable<string[]>, Iterable<string[]> {
  next(): Promise<string[] | null>;
  nextSync(): string[] | null;
  close(): Promise<void>;
}

export interface NativeReaderOptions {
  pageSize: number;
  delimiter: string;
  backward: boolean;
}

export type AddonFD = object | null;

export type AddonData = Buffer | null;

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
