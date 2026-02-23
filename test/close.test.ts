import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("close", () => {
  test("it stops reading immediately", async () => {
    const content = createTextLines(5_000);
    const filepath = await createTmpFile(content, { filename: "close.txt" });

    const reader = createPageReader(filepath, {
      pageSize: 1_000,
    });

    try {
      const first = await reader.next();
      assert.ok(first);

      reader.close();

      const next = await reader.next();
      assert.equal(next, null);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
