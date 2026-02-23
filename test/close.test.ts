import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("close", () => {
  test("it stops reading immediately", async () => {
    const content = createTextLines(5000);
    const filePath = await createTmpFile(content, { filename: "close.txt" });

    const reader = createPageReader({
      filepath: filePath,
      pageSize: 1000,
    });

    try {
      const first = await reader.next();
      assert.ok(first);

      reader.close();

      const next = await reader.next();
      assert.equal(next, null);
    } finally {
      await tryDeleteFile(filePath);
    }
  });
});
