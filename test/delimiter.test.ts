import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTmpFile, tryDeleteFile } from "./utils.ts";

suite("delimiter", () => {
  test("it works with custom delimiter", async () => {
    const content = ["a", "b", "c", "d"].join("|");
    const filepath = await createTmpFile(content, {
      filename: "delimiter.txt",
    });

    const reader = createPageReader(filepath, {
      pageSize: 2,
      delimiter: "|",
    });

    try {
      const first = await reader.next();
      const second = await reader.next();

      assert.deepEqual(first, ["a", "b"]);
      assert.deepEqual(second, ["c", "d"]);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
