import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createPager } from "../dist/main.mjs";
import type { BenchmarkArgs } from "./_utils.ts";
import {
  createBigTmpFile,
  logThroughput,
  parseProcessArgv,
  tryDeleteFile,
} from "./_utils.ts";

/** Only works when running with bunjs */
async function* bunReadLines(filepath: string) {
  const file = Bun.file(filepath);

  const stream = file.stream().pipeThrough(new TextDecoderStream());

  let buffer = "";

  for await (const chunk of stream) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      yield line;
    }
  }

  if (buffer.length > 0) {
    yield buffer;
  }
}

async function benchmark(args: BenchmarkArgs = {}) {
  const LINES = args.lines ?? 1e6;
  const CHUNK_SIZE = args["chunk-size"] ?? 120 * 1_024;
  const PAGE_SIZE = args["page-size"] ?? 1e3;
  const BACKWARD = args.backward ?? false;
  const PREFETCH = args.prefetch ?? 1;
  const USE_WORKER = args["use-worker"] ?? false;

  const filename = `benchmark_${randomUUID().substring(0, 8)}.txt`;
  const { filebytes, filepath } = await createBigTmpFile(filename, LINES);

  console.log(
    `📦 Generated ${LINES.toLocaleString()} lines → ${filepath}\n▶️ Starting benchmark...`,
  );

  const TIME = {
    readline: { start: 0n, end: 0n },
    bun: { start: 0n, end: 0n },
    pager: { start: 0n, end: 0n },
  };

  const readline = createInterface(createReadStream(filepath));

  TIME.readline.start = process.hrtime.bigint();
  for await (const _ of readline) {
  }
  TIME.readline.end = process.hrtime.bigint();

  logThroughput("readline", TIME.readline.end, TIME.readline.start, filebytes);

  if (typeof Bun !== "undefined") {
    TIME.bun.start = process.hrtime.bigint();
    for await (const _ of bunReadLines(filepath)) {
    }
    TIME.bun.end = process.hrtime.bigint();

    logThroughput("bun", TIME.bun.end, TIME.bun.start, filebytes);
  }

  const pager = createPager(filepath, {
    chunkSize: CHUNK_SIZE,
    pageSize: PAGE_SIZE,
    backward: BACKWARD,
    prefetch: PREFETCH,
    useWorker: USE_WORKER,
  });

  TIME.pager.start = process.hrtime.bigint();
  for await (const _ of pager) {
  }
  TIME.pager.end = process.hrtime.bigint();

  logThroughput("pager", TIME.pager.end, TIME.pager.start, filebytes);

  await tryDeleteFile(filepath);
}

benchmark(parseProcessArgv());
