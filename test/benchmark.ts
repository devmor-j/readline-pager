import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline/promises";
import type { PagerOptions } from "../dist/main.mjs";
import { createNativePager, createPager } from "../dist/main.mjs";
import type { BenchmarkArgs } from "./utils.ts";
import {
  createBigTmpFile,
  logThroughput,
  parseProcessArgv,
  tryDeleteFile,
  whatRuntime,
} from "./utils.ts";

async function runNodeReadline(filepath: string) {
  const readline = createInterface({ input: createReadStream(filepath) });

  const startTime = process.hrtime.bigint();

  for await (const line of readline) {
  }

  const endTime = process.hrtime.bigint();

  return endTime - startTime;
}

async function runDenoReadlines(filepath: string) {
  const file = await Deno.open(filepath);
  const decoder = new TextDecoder();
  let leftover = "";

  const startTime = process.hrtime.bigint();

  for await (const chunk of file.readable) {
    const str = decoder.decode(chunk, { stream: true });
    const lines = (leftover + str).split(/\r?\n/);
    leftover = lines.pop() ?? "";

    for (const line of lines) {
    }
  }

  if (leftover) {
  }

  const endTime = process.hrtime.bigint();

  return endTime - startTime;
}

async function runDenoReadlinesBatched(filepath: string, batchSize: number) {
  await using file = await Deno.open(filepath);
  const reader = file.readable.getReader();
  const decoder = new TextDecoder();
  let leftover = "";

  const startTime = process.hrtime.bigint();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const page = (leftover + chunk).split(/\r?\n/);

      leftover = page.pop() ?? "";
    }

    if (leftover) {
    }
  } finally {
    reader.releaseLock();
  }

  const endTime = process.hrtime.bigint();

  return endTime - startTime;
}

async function runBunReadlines(filepath: string) {
  const file = Bun.file(filepath);
  const stream = file.stream().pipeThrough(new TextDecoderStream());
  let buffer = "";

  const startTime = process.hrtime.bigint();

  for await (const chunk of stream) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
    }
  }

  const endTime = process.hrtime.bigint();

  return endTime - startTime;
}

async function runBunReadlinesBatched(filepath: string, batchSize: number) {
  const file = Bun.file(filepath);
  const stream = file.stream();
  const decoder = new TextDecoder();
  let leftover: Uint8Array | null = null;
  let count = 0;

  const startTime = process.hrtime.bigint();

  for await (const chunk of stream) {
    let start = 0;
    let buffer = chunk;

    if (leftover) {
      const next = new Uint8Array(leftover.length + chunk.length);
      next.set(leftover);
      next.set(chunk, leftover.length);
      buffer = next;
      leftover = null;
    }

    while (true) {
      const end = buffer.indexOf(10, start);
      if (end === -1) {
        leftover = buffer.slice(start);
        break;
      }

      const lineEnd = end > 0 && buffer[end - 1] === 13 ? end - 1 : end;
      const _line = decoder.decode(buffer.subarray(start, lineEnd));

      count++;
      if (count >= batchSize) {
        count = 0;
      }
      start = end + 1;
    }
  }

  const endTime = process.hrtime.bigint();

  return endTime - startTime;
}

async function runReadlinePager(
  filepath: string,
  batchSize: number,
  args: BenchmarkArgs,
) {
  const options: PagerOptions = {
    pageSize: batchSize,
  };

  if (args["chunk-size"]) options.chunkSize = args["chunk-size"];
  if (args.backward) options.backward = args.backward;
  if (args.prefetch) options.prefetch = args.prefetch;

  const pager = createPager(filepath, options);

  const startTime = process.hrtime.bigint();

  for await (const page of pager) {
    for (const line of page) {
    }
  }

  const endTime = process.hrtime.bigint();

  return endTime - startTime;
}

async function runNativeReadlinePager(filepath: string, batchSize: number) {
  try {
    const pager = createNativePager(filepath, {
      pageSize: batchSize,
    });

    const startTime = process.hrtime.bigint();

    for await (const page of pager) {
      for (const line of page) {
      }
    }

    const endTime = process.hrtime.bigint();

    return endTime - startTime;
  } catch {}

  return null;
}

async function benchmark(args = parseProcessArgv()) {
  const LINES = args.lines ?? 1e7;
  const BATCH_SIZE = args["page-size"] ?? 1_000;

  const runtime = whatRuntime();
  const filename = `bench_${randomUUID().substring(0, 8)}.txt`;
  const { filebytes, filepath } = await createBigTmpFile(filename, LINES);

  const fileMB = filebytes / 1_024 / 1_024;

  console.log(
    `📦 Benchmark: ${LINES.toLocaleString()} lines | ${Math.round(fileMB)} MB | [32m${runtime}[0m`,
  );

  if (runtime === "Deno") {
    {
      const durationNS = await runDenoReadlines(filepath);
      logThroughput("deno:line", durationNS, filebytes);
    }

    {
      const durationNS = await runDenoReadlinesBatched(filepath, BATCH_SIZE);
      logThroughput("deno:page", durationNS, filebytes);
    }
  }

  if (runtime === "Bun") {
    {
      const durationNS = await runBunReadlines(filepath);
      logThroughput("bun:line", durationNS, filebytes);
    }

    {
      const durationNS = await runBunReadlinesBatched(filepath, BATCH_SIZE);
      logThroughput("bun:page", durationNS, filebytes);
    }
  }

  {
    const durationNS = await runNodeReadline(filepath);
    logThroughput("readline", durationNS, filebytes);
  }

  {
    const durationNS = await runReadlinePager(filepath, BATCH_SIZE, args);
    logThroughput("readline-pager:js", durationNS, filebytes);
  }

  {
    const durationNS = await runNativeReadlinePager(filepath, BATCH_SIZE);

    if (durationNS !== null) {
      logThroughput("readline-pager:cpp", durationNS, filebytes);
    }
  }

  console.log("-".repeat(60));
  await tryDeleteFile(filepath);
}

benchmark();
