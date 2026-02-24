import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.js";
import { createTmpFile, tryDeleteFile } from "./utils.ts";

suite("delimiter", () => {
  test("it works with custom delimiter", async () => {
    const content = ["a", "b", "c", "d"].join("|");
    const filepath = await createTmpFile(content, {
      filename: "delimiter.txt",
    });

    const pager = createPager(filepath, {
      pageSize: 2,
      delimiter: "|",
    });

    try {
      const first = await pager.next();
      const second = await pager.next();

      assert.deepEqual(first, ["a", "b"]);
      assert.deepEqual(second, ["c", "d"]);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("supports multi-character delimiters like CRLF", async () => {
    const lines = ["one", "two", "three"];
    const content = lines.join("\r\n");

    const filepath = await createTmpFile(content, {
      filename: "multibyte-delimiter.txt",
    });

    const pager = createPager(filepath, {
      pageSize: 2,
      delimiter: "\r\n",
    });

    try {
      const result: string[] = [];

      for await (const page of pager) {
        result.push(...page);
      }

      assert.deepEqual(result, lines);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
