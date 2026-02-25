export interface ReaderOptions {
  chunkSize: number;
  pageSize: number;
  delimiter: string;
  prefetch: number;
}

export interface PagerOptions extends Partial<ReaderOptions> {
  backward?: boolean;
  useWorker?: boolean;
}

export interface Pager extends AsyncIterable<string[]> {
  next(): Promise<string[] | null>;
  close(): void;
  readonly lineCount: number;
  readonly firstLine: string | null;
  readonly lastLine: string | null;
}
