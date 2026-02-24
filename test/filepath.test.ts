import assert from "node:assert";
import { chmod } from "node:fs/promises";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.js";
import { createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("filepath", () => {
  test("it throws if filepath is missing", () => {
    assert.throws(() => {
      createPager("");
    });
  });

  test("it throws if file does not exist on read", async () => {
    const pager = createPager("./tmp/does-not-exist.txt");

    await assert.rejects(() => pager.next());
  });

  test("throws if file cannot be read due to permissions", async () => {
    const filepath = await createTmpFile("secret", {
      filename: "no-permission.txt",
    });

    try {
      await chmod(filepath, 0o000);

      const pager = createPager(filepath);

      await assert.rejects(async () => {
        await pager.next();
      });
    } finally {
      await chmod(filepath, 0o644).catch(() => {});
      await tryDeleteFile(filepath);
    }
  });
});
