import assert from "node:assert";
import { test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, deleteFile } from "./utils.ts";

/* -------------------------------------------------- */
/* metadata */
/* -------------------------------------------------- */

test("firstLine and lastLine are correct", async () => {
  const content = createTextLines(10);
  const filePath = await createTmpFile("meta.txt", content);

  const reader = createPageReader({
    filepath: filePath,
    pageSize: 3,
  });

  try {
    for await (const _ of reader) {
    }

    assert.equal(reader.firstLine, "line-0");
    assert.equal(reader.lastLine, "line-9");
  } finally {
    await deleteFile(filePath);
  }
});

test("lineCount tracks emitted lines", async () => {
  const content = createTextLines(1234);
  const filePath = await createTmpFile("count.txt", content);

  const reader = createPageReader({
    filepath: filePath,
    pageSize: 200,
  });

  try {
    for await (const _ of reader) {
    }

    assert.equal(reader.lineCount, 1234);
  } finally {
    await deleteFile(filePath);
  }
});
