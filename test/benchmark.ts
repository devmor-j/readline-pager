import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createPager } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

interface BenchmarkArgs {
  lines?: number;
  "page-size"?: number;
  backward?: boolean;
  prefetch?: number;
  "use-worker"?: boolean;
}

/** Parse CLI args supporting --arg=val and --arg val */
function parseProcessArgv(): BenchmarkArgs {
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

async function benchmark(args: BenchmarkArgs = {}) {
  const LINES = args.lines ?? 1e6;
  const PAGE_SIZE = args["page-size"] ?? 1e3;
  const BACKWARD = args.backward ?? false;
  const PREFETCH = args.prefetch ?? 1;
  const USE_WORKER = args["use-worker"] ?? false;
  const filename = `benchmark_${randomUUID().substring(0, 8)}.txt`;

  const MAX_WRITABLE_LINES = 1e6;
  let remainingLines = LINES;
  let isFirstWrite = true;
  let filepath = "";

  const cleanupSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  cleanupSignals.forEach((signal) => {
    process.on(signal, async () => {
      await tryDeleteFile(filepath);
      process.exit(0);
    });
  });

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

  const { size: fileBytes } = await stat(filepath);

  console.log(
    `📦 Generated ${LINES.toLocaleString()} lines → ${filepath}\n▶️ Starting benchmark...`,
  );

  const TIME = {
    readline: { start: BigInt(0), end: BigInt(0) },
    pager: { start: BigInt(0), end: BigInt(0) },
  };

  const readline = createInterface(createReadStream(filepath));

  TIME.readline.start = process.hrtime.bigint();
  for await (const _ of readline) {
  }
  TIME.readline.end = process.hrtime.bigint();

  const pager = createPager(filepath, {
    pageSize: PAGE_SIZE,
    backward: BACKWARD,
    prefetch: PREFETCH,
    useWorker: USE_WORKER,
  });

  TIME.pager.start = process.hrtime.bigint();
  for await (const _ of pager) {
  }
  TIME.pager.end = process.hrtime.bigint();

  const logThroughput = (name: string, endTime: bigint, startTime: bigint) => {
    const elapsedMS = Number(endTime - startTime) / 1e6;
    const seconds = elapsedMS / 1_000;
    const fileMB = fileBytes / (1_024 * 1_024);
    const throughput = fileMB / seconds;

    console.log(
      `🚀 [${name}] Read ${fileMB.toFixed(2)} MB in ${elapsedMS.toFixed(2)} ms. Throughput: ${throughput.toFixed(2)} MB/s`,
    );
  };

  logThroughput("readline", TIME.readline.end, TIME.readline.start);
  logThroughput("pager   ", TIME.pager.end, TIME.pager.start);

  await tryDeleteFile(filepath);
}

benchmark(parseProcessArgv());
