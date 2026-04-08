export type AsyncFunction = () => Promise<void>;

export type Output = "array" | "buffer";

export type PageOutput = string[] | Buffer;

export type ResolvePageOutput<T extends Output> = T extends "buffer"
  ? Buffer
  : string[];

export interface ReaderOptions {
  chunkSize: number;
  pageSize: number;
  delimiter: string;
  prefetch: number;
  output: Output;
}

export interface NativeReaderOptions {
  pageSize: number;
  delimiter: string;
  backward: boolean;
  output: Output;
}

export type PagerOptions = Partial<ReaderOptions> & {
  backward?: boolean;
  tryNative?: boolean;
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

export interface Pager<T extends Output = "array"> {
  next(): Promise<ResolvePageOutput<T> | null>;
  nextSync(): ResolvePageOutput<T> | null;
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<ResolvePageOutput<T>>;
  [Symbol.iterator](): Iterator<ResolvePageOutput<T>>;
}
