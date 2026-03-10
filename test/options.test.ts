import assert from "node:assert";
import { truncateSync } from "node:fs";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.mjs";
import { createTextLines, createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("options", () => {
  suite("with defaults", () => {
    test("forward sync iterator break closes file", async () => {
      const content = createTextLines(500);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath);

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

  suite("backward", () => {
    test("it reads backward from end to start", async () => {
      const lines = ["a", "b", "c", "d", "e"];
      const content = lines.join("\n");

      const filepath = await createTmpFile(content, {
        filename: "backward.txt",
      });

      try {
        const pager = createPager(filepath, {
          pageSize: 2,
          backward: true,
        });

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

      try {
        const forwardPager = createPager(filepath, {
          pageSize: 2,
        });

        const backwardPager = createPager(filepath, {
          pageSize: 2,
          backward: true,
        });

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

    test("backward reader empty file sync + async paths", async () => {
      const filepath1 = await createTmpFile("");

      try {
        const pager1 = createPager(filepath1, { backward: true });

        const page = pager1.nextSync();
        assert.deepEqual(page, [""]);

        const end = pager1.nextSync();
        assert.equal(end, null);
      } finally {
        tryDeleteFile(filepath1);
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

    test("nextSync works in backward mode", async () => {
      const content = ["a", "b", "c", "d"].join("\n");
      const filepath = await createTmpFile(content, {
        filename: "sync-backward.txt",
      });

      try {
        const pager = createPager(filepath, {
          backward: true,
          pageSize: 2,
        });

        const lines: string[] = [];

        while (true) {
          const page = pager.nextSync();
          if (!page) break;
          lines.push(...page);
        }

        assert.deepEqual(lines, ["d", "c", "b", "a"]);
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("backward sync iterator works", async () => {
      const content = createTextLines(200);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, { backward: true, pageSize: 2 });

        const out: string[] = [];

        for (const page of pager) {
          out.push(...page);
        }

        const lines = content.split("\n");

        assert.equal(out.length, lines.length);
      } finally {
        tryDeleteFile(filepath);
      }
    });

    test("backward reader async read failure triggers catch", async () => {
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
        tryDeleteFile(filepath);
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

  suite("chunkSize", () => {
    test("backward async reader handles truncated read (read-failure path)", async () => {
      const content = "a\nb\nc\nd\n";
      const filepath = await createTmpFile(content, {
        filename: "pager-error.txt",
      });
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
      await tryDeleteFile(filepath);
    });

    test("reads fine with very large chunk size", async () => {
      const content = createTextLines(1_000);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          chunkSize: 100_000 * 1_024,
        });

        while (true) {
          const page = pager.nextSync();
          if (!page) break;
        }
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  suite("delimiter", () => {
    test("it works with custom delimiter", async () => {
      const content = ["a", "b", "c", "d"].join("|");
      const filepath = await createTmpFile(content, {
        filename: "delimiter.txt",
      });

      try {
        const pager = createPager(filepath, {
          pageSize: 2,
          delimiter: "|",
        });

        const first = await pager.next();
        const second = await pager.next();

        assert.deepEqual(first, ["a", "b"]);
        assert.deepEqual(second, ["c", "d"]);
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("supports multi-character delimiters like CRLF", async () => {
      const lines = ["one", "two", "three"];
      const content = lines.join("\r\n");

      const filepath = await createTmpFile(content, {
        filename: "multibyte-delimiter.txt",
      });

      try {
        const pager = createPager(filepath, {
          pageSize: 2,
          delimiter: "\r\n",
        });

        const result: string[] = [];

        for await (const page of pager) {
          result.push(...page);
        }

        assert.deepEqual(result, lines);
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("backward reader async catch branch (delimiter.toString throws)", async () => {
      const content = createTextLines(10);
      const filepath = await createTmpFile(content, {
        filename: "backward-catch.txt",
      });

      // create a delimiter whose toString will throw when coercion happens
      const badDelimiter = {
        toString() {
          throw new Error("boom-delim");
        },
      };

      try {
        const pager = createPager(filepath, {
          backward: true,
          pageSize: 2,
          chunkSize: 4,
          // @ts-expect-error deliberate non-string delimiter to trigger error
          delimiter: badDelimiter,
        });

        const page = await pager.next();
        assert.ok(page === null || Array.isArray(page));
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  suite("pageSize", () => {
    test("it splits pages correctly", async () => {
      const content = createTextLines(2_500);
      const filepath = await createTmpFile(content, {
        filename: "pagesize.txt",
      });

      try {
        const pager = createPager(filepath, {
          pageSize: 1_000,
        });

        const first = await pager.next();
        const second = await pager.next();
        const third = await pager.next();
        const fourth = await pager.next();

        assert.equal(first?.length, 1_000);
        assert.equal(second?.length, 1_000);
        assert.equal(third?.length, 500);
        assert.equal(fourth, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });

  suite("prefetch", () => {
    test("sync iterator (for...of) honors prefetch and page boundaries", async () => {
      const total = 12;
      const content = createTextLines(total);
      const filepath = await createTmpFile(content, {
        filename: "prefetch-sync-iter.txt",
      });

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
  });

  suite("useWorker", () => {
    test("spawns a new worker", async () => {
      const content = createTextLines(100);
      const filepath = await createTmpFile(content, {
        filename: "metadata_worker.txt",
      });

      try {
        const pager = createPager(filepath, {
          pageSize: 40,
          useWorker: true,
        });

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

    test("it reads entire file correctly (worker)", async () => {
      const content = createTextLines(2_000);
      const filepath = await createTmpFile(content, { filename: "worker.txt" });

      try {
        const pager = createPager(filepath, {
          pageSize: 500,
          useWorker: true,
        });

        let total = 0;
        let firstLine = "";
        let lastLine = "";

        for await (const page of pager) {
          firstLine ||= page[0];
          lastLine = page[page.length - 1];
          total += page.length;
        }

        const lines = content.split("\n");

        assert.equal(total, 2_000);
        assert.deepEqual(firstLine, lines[0]);
        assert.deepEqual(lastLine, lines.at(-1));
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("close() stops worker and prevents further pages", async () => {
      const content = createTextLines(10_000);
      const filepath = await createTmpFile(content, {
        filename: "worker-close-early.txt",
      });

      try {
        const pager = createPager(filepath, {
          pageSize: 1_000,
          useWorker: true,
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

    test("worker nextSync returns pages if available", async () => {
      const content = createTextLines(20);
      const filepath = await createTmpFile(content, {
        filename: "worker-sync.txt",
      });

      try {
        const pager = createPager(filepath, {
          useWorker: true,
          pageSize: 5,
        });

        // allow worker to prefill queue
        await new Promise((r) => setTimeout(r, 10));

        const page = pager.nextSync();

        assert.ok(page === null || Array.isArray(page));
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("worker handles termination gracefully", async () => {
      const content = createTextLines(100);
      const filepath = await createTmpFile(content, {
        filename: "worker-exit.txt",
      });

      try {
        const pager = createPager(filepath, {
          useWorker: true,
          pageSize: 10,
        });

        await pager.close();

        const page = await pager.next();
        assert.equal(page, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("worker finishes immediately (tiny file) and iterator still closes cleanly", async () => {
      const filepath = await createTmpFile("x", {
        filename: "worker-tiny-2.txt",
      });

      try {
        const pager = createPager(filepath, {
          useWorker: true,
          pageSize: 10,
          prefetch: 1,
        });

        const out: string[] = [];
        for await (const page of pager) {
          out.push(...page);
        }

        assert.equal(out.length, 1);

        const after = await pager.next();
        assert.equal(after, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("worker sync iterator yields multiple prefetched pages", async () => {
      const content = ["a", "b", "c", "d", "e", "f"].join("\n");
      const filepath = await createTmpFile(content, {
        filename: "worker-sync-prefetch2.txt",
      });

      try {
        const pager = createPager(filepath, {
          useWorker: true,
          pageSize: 2,
          prefetch: 3,
        });

        await new Promise((r) => setTimeout(r, 20));

        const pages: string[][] = [];

        for await (const p of pager) {
          pages.push(p);
          if (pages.length === 2) break;
        }

        assert.equal(pages.length, 2);
      } finally {
        await tryDeleteFile(filepath);
      }
    });

    test("worker sync iterator break closes file", async () => {
      const content = createTextLines(200);
      const filepath = await createTmpFile(content);

      try {
        const pager = createPager(filepath, {
          useWorker: true,
          pageSize: 10,
          prefetch: 2,
        });

        for (const page of pager) {
          assert.deepEqual(page, null);
          break;
        }

        const page = await pager.next();
        assert.deepEqual(page, null);
      } finally {
        await tryDeleteFile(filepath);
      }
    });
  });
});

suite("validation", () => {
  test("createPager throws when backward and useWorker both true", () => {
    assert.throws(
      () => createPager("x", { backward: true, useWorker: true }),
      /backward not supported with useWorker/,
    );
  });

  test("createPager throws on invalid numeric args", () => {
    assert.throws(
      () => createPager("x", { pageSize: 0 }),
      /pageSize must be > 0/,
    );
    assert.throws(
      () => createPager("x", { prefetch: 0 }),
      /prefetch must be >= 1/,
    );
  });

  test("throws on invalid options (basic checks)", () => {
    assert.throws(() => createPager("", { pageSize: 10 }), /filepath/);
    assert.throws(() => createPager("x", { pageSize: 0 }), /pageSize/);
    assert.throws(() => createPager("x", { prefetch: 0 }), /prefetch/);
  });
});
