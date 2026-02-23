import assert from "node:assert";
import { test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, deleteFile } from "./utils.ts";

/* -------------------------------------------------- */
/* backward */
/* -------------------------------------------------- */

test("backward reads from end to start", async () => {
  const content = createTextLines(5);
  const filePath = await createTmpFile("backward.txt", content);

  const reader = createPageReader({
    filepath: filePath,
    pageSize: 2,
    backward: true,
  });

  try {
    const pages: string[][] = [];

    for await (const page of reader) {
      pages.push(page);
    }

    const flat = pages.flat();

    assert.deepEqual(flat, ["line-4", "line-3", "line-2", "line-1", "line-0"]);
  } finally {
    await deleteFile(filePath);
  }
});
