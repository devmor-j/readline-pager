import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTmpFile, tryDeleteFile } from "./utils.ts";

suite("edge cases", () => {
  test("empty file returns null immediately", async () => {
    const content = "";
    const filePath = await createTmpFile(content, {
      filename: "empty.txt",
    });

    const reader = createPageReader({ filepath: filePath });

    try {
      const page = await reader.next();
      assert.equal(page, null);
      assert.equal(reader.lineCount, 0);
      assert.equal(reader.firstLine, undefined);
      assert.equal(reader.lastLine, undefined);
    } finally {
      await tryDeleteFile(filePath);
    }
  });

  test("single line without trailing newline", async () => {
    const content = "only-line";
    const filePath = await createTmpFile(content, {
      filename: "single.txt",
    });

    const reader = createPageReader({ filepath: filePath });

    try {
      const pages: string[] = [];
      for await (const p of reader) pages.push(...p);

      assert.deepEqual(pages, ["only-line"]);
      assert.equal(reader.firstLine, "only-line");
      assert.equal(reader.lastLine, "only-line");
      assert.equal(reader.lineCount, 1);
    } finally {
      await tryDeleteFile(filePath);
    }
  });

  test("multiple lines without trailing delimiter", async () => {
    const content = "a\nb\nc";
    const filePath = await createTmpFile(content, {
      filename: "no-trailing.txt",
    });

    const reader = createPageReader({ filepath: filePath });

    try {
      const lines: string[] = [];
      for await (const p of reader) lines.push(...p);

      assert.deepEqual(lines, ["a", "b", "c"]);
      assert.equal(reader.lineCount, 3);
    } finally {
      await tryDeleteFile(filePath);
    }
  });

  test("empty lines do not signal end-of-file", async () => {
    // Contains an empty line in the middle
    const content = ["line-0", "", "line-2"].join("\n") + "\n";
    const filePath = await createTmpFile(content, {
      filename: "empty-line.txt",
    });

    const reader = createPageReader({
      filepath: filePath,
      pageSize: 1,
    });

    try {
      const collected: string[] = [];

      for await (const page of reader) {
        // This simulates the incorrect pattern:
        // if (!page) break;
        // We assert that page is always an array and never falsy.

        assert.ok(page !== null, "Reader returned null before EOF");
        assert.ok(Array.isArray(page));

        collected.push(...page);
      }

      assert.deepEqual(collected, ["line-0", "", "line-2"]);
    } finally {
      await tryDeleteFile(filePath);
    }
  });

  test("throws on invalid options", () => {
    assert.throws(
      () => createPageReader({ filepath: "", pageSize: 10 }),
      /filepath required/,
    );

    assert.throws(
      () => createPageReader({ filepath: "x", pageSize: 0 }),
      /pageSize/,
    );

    assert.throws(
      () => createPageReader({ filepath: "x", prefetch: 0 }),
      /prefetch/,
    );
  });
});
