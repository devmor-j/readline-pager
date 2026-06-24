import assert from "node:assert";
import { truncateSync } from "node:fs";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.mjs";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("iterate", () => {
  suite("backward", () => {
    test("backward reader empty file sync + async paths", async () => {
      const filepath1 = await createTmpFile("");

      try {
        const pager1 = createPager(filepath1, {
          backward: true,
        });

        const page = pager1.nextSync();
        assert.deepEqual(page, [""]);

        const end = pager1.nextSync();
        assert.equal(end, null);
      } finally {
        await tryDeleteFile(filepath1);
      }

      const filepath2 = await createTmpFile("");

      try {
        const pager2 = createPager(filepath2, { backward: true });

        const page2 = await pager2.next();
        assert.deepEqual(page2, [""]);

        const end2 = await pager2.next();
        assert.equal(end2, null);
      } finally {
        await tryDeleteFile(filepath2);
      }
    });

    test("backward sync iterator works", async () => {
      const content = createTextLines(200);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          backward: true,
          pageSize: 2,
        });

        const pages: string[] = [];

        for (const page of pager) {
          pages.push(...page);
        }

        const lines = content.split("\n");

        assert.equal(pages.length, lines.length);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  suite("truncation", () => {
    test("backward async reader handles truncated read (read-failure path)", async () => {
      const content = "a\nb\nc\nd\n";
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          backward: true,
          pageSize: 1,
          chunkSize: 1,
        });

        await new Promise((r) => setTimeout(r, 5));

        truncateSync(filepath, 0);

        const page = await pager.next();

        assert.ok(page === null || Array.isArray(page));

        await pager.close();
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("forward reader async empty path after truncation", async () => {
      const content = "some\ncontent";
      const filepath = await createTmpFile(content);
      try {
        const pager = createPager(filepath, { pageSize: 1 });
        truncateSync(filepath, 0);
        const page = await pager.next();
        assert.deepEqual(page, [""]);
        const end = await pager.next();
        assert.equal(end, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("backward reader async empty path after truncation", async () => {
      const content = "some\ncontent";
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, { backward: true, pageSize: 1 });
        truncateSync(filepath, 0);
        const page = await pager.next();
        assert.deepEqual(page, [""]);
        const end = await pager.next();
        assert.equal(end, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  suite("prefetch and load", () => {
    test("sync iterator (for...of) honors prefetch and page boundaries", async () => {
      const total = 12;
      const content = createTextLines(total);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          pageSize: 3,
          prefetch: 2,
        });

        const pages: string[][] = [];

        for (const p of pager) {
          pages.push(p);
        }

        const flattened = pages.flat();
        assert.equal(
          flattened.length,
          total,
          "total lines read must equal input lines",
        );

        assert.equal(
          pages.length,
          Math.ceil(total / 3),
          "page count must match ceil(total/pageSize)",
        );
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("small prefetch capacity does not overwrite or drop pages under load", async () => {
      const total = 50;
      const pageSize = 5;
      const content = createTextLines(total);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          pageSize,
          prefetch: 1,
          chunkSize: 1,
        });

        let pages = 0;
        let linesRead = 0;

        for await (const p of pager) {
          pages++;
          linesRead += p.length;
        }

        assert.equal(linesRead, total, "should read all lines");
        assert.equal(
          pages,
          Math.ceil(total / pageSize),
          "should produce expected number of pages",
        );
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("small pageSize does not drop pages under load", async () => {
      const total = 500;
      const content = createTextLines(total);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          pageSize: 1,
          backward: true,
          prefetch: 400,
        });

        let pages = 0;
        let linesRead = 0;

        for await (const p of pager) {
          pages++;
          linesRead += p.length;
        }

        assert.equal(linesRead, total, "should read all lines");
        assert.equal(
          pages,
          Math.ceil(total),
          "should produce expected number of pages",
        );
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });
});
