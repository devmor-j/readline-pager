import assert from "node:assert";
import { suite, test } from "node:test";
import { createNativePager, createPager } from "../dist/main.mjs";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("content", () => {
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

  test("backward reader handles sole delimiter file", async () => {
    const filepath = await createTmpFile("\n");

    try {
      const pager = createPager(filepath, { backward: true });
      const page = await pager.next();
      assert.deepEqual(page, ["", ""]);
      const end = await pager.next();
      assert.equal(end, null);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
