export interface ReaderOptions {
  chunkSize: number;
  pageSize: number;
  delimiter: string;
  prefetch: number;
}

export interface NativeReaderOptions {
  pageSize: number;
  delimiter: string;
  backward: boolean;
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
