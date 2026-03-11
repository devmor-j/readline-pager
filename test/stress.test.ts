import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.mjs";
import { createTextLines, createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("stress", () => {
  test("small prefetch capacity does not overwrite or drop pages under load", async () => {
    const total = 50;
    const pageSize = 5;
    const content = createTextLines(total);
    const filepath = await createTmpFile(content);

    try {
      const pager = createPager(filepath, {
        pageSize,
        prefetch: 1,
        chunkSize: 256,
      });

      let pages = 0;
      let linesRead = 0;

      for await (const p of pager) {
        pages++;
        linesRead += p.length;
      }

      assert.equal(linesRead, total, "should read all lines");
      assert.equal(
        pages,
        Math.ceil(total / pageSize),
        "should produce expected number of pages",
      );
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
