import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTmpFile, tryDeleteFile } from "./utils.ts";

suite("backward", () => {
  test("it reads backward from end to start", async () => {
    const lines = ["a", "b", "c", "d", "e"];
    const content = lines.join("\n");

    const filepath = await createTmpFile(content, { filename: "backward.txt" });

    const reader = createPageReader(filepath, {
      pageSize: 2,
      backward: true,
    });

    try {
      const result: string[] = [];

      for await (const page of reader) {
        result.push(...page);
      }

      assert.deepEqual(result, [...lines].reverse());
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
