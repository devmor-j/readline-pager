import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("worker mode", () => {
  test("it reads correctly", async () => {
    const content = createTextLines(2_000);
    const filepath = await createTmpFile(content, { filename: "worker.txt" });

    const reader = createPageReader(filepath, {
      pageSize: 500,
      useWorker: true,
    });

    try {
      let total = 0;

      for await (const page of reader) {
        total += page.length;
      }

      assert.equal(total, 2_000);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("it throws when used with backward reading", () => {
    assert.throws(
      () =>
        createPageReader("x", {
          backward: true,
          useWorker: true,
        }),
      /backward not supported/,
    );
  });
});
