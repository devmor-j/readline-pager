import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { PagerOptions } from "./dist/main.mjs";
import { createNativePager, createPager } from "./dist/main.mjs";

export function createBestPager(filepath: string, options?: PagerOptions) {
  try {
    return createNativePager(filepath, options);
  } catch {
    return createPager(filepath, options);
  }
}

// const filepath = "aave.csv";
const filepath = "btc.csv";
// const filepath = "tmp/bench_100M.txt";
// const filepath = "tmp/small.txt";

async function readline() {
  const readline = createInterface(createReadStream(filepath));
  const startTime1 = process.hrtime.bigint();
  for await (const line of readline) {
  }
  const endTime1 = process.hrtime.bigint();
  console.log(`readline: ${Number(endTime1 - startTime1) / 1e6}`);
}

async function readlinePager() {
  const pager2 = createPager(filepath);
  const startTime2 = process.hrtime.bigint();
  for await (const page of pager2) {
  }
  const endTime2 = process.hrtime.bigint();
  console.log(`pager: ${Number(endTime2 - startTime2) / 1e6}`);

  const pager3 = createPager(filepath);
  const startTime3 = process.hrtime.bigint();
  for (const page of pager3) {
  }
  const endTime3 = process.hrtime.bigint();
  console.log(`pagerSync: ${Number(endTime3 - startTime3) / 1e6}`);
}

async function nativeCPP() {
  const pager4 = createBestPager(filepath);
  const startTime4 = process.hrtime.bigint();
  for await (const page of pager4) {
  }
  const endTime4 = process.hrtime.bigint();
  console.log(`nativeCPP: ${Number(endTime4 - startTime4) / 1e6}`);

  const pager5 = createNativePager(filepath);
  const startTime5 = process.hrtime.bigint();
  for (const page of pager5) {
  }
  const endTime5 = process.hrtime.bigint();
  console.log(`nativeCPPSync: ${Number(endTime5 - startTime5) / 1e6}`);
}

// await readline();
await readlinePager();
await nativeCPP();
