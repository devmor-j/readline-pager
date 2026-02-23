import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("metadata", () => {
  test("forward reader sets firstLine and lastLine correctly", async () => {
    const delimiter = "\n";
    const content = createTextLines(10);
    const filepath = await createTmpFile(content, {
      filename: "metadata_forward.txt",
    });

    const reader = createPageReader(filepath, {
      delimiter,
      pageSize: 3,
    });

    try {
      for await (const _ of reader) {
      }

      const lines = content.split(delimiter);

      assert.equal(reader.firstLine, lines[0]);
      assert.equal(reader.lastLine, lines.at(-1));
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("backward reader sets firstLine and lastLine correctly", async () => {
    const delimiter = "\n";
    const content = createTextLines(10);
    const filepath = await createTmpFile(content, {
      filename: "metadata_backward.txt",
    });

    const reader = createPageReader(filepath, {
      delimiter,
      pageSize: 4,
      backward: true,
    });

    try {
      while (true) {
        const page = await reader.next();
        if (!page) break;
      }

      const lines = content.split(delimiter).reverse();

      assert.equal(reader.firstLine, lines[0]);
      assert.equal(reader.lastLine, lines.at(-1));
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("worker reader sets firstLine and lastLine correctly", async () => {
    const content = createTextLines(100);
    const filepath = await createTmpFile(content, {
      filename: "metadata_worker.txt",
    });

    const reader = createPageReader(filepath, {
      pageSize: 40,
      useWorker: true,
    });

    try {
      for await (const _ of reader) {
        const hasWorker = process
          .getActiveResourcesInfo()
          .some((r) => r === "MessagePort");

        assert.deepEqual(hasWorker, true);
      }
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
    const reader = createPageReader(filepath, {
      pageSize,
      delimiter,
    });

    try {
      assert.equal(reader.lineCount, 0);

      await reader.next();
      assert.equal(reader.lineCount, pageSize);

      await reader.next();
      assert.equal(reader.lineCount, linesCount);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
