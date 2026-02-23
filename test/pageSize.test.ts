import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("pageSize", () => {
  test("it splits pages correctly", async () => {
    const content = createTextLines(2_500);
    const filepath = await createTmpFile(content, { filename: "pagesize.txt" });

    const reader = createPageReader(filepath, {
      pageSize: 1_000,
    });

    try {
      const first = await reader.next();
      const second = await reader.next();
      const third = await reader.next();
      const fourth = await reader.next();

      assert.equal(first?.length, 1_000);
      assert.equal(second?.length, 1_000);
      assert.equal(third?.length, 500);
      assert.equal(fourth, null);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
