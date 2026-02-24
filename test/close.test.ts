import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("close", () => {
  test("it stops reading immediately", async () => {
    const content = createTextLines(5_000);
    const filepath = await createTmpFile(content, { filename: "close.txt" });

    const pager = createPager(filepath, {
      pageSize: 1_000,
    });

    try {
      const first = await pager.next();
      assert.ok(first);

      pager.close();

      const next = await pager.next();
      assert.equal(next, null);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
