import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTmpFile, tryDeleteFile } from "./utils.ts";

suite("metadata", () => {
  test("firstLine and lastLine are correct", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `L${i}`);
    const content = lines.join("\n") + "\n";

    const filePath = await createTmpFile(content, { filename: "meta.txt" });

    const reader = createPageReader({
      filepath: filePath,
      pageSize: 3,
    });

    try {
      for await (const _ of reader) {
      }

      assert.equal(reader.firstLine, lines[0]);
      assert.equal(reader.lastLine, lines[lines.length - 1]);
    } finally {
      await tryDeleteFile(filePath);
    }
  });

  test("lineCount tracks emitted lines", async () => {
    const lines = Array.from({ length: 1234 }, (_, i) => `X${i}`);
    const content = lines.join("\n") + "\n";

    const filePath = await createTmpFile(content, { filename: "count.txt" });

    const reader = createPageReader({
      filepath: filePath,
      pageSize: 200,
    });

    try {
      for await (const _ of reader) {
      }

      assert.equal(reader.lineCount, lines.length);
    } finally {
      await tryDeleteFile(filePath);
    }
  });
});
