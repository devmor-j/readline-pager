import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("prefetch", () => {
  test("it does not affect correctness", async () => {
    const content = createTextLines(3_000);
    const filepath = await createTmpFile(content, { filename: "prefetch.txt" });

    const pager = createPager(filepath, {
      pageSize: 1_000,
      prefetch: 3,
    });

    try {
      let total = 0;

      for await (const page of pager) {
        total += page.length;
      }

      assert.equal(total, 3_000);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
