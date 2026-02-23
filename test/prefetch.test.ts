import assert from "node:assert";
import { test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, deleteFile } from "./utils.ts";

test("prefetch buffers multiple pages", async () => {
  const content = createTextLines(3_000);
  const filePath = await createTmpFile("prefetch.txt", content);

  const reader = createPageReader({
    filepath: filePath,
    pageSize: 1_000,
    prefetch: 2,
  });

  try {
    const page1 = await reader.next();
    const page2 = await reader.next();

    assert.equal(page1?.length, 1_000);
    assert.equal(page2?.length, 1_000);
  } finally {
    await deleteFile(filePath);
  }
});
