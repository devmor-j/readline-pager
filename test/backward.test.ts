import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.mjs";
import { createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("backward", () => {
  test("it reads backward from end to start", async () => {
    const lines = ["a", "b", "c", "d", "e"];
    const content = lines.join("\n");

    const filepath = await createTmpFile(content, { filename: "backward.txt" });

    const pager = createPager(filepath, {
      pageSize: 2,
      backward: true,
    });

    try {
      const result: string[] = [];

      for await (const page of pager) {
        result.push(...page);
      }

      assert.deepEqual(result, [...lines].reverse());
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("backward mode matches forward mode with trailing newline", async () => {
    const lines = ["a", "b", "c"];
    const content = lines.join("\n") + "\n";

    const filepath = await createTmpFile(content, {
      filename: "backward-trailing-newline.txt",
    });

    const forwardPager = createPager(filepath, {
      pageSize: 2,
    });

    const backwardPager = createPager(filepath, {
      pageSize: 2,
      backward: true,
    });

    try {
      const forwardResult: string[] = [];
      for await (const page of forwardPager) {
        forwardResult.push(...page);
      }

      const backwardResult: string[] = [];
      for await (const page of backwardPager) {
        backwardResult.push(...page);
      }

      assert.deepEqual(backwardResult, [...forwardResult].reverse());
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
