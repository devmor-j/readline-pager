import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.js";
import { createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("edge cases", () => {
  test("empty file yields single empty line", async () => {
    const content = "";
    const filepath = await createTmpFile(content, {
      filename: "empty.txt",
    });

    const pager = createPager(filepath);

    try {
      const firstPage = await pager.next();
      assert.deepEqual(firstPage, [""]);

      const lastPage = await pager.next();
      assert.equal(lastPage, null);
      assert.equal(pager.lineCount, 1);
      assert.equal(pager.firstLine, "");
      assert.equal(pager.lastLine, "");
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("single line with trailing newline", async () => {
    const content = "only-line\n";
    const filepath = await createTmpFile(content, {
      filename: "single.txt",
    });

    const pager = createPager(filepath);

    try {
      const pages: string[] = [];
      for await (const p of pager) pages.push(...p);

      assert.deepEqual(pages, ["only-line", ""]);
      assert.equal(pager.firstLine, "only-line");
      assert.equal(pager.lastLine, "");
      assert.equal(pager.lineCount, 2);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("multiple lines without trailing delimiter", async () => {
    const content = "a\nb\nc";
    const filepath = await createTmpFile(content, {
      filename: "no-trailing.txt",
    });

    const pager = createPager(filepath);

    try {
      const lines: string[] = [];
      for await (const p of pager) {
        lines.push(...p);
      }

      assert.deepEqual(lines, ["a", "b", "c"]);
      assert.equal(pager.lineCount, 3);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("emits extra empty line when file ends with newline", async () => {
    const lines = ["a", "b", "c", ""];
    const content = lines.join("\n");

    const filepath = await createTmpFile(content, {
      filename: "forward-trailing-newline.txt",
    });

    const pager = createPager(filepath, { pageSize: 10 });

    try {
      const result: string[] = [];

      for await (const page of pager) {
        result.push(...page);
      }

      assert.deepEqual(result, lines);
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

  test("empty lines do not signal end-of-file", async () => {
    const lines = ["line-0", "", "line-2"];
    const content = lines.join("\n");
    const filepath = await createTmpFile(content, {
      filename: "empty-line.txt",
    });

    const pager = createPager(filepath, {
      pageSize: 1,
    });

    try {
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

  test("throws on invalid options", () => {
    assert.throws(() => createPager("", { pageSize: 10 }), /filepath/);
    assert.throws(() => createPager("x", { pageSize: 0 }), /pageSize/);
    assert.throws(() => createPager("x", { prefetch: 0 }), /prefetch/);
  });
});
