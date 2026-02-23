import assert from "node:assert";
import { test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, deleteFile } from "./utils.ts";

test("reads pages correctly", async () => {
  const content = createTextLines(2_500);
  const filePath = await createTmpFile("basic.txt", content);

  const reader = createPageReader({ filepath: filePath, pageSize: 1_000 });
  const pages: string[][] = [];

  try {
    for await (const page of reader) {
      pages.push(page);
    }

    assert.equal(pages.length, 3);
    assert.equal(pages[0].length, 1_000);
    assert.equal(pages[2].length, 500);
  } finally {
    await deleteFile(filePath);
  }
});
