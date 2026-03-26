import assert from "node:assert";
import { after, suite, test } from "node:test";
import { createPager } from "../dist/main.mjs";
import {
  createTextLines,
  createTmpFile,
  runTestCleanup,
  tryDeleteFile,
} from "./_utils.ts";

after(runTestCleanup);

suite("apis", () => {
  suite("next", () => {
    test("next() waits when pageSize large and prefetch small (waiter branch)", async () => {
      const content = createTextLines(5);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          pageSize: 1_000_000,
          prefetch: 1,
          chunkSize: 16,
        });

        const p = await pager.next();
        assert.ok(Array.isArray(p));
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("next() returns null repeatedly after reading is done", async () => {
      const content = createTextLines(3);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          pageSize: 2,
          prefetch: 1,
          chunkSize: 16,
        });

        while (true) {
          const p = await pager.next();
          if (!p) break;
        }

        let nullCount = 0;
        let loopCount = 0;

        while (true) {
          const page = await pager.next();
          if (page === null) nullCount++;
          if (++loopCount > 99) break;
        }

        assert.equal(nullCount, 100);
        assert.equal(loopCount, 100);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  suite("nextSync", () => {
    test("nextSync() reads pages correctly (forward)", async () => {
      const content = createTextLines(9);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          pageSize: 3,
          prefetch: 2,
          tryNative: false,
        });

        const lines: string[] = [];

        while (true) {
          const page = pager.nextSync();
          if (!page) break;
          lines.push(...page);
        }

        assert.equal(lines.length, 9);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  suite("close", () => {
    test("it stops reading immediately", async () => {
      const content = createTextLines(5_000);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          pageSize: 1_000,
        });

        const first = await pager.next();
        assert.ok(first);

        await pager.close();

        const next = await pager.next();
        assert.equal(next, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  suite("async iterator", () => {
    test("async iterator .return() triggers cleanup (async finally)", async () => {
      const content = createTextLines(20);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          pageSize: 2,
          prefetch: 2,
          tryNative: false,
        });
        const iter = pager[Symbol.asyncIterator]();

        const first = await iter.next();
        assert.ok(first.value && first.value.length > 0);

        if (typeof iter.return === "function") {
          await iter.return();
        }

        const after = await pager.next();
        assert.equal(after, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  suite("sync iterator", () => {
    test("sync iterator .return() triggers cleanup (sync finally)", async () => {
      const content = createTextLines(20);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          pageSize: 2,
          prefetch: 1,
          tryNative: false,
        });
        const iter = pager[Symbol.iterator]();

        const first = iter.next();
        assert.ok(first.value && first.value.length > 0);

        if (typeof iter.return === "function") {
          iter.return();
        }

        const after = pager.nextSync();
        assert.equal(after, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });
});
