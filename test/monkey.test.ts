import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.mjs";
import { createTextLines, createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("monkey", () => {
  test("random prefetch and pageSize never lose lines (monkey/randomized)", async () => {
    const total = 1_000;
    const content = createTextLines(total);
    const filepath = await createTmpFile(content, {
      filename: "random-prefetch.txt",
    });

    try {
      const pager = createPager(filepath, {
        pageSize: 1 + Math.floor(Math.random() * 20),
        prefetch: 1 + Math.floor(Math.random() * 5),
      });

      let count = 0;

      for await (const p of pager) {
        count += p.length;
      }

      assert.equal(count, total);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
