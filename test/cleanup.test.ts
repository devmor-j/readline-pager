import assert from "node:assert";
import { suite, test } from "node:test";
import { createNativePager, createPager } from "../dist/main.mjs";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("cleanup", () => {
  suite("iterator break", () => {
    test("forward sync iterator break closes file", async () => {
      const content = createTextLines(500);
      const filepath = await createTmpFile(content);

      try {
        const pager = createNativePager(filepath);

        for (const page of pager) {
          assert.ok(Array.isArray(page));
          break;
        }

        const page = await pager.next();
        assert.deepEqual(page, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("backward sync iterator break closes file", async () => {
      const content = createTextLines(500);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          backward: true,
          pageSize: 10,
          prefetch: 2,
          chunkSize: 128,
        });

        for (const page of pager) {
          assert.ok(Array.isArray(page));
          break;
        }

        const page = await pager.next();
        assert.deepEqual(page, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  test("close() stops and prevents further pages", async () => {
    const content = createTextLines(10_000);
    const filepath = await createTmpFile(content);

    try {
      const pager = createPager(filepath, {
        pageSize: 1_000,
      });

      const first = await pager.next();
      assert.ok(first);
      assert.equal(first?.length, 1_000);

      await pager.close();

      const afterClose = await pager.next();
      assert.equal(afterClose, null);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  suite("mixed-mode break", () => {
    test("forward reader sync iterator break after async start", async () => {
      const content = createTextLines(100);
      const filepath = await createTmpFile(content);
      try {
        const pager = createPager(filepath, { pageSize: 10 });

        await pager.next();

        for (const _ of pager) {
          break;
        }
        const after = await pager.next();
        assert.equal(after, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("backward reader sync iterator break after async start", async () => {
      const content = createTextLines(100);
      const filepath = await createTmpFile(content);
      try {
        const pager = createPager(filepath, { backward: true, pageSize: 10 });
        await pager.next();
        for (const _ of pager) {
          break;
        }
        const after = await pager.next();
        assert.equal(after, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  suite("dispose protocol", () => {
    test("Symbol.dispose closes resources", async () => {
      const content = createTextLines(10);
      const filepath = await createTmpFile(content);
      try {
        let disposed;
        {
          using pager = createNativePager(filepath);
          assert.ok(pager.nextSync());
          disposed = pager;
        }
        assert.equal(disposed.nextSync(), null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("Symbol.asyncDispose closes resources", async () => {
      const content = createTextLines(10);
      const filepath = await createTmpFile(content);
      try {
        {
          await using pager = createPager(filepath);
          assert.ok(await pager.next());
        }
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("direct call to Symbol.asyncDispose covers return path", async () => {
      const filepath = await createTmpFile(createTextLines(10));
      try {
        const pager = createPager(filepath);
        assert.ok(await pager.next());
        await pager[Symbol.asyncDispose]();
        assert.equal(await pager.next(), null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });
});
