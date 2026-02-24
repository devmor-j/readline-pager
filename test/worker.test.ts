import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.mjs";
import { createTextLines, createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("worker mode", () => {
  test("spawns a new worker", async () => {
    const content = createTextLines(100);
    const filepath = await createTmpFile(content, {
      filename: "metadata_worker.txt",
    });

    const pager = createPager(filepath, {
      pageSize: 40,
      useWorker: true,
    });

    try {
      for await (const _ of pager) {
        const hasWorker = process
          .getActiveResourcesInfo()
          .some((r) => r === "MessagePort");

        assert.deepEqual(hasWorker, true);
      }
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("it reads correctly", async () => {
    const content = createTextLines(2_000);
    const filepath = await createTmpFile(content, { filename: "worker.txt" });

    const pager = createPager(filepath, {
      pageSize: 500,
      useWorker: true,
    });

    try {
      let total = 0;

      for await (const page of pager) {
        total += page.length;
      }

      assert.equal(total, 2_000);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("close() stops worker and prevents further pages", async () => {
    const content = createTextLines(10_000);
    const filepath = await createTmpFile(content, {
      filename: "worker-close-early.txt",
    });

    const pager = createPager(filepath, {
      pageSize: 1000,
      useWorker: true,
    });

    try {
      const first = await pager.next();
      assert.ok(first);
      assert.equal(first?.length, 1000);

      pager.close();

      const afterClose = await pager.next();
      assert.equal(afterClose, null);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("it throws when used with backward reading", () => {
    assert.throws(
      () =>
        createPager("x", {
          backward: true,
          useWorker: true,
        }),
      /backward not supported/,
    );
  });
});
