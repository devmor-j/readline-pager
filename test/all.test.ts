import assert from "node:assert";
import { truncateSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { after, suite, test } from "node:test";
import { createNativePager, createPager } from "../dist/main.mjs";
import {
  createTextLines,
  createTmpFile,
  runTestCleanup,
  tryDeleteFile,
} from "./utils.ts";

after(runTestCleanup);

suite("validation", () => {
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
});

suite("files", () => {
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

  test("empty file yields single empty line", async () => {
    const content = "";
    const filepath = await createTmpFile(content);

    try {
      const pager = createPager(filepath);

      const firstPage = await pager.next();
      assert.deepEqual(firstPage, [""]);

      const lastPage = await pager.next();
      assert.equal(lastPage, null);
      assert.equal(firstPage?.length, 1);
      assert.equal(firstPage?.at(0), "");
      assert.equal(firstPage?.at(-1), "");
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("multiple lines without trailing delimiter", async () => {
    const content = "a\nb\nc";
    const filepath = await createTmpFile(content);

    try {
      const pager = createNativePager(filepath);

      const lines: string[] = [];

      while (true) {
        const page = pager.nextSync();
        if (!page) break;
        lines.push(...page);
      }

      assert.deepEqual(lines, ["a", "b", "c"]);
      assert.equal(lines.length, 3);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("empty lines do not signal end-of-file", async () => {
    const lines = ["line-0", "", "line-2"];
    const content = lines.join("\n");
    const filepath = await createTmpFile(content);

    try {
      const pager = createNativePager(filepath, {
        pageSize: 1,
      });

      const collected: string[] = [];

      for await (const page of pager) {
        assert.ok(page !== null, "pager returned null before EOF");
        assert.ok(Array.isArray(page));

        collected.push(...page);
      }

      assert.deepEqual(collected, lines);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});

suite("api", () => {
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

  test("multiple leading delimiters produce multiple empty lines", async () => {
    const content = "\n\nalpha";
    const filepath = await createTmpFile(content);

    try {
      const pager = createNativePager(filepath, {
        backward: true,
        pageSize: 2,
      });

      const pages: string[] = [];

      for (const p of pager) {
        pages.push(...p);
      }

      assert.deepEqual(pages, content.split("\n").reverse());
    } finally {
      await tryDeleteFile(filepath);
    }
  });

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

  test("buffer output emits raw chunks and maintains data integrity", async () => {
    const content = createTextLines(3);
    const originalBuffer = Buffer.from(content, "utf8");
    const filepath = await createTmpFile(content);

    try {
      const forwardPager = createPager(filepath, {
        output: "buffer",
        pageSize: 1,
      });

      const forwardChunks: Buffer[] = [];
      for await (const chunk of forwardPager) {
        assert.ok(Buffer.isBuffer(chunk));
        forwardChunks.push(chunk);
      }

      const reconstructedForward = Buffer.concat(forwardChunks);
      assert.deepEqual(reconstructedForward, originalBuffer);

      const backwardPager = createNativePager(filepath, {
        output: "buffer",
        backward: true,
        pageSize: 1,
      });

      const backwardChunks: Buffer[] = [];
      for (const chunk of backwardPager) {
        assert.ok(Buffer.isBuffer(chunk));
        backwardChunks.push(chunk);
      }

      const reconstructedBackward = Buffer.concat(backwardChunks.toReversed());
      assert.deepEqual(reconstructedBackward, originalBuffer);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});

suite("stress", () => {
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
