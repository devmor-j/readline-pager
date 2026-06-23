import assert from "node:assert";
import { chmod } from "node:fs/promises";
import { suite, test } from "node:test";
import { createNativePager, createPager } from "../dist/main.mjs";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("errors", () => {
  test("it throws if filepath is empty", () => {
    assert.throws(() => {
      createPager("");
    });
    assert.throws(() => {
      createNativePager("");
    });
  });

  test("createPager throws on invalid numeric args", () => {
    assert.throws(
      () => createPager("x", { pageSize: 0 }),
      /pageSize must be >= 1/,
    );
    assert.throws(
      () => createPager("x", { prefetch: 0 }),
      /prefetch must be >= 1/,
    );
  });

  test("throws if file cannot be read due to permissions", async () => {
    const filepath = await createTmpFile("secret");

    try {
      await chmod(filepath, 0o000);

      await assert.rejects(async () => {
        createPager(filepath);
      });
    } finally {
      await chmod(filepath, 0o644).catch(() => {});
      await tryDeleteFile(filepath);
    }
  });

  test("native isMusl catch on getReport throw", async () => {
    if (process.platform !== "linux") return;

    process.report.getReport = () => {
      throw new Error("boom");
    };

    const filepath = await createTmpFile("a");
    try {
      createNativePager(filepath);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("close while async next is pending wakes consumerWaiter", async () => {
    const filepath = await createTmpFile(createTextLines(10));
    try {
      const pager = createPager(filepath, { pageSize: 100 });
      const nextPromise = pager.next();
      await pager.close();
      const result = await nextPromise;
      assert.equal(result, null);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
