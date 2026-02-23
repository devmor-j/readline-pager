import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTmpFile, tryDeleteFile } from "./utils.ts";

suite("pageSize", () => {
  test("it splits pages correctly", async () => {
    const lines = Array.from({ length: 2500 }, (_, i) => `P${i}`);
    const content = lines.join("\n") + "\n";

    const filePath = await createTmpFile(content, { filename: "pagesize.txt" });

    const reader = createPageReader({
      filepath: filePath,
      pageSize: 1000,
    });

    try {
      const first = await reader.next();
      const second = await reader.next();
      const third = await reader.next();
      const fourth = await reader.next();

      assert.equal(first?.length, 1000);
      assert.equal(second?.length, 1000);
      assert.equal(third?.length, 500);
      assert.equal(fourth, null);
    } finally {
      await tryDeleteFile(filePath);
    }
  });
});
