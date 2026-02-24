import * as fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";

const CHUNK_SIZE = 64 * 1024;

const { filepath, pageSize, delimiter = "\n" } = workerData;

(async () => {
  const fd = await fs.promises.open(filepath, "r");
  const stat = await fd.stat();

  let pos = 0;
  let buffer = "";
  let firstLine: string | null = null;
  let lastLine: string | null = null;

  const local: string[] = [];

  while (pos < stat.size) {
    const readSize = Math.min(CHUNK_SIZE, stat.size - pos);
    const buf = Buffer.allocUnsafe(readSize);
    const { bytesRead } = await fd.read(buf, 0, readSize, pos);
    pos += bytesRead;

    buffer += buf.toString("utf8", 0, bytesRead);
    const parts = buffer.split(delimiter);
    buffer = parts.pop() ?? "";

    for (const line of parts) {
      if (firstLine == null) firstLine = line;
      lastLine = line;
      local.push(line);

      if (local.length === pageSize) {
        parentPort?.postMessage({ type: "page", data: local.splice(0) });
      }
    }
  }

  if (buffer !== "") {
    if (firstLine == null) firstLine = buffer;
    lastLine = buffer;
    local.push(buffer);
  }

  if (local.length) {
    parentPort?.postMessage({ type: "page", data: local });
  }

  parentPort?.postMessage({ type: "meta", firstLine, lastLine });
  parentPort?.postMessage({ type: "done" });

  await fd.close();
})();
