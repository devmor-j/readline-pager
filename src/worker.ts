import { open } from "node:fs/promises";
import { parentPort, workerData } from "node:worker_threads";
import { CHUNK_SIZE } from "./constants.js";

const { filepath, pageSize, delimiter = "\n" } = workerData;

(async () => {
  const fd = await open(filepath, "r");
  const { size } = await fd.stat();

  let pos = 0;
  let buffer = "";
  const local: string[] = [];

  while (pos < size) {
    const readSize = Math.min(CHUNK_SIZE, size - pos);
    const buf = Buffer.allocUnsafe(readSize);
    const { bytesRead } = await fd.read(buf, 0, readSize, pos);
    pos += bytesRead;

    buffer += buf.toString("utf8", 0, bytesRead);
    const parts = buffer.split(delimiter);
    buffer = parts.pop() ?? "";

    for (const line of parts) {
      local.push(line);

      if (local.length === pageSize) {
        parentPort?.postMessage({ type: "page", data: local.splice(0) });
      }
    }
  }

  if (buffer !== "") {
    local.push(buffer);
  }

  if (local.length) {
    parentPort?.postMessage({ type: "page", data: local });
  }

  parentPort?.postMessage({ type: "done" });

  await fd.close();
})();
