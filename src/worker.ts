import { open } from "node:fs/promises";
import { parentPort, workerData } from "node:worker_threads";

const { filepath, chunkSize, pageSize, delimiter } = workerData;

(async () => {
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

    buffer += buf.toString("utf8", 0, bytesRead);

    let idx: number;
    while ((idx = buffer.indexOf(delimiter)) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + delimiter.length);
      local.push(line);

      while (local.length >= pageSize) {
        parentPort?.postMessage({
          type: "page",
          data: local.splice(0, pageSize),
        });
      }
    }
  }

  local.push(buffer);

  while (local.length > 0) {
    const page = local.splice(0, pageSize);
    parentPort?.postMessage({ type: "page", data: page });
  }

  parentPort?.postMessage({ type: "done" });
  await fd.close();
})();
