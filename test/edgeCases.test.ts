import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.js";
import { createTmpFile, tryDeleteFile } from "./utils.ts";

suite("edge cases", () => {
  test("empty file returns null immediately", async () => {
    const content = "";
    const filepath = await createTmpFile(content, {
      filename: "empty.txt",
    });

    const pager = createPager(filepath);

    try {
      const page = await pager.next();
      assert.equal(page, null);
      assert.equal(pager.lineCount, 0);
      assert.equal(pager.firstLine, undefined);
      assert.equal(pager.lastLine, undefined);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("single line without trailing newline", async () => {
    const content = "only-line";
    const filepath = await createTmpFile(content, {
      filename: "single.txt",
    });

    const pager = createPager(filepath);

    try {
      const pages: string[] = [];
      for await (const p of pager) pages.push(...p);

      assert.deepEqual(pages, ["only-line"]);
      assert.equal(pager.firstLine, "only-line");
      assert.equal(pager.lastLine, "only-line");
      assert.equal(pager.lineCount, 1);
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
      for await (const p of pager) lines.push(...p);

      assert.deepEqual(lines, ["a", "b", "c"]);
      assert.equal(pager.lineCount, 3);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("empty lines do not signal end-of-file", async () => {
    const content = ["line-0", "", "line-2"].join("\n") + "\n";
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

      assert.deepEqual(collected, ["line-0", "", "line-2"]);
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
