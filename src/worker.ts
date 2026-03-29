import { open } from "node:fs/promises";
import { parentPort, workerData } from "node:worker_threads";
import type { ReaderOptions, WorkerMessage } from "./types.js";

const { filepath, options } = workerData;
const { chunkSize, pageSize, delimiter } = options as ReaderOptions;

const backpressure = pageSize * 8;

function post(msg: WorkerMessage) {
  if (!parentPort) process.exit(1);
  parentPort.postMessage(msg);
}

void (async () => {
  try {
    const fd = await open(filepath, "r");
    const { size } = await fd.stat();

    let pos = 0;
    let buffer = "";
    const local: string[] = [];

    while (pos < size) {
      const readSize = Math.min(chunkSize, size - pos);
      const buf = Buffer.allocUnsafe(readSize);
      const { bytesRead } = await fd.read(buf, 0, readSize, pos);
      pos += bytesRead;

      buffer = buffer + buf.toString("utf8", 0, bytesRead);

      let idx: number;
      while ((idx = buffer.indexOf(delimiter)) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + delimiter.length);
        local.push(line);

        if (local.length >= pageSize) {
          const page = local.splice(0, pageSize);
          post({ type: "page", data: page });

          if (local.length > backpressure) {
            await new Promise((r) => setImmediate(r));
          }
        }
      }
    }

    local.push(buffer);

    while (local.length > 0) {
      const page = local.splice(0, pageSize);
      post({ type: "page", data: page });
    }

    post({ type: "done" });

    await fd.close();
  } catch (err) {
    post({ type: "error", error: err });
  }
})();
