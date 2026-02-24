import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("prefetch", () => {
  test("prefetch > 1 does not affect correctness", async () => {
    const content = createTextLines(5_000);
    const filepath = await createTmpFile(content, {
      filename: "prefetch-buffering.txt",
    });

    const pager = createPager(filepath, {
      pageSize: 500,
      prefetch: 3,
    });

    try {
      let total = 0;
      let pages = 0;

      for await (const page of pager) {
        total += page.length;
        pages++;
      }

      assert.equal(total, 5_000);
      assert.equal(pages, 10);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
