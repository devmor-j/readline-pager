import assert from "node:assert";
import { test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, deleteFile } from "./utils.ts";

/* -------------------------------------------------- */
/* pageSize behavior */
/* -------------------------------------------------- */

test("pageSize splits pages correctly", async () => {
  const content = createTextLines(2500);
  const filePath = await createTmpFile("pagesize.txt", content);

  const reader = createPageReader({
    filepath: filePath,
    pageSize: 1000,
  });

  try {
    const first = await reader.next();
    const second = await reader.next();
    const third = await reader.next();
    const fourth = await reader.next();

    assert.equal(first?.length, 1000);
    assert.equal(second?.length, 1000);
    assert.equal(third?.length, 500);
    assert.equal(fourth, null);
  } finally {
    await deleteFile(filePath);
  }
});
