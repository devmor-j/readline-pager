import * as fs from "node:fs";
import * as readline from "node:readline";
import { parentPort, workerData } from "node:worker_threads";

const { filepath, pageSize } = workerData as {
  filepath: string;
  pageSize: number;
};

const stream = fs.createReadStream(filepath, { encoding: "utf8" });
const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

let buffer: string[] = [];
let paused = false;

rl.on("line", (line: string) => {
  buffer.push(line);

  if (buffer.length === pageSize) {
    parentPort?.postMessage({ type: "page", data: buffer });
    buffer = [];

    if (paused) rl.pause();
  }
});

rl.on("close", () => {
  if (buffer.length) parentPort?.postMessage({ type: "page", data: buffer });

  parentPort?.postMessage({ type: "done" });
});

parentPort?.on("message", (msg: any) => {
  if (msg.type === "pause") {
    paused = true;
    rl.pause();
  }

  if (msg.type === "resume") {
    paused = false;
    rl.resume();
  }
});
