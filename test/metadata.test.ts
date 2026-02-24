import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.mjs";
import { createTextLines, createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("metadata", () => {
  test("forward reading sets firstLine and lastLine correctly", async () => {
    const delimiter = "\n";
    const content = createTextLines(10);
    const filepath = await createTmpFile(content, {
      filename: "metadata_forward.txt",
    });

    const pager = createPager(filepath, {
      delimiter,
      pageSize: 3,
    });

    try {
      for await (const _ of pager) {
      }

      const lines = content.split(delimiter);

      assert.equal(pager.firstLine, lines[0]);
      assert.equal(pager.lastLine, lines.at(-1));
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("backward reading sets firstLine and lastLine correctly", async () => {
    const delimiter = "\n";
    const content = createTextLines(10);
    const filepath = await createTmpFile(content, {
      filename: "metadata_backward.txt",
    });

    const pager = createPager(filepath, {
      delimiter,
      pageSize: 4,
      backward: true,
    });

    try {
      while (true) {
        const page = await pager.next();
        if (!page) break;
      }

      const lines = content.split(delimiter).reverse();

      assert.equal(pager.firstLine, lines[0]);
      assert.equal(pager.lastLine, lines.at(-1));
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("lineCount tracks emitted lines", async () => {
    const delimiter = "\n";
    const linesCount = 500;
    const content = createTextLines(linesCount);

    const filepath = await createTmpFile(content, {
      filename: "linecount.txt",
    });

    const pageSize = linesCount * 0.9;
    const pager = createPager(filepath, {
      pageSize,
      delimiter,
    });

    try {
      assert.equal(pager.lineCount, 0);

      await pager.next();
      assert.equal(pager.lineCount, pageSize);

      await pager.next();
      assert.equal(pager.lineCount, linesCount);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
