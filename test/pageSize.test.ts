import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("pageSize", () => {
  test("it splits pages correctly", async () => {
    const content = createTextLines(2_500);
    const filepath = await createTmpFile(content, { filename: "pagesize.txt" });

    const pager = createPager(filepath, {
      pageSize: 1_000,
    });

    try {
      const first = await pager.next();
      const second = await pager.next();
      const third = await pager.next();
      const fourth = await pager.next();

      assert.equal(first?.length, 1_000);
      assert.equal(second?.length, 1_000);
      assert.equal(third?.length, 500);
      assert.equal(fourth, null);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
