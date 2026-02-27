import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createPager } from "../dist/main.mjs";
import type { BenchmarkArgs } from "./_utils.ts";
import {
  createBigTmpFile,
  logThroughput,
  parseProcessArgv,
  tryDeleteFile,
  whatRuntime,
} from "./_utils.ts";

/** 1. NODE: Standard (Line-by-Line) */
async function runNodeReadline(filepath: string) {
  const readline = createInterface({ input: createReadStream(filepath) });

  const startTime = process.hrtime.bigint();

  for await (const line of readline) {
  }

  const endTime = process.hrtime.bigint();

  return {
    startTime,
    endTime,
  };
}

/** 2. DENO: Standard (Line-by-Line) */
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

  return {
    startTime,
    endTime,
  };
}

/** 3. DENO: Batched (Page-by-Page) */
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

  return {
    startTime,
    endTime,
  };
}

/** 4. BUN: Standard (Line-by-Line) */
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
      /* no-op */
    }
  }

  const endTime = process.hrtime.bigint();

  return {
    startTime,
    endTime,
  };
}

/** 5. BUN: Batched (Page-by-Page) */
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

  return {
    startTime,
    endTime,
  };
}

async function runReadlinePager(
  filepath: string,
  batchSize: number,
  args: BenchmarkArgs,
) {
  const pager = createPager(filepath, {
    chunkSize: args["chunk-size"] ?? 100 * 1_024,
    pageSize: batchSize,
    backward: args.backward ?? false,
    prefetch: args.prefetch ?? 1,
    useWorker: args["use-worker"] ?? false,
  });

  const startTime = process.hrtime.bigint();

  for await (const _ of pager) {
    /* iterating pages */
  }

  const endTime = process.hrtime.bigint();

  return {
    startTime,
    endTime,
  };
}

async function benchmark(args = parseProcessArgv()) {
  const LINES = args.lines ?? 1e7;
  const BATCH_SIZE = args["page-size"] ?? 1_000;

  const runtime = whatRuntime();
  const filename = `bench_${randomUUID().substring(0, 8)}.txt`;
  const { filebytes, filepath } = await createBigTmpFile(filename, LINES);

  console.log(
    `📦 Benchmark: ${LINES.toLocaleString()} lines | ${(filebytes / 1_024 / 1_024).toFixed(2)} MB | Runtime: [32m${runtime}[0m`,
  );

  // --- 1. Node ---
  {
    const { startTime, endTime } = await runNodeReadline(filepath);
    logThroughput("node:line", endTime, startTime, filebytes);
  }

  // --- 2. Deno ---
  if (runtime === "Deno") {
    {
      const { startTime, endTime } = await runDenoReadlines(filepath);
      logThroughput("deno:line", endTime, startTime, filebytes);
    }

    {
      const { startTime, endTime } = await runDenoReadlinesBatched(
        filepath,
        BATCH_SIZE,
      );
      logThroughput("deno:page", endTime, startTime, filebytes);
    }
  }

  // --- 3. Bun ---
  if (runtime === "Bun") {
    {
      const { startTime, endTime } = await runBunReadlines(filepath);
      logThroughput("bun:line", endTime, startTime, filebytes);
    }

    {
      const { startTime, endTime } = await runBunReadlinesBatched(
        filepath,
        BATCH_SIZE,
      );
      logThroughput("bun:page", endTime, startTime, filebytes);
    }
  }

  // --- 4. readline-pager (Node, Deno & Bun) ---
  {
    const { startTime, endTime } = await runReadlinePager(
      filepath,
      BATCH_SIZE,
      args,
    );
    logThroughput("readline-pager", endTime, startTime, filebytes);
  }

  console.log("-".repeat(60));
  await tryDeleteFile(filepath);
}

benchmark();
