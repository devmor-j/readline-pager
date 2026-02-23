import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("metadata", () => {
  test("firstLine and lastLine are correct", async () => {
    const delimiter = "\n";

    const content = createTextLines(10);
    const filepath = await createTmpFile(content, { filename: "metadata.txt" });

    const reader = createPageReader(filepath, {
      delimiter,
      pageSize: 3,
    });

    try {
      for await (const _ of reader) {
      }

      const lines = content.split(delimiter);

      assert.equal(reader.firstLine, lines[0]);
      assert.equal(reader.lastLine, lines.at(-1));
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("lineCount tracks emitted lines", async () => {
    const lines = Array.from({ length: 1234 }, (_, i) => `X${i}`);
    const content = lines.join("\n") + "\n";

    const filepath = await createTmpFile(content, { filename: "count.txt" });

    const reader = createPageReader(filepath, {
      pageSize: 200,
    });

    try {
      for await (const _ of reader) {
      }

      assert.equal(reader.lineCount, lines.length);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
