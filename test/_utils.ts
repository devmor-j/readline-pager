import { randomUUID } from "node:crypto";
import { appendFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TMP_DIR = "./tmp";

export interface CreateTmpFileOptions {
  filename?: string;
  append?: boolean;
}

await mkdir(TMP_DIR, { recursive: true });

export async function createTmpFile(
  content: string,
  { filename = randomUUID(), append = false }: CreateTmpFileOptions = {},
): Promise<string> {
  const filepath = join(TMP_DIR, filename);

  if (append) {
    await appendFile(filepath, content);
  } else {
    await writeFile(filepath, content);
  }

  return filepath;
}

export function tryDeleteFile(filepath: string) {
  return rm(filepath, { force: true }).catch(() => {});
}

export function createTextLines(count: number) {
  const lines: string[] = [];

  for (let i = 0; i < count; i++) {
    lines.push(randomUUID());
  }

  return lines.join("\n");
}

export interface BenchmarkArgs {
  lines?: number;
  "chunk-size"?: number;
  "page-size"?: number;
  backward?: boolean;
  prefetch?: number;
  "use-worker"?: boolean;
}

/** Parse CLI args supporting --arg=val and --arg val */
export function parseProcessArgv(): BenchmarkArgs {
  const argv = process.argv.slice(2);
  const args: Partial<BenchmarkArgs> = {};

  function setArg<K extends keyof BenchmarkArgs>(
    key: K,
    value: BenchmarkArgs[K],
  ) {
    args[key] = value;
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const raw = arg.slice(2);
    let key: keyof BenchmarkArgs;
    let value: string | undefined;

    if (raw.includes("=")) {
      const parts = raw.split("=");
      key = parts[0] as keyof BenchmarkArgs;
      value = parts[1];
    } else {
      key = raw as keyof BenchmarkArgs;
      const next = argv[i + 1];

      if (next && !next.startsWith("--")) {
        value = next;
        i++;
      }
    }

    switch (key) {
      case "lines":
      case "chunk-size":
      case "page-size":
      case "prefetch": {
        if (value !== undefined) {
          const num = Number(value);
          if (!Number.isNaN(num)) {
            setArg(key, num);
          }
        }
        break;
      }

      case "backward":
      case "use-worker": {
        setArg(key, value === undefined ? true : value === "true");
        break;
      }
    }
  }

  return args;
}

export async function createBigTmpFile(
  filename: string,
  lines: number,
  autoDelete = true,
) {
  const MAX_WRITABLE_LINES = 1e6;

  let remainingLines = lines;
  let isFirstWrite = true;
  let filepath = "";

  while (remainingLines > 0) {
    const chunkSize = Math.min(remainingLines, MAX_WRITABLE_LINES);
    remainingLines -= chunkSize;

    const content = createTextLines(chunkSize);

    if (isFirstWrite) {
      filepath = await createTmpFile(content, { filename });
      isFirstWrite = false;
    } else {
      await createTmpFile(content, { filename, append: true });
    }

    process.stdout.write(
      `⏳ Remaining lines to write: ${remainingLines.toLocaleString()}\r`,
    );
  }

  const { size: filebytes } = await stat(filepath);

  if (autoDelete) {
    const cleanupSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    cleanupSignals.forEach((signal) => {
      process.on(signal, async () => {
        await tryDeleteFile(filepath);
        process.exit(0);
      });
    });
  }

  return { filebytes, filepath };
}

export function logThroughput(
  name: string,
  endTime: bigint,
  startTime: bigint,
  filebytes: number,
) {
  const elapsedMS = Number(endTime - startTime) / 1e6;
  const seconds = elapsedMS / 1_000;
  const fileMB = filebytes / (1_024 * 1_024);
  const throughput = fileMB / seconds;

  console.log(
    `🚀 [${name}] Read ${fileMB.toFixed(2)} MB in ${elapsedMS.toFixed(2)} ms ==> Throughput: ${throughput.toFixed(2)} MB/s`,
  );
}
