import assert from "node:assert";
import { test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, deleteFile } from "./utils.ts";

test("close stops reading immediately", async () => {
  const content = createTextLines(5_000);
  const filePath = await createTmpFile("close.txt", content);

  const reader = createPageReader({ filepath: filePath, pageSize: 1_000 });

  try {
    const first = await reader.next();
    assert.ok(first);

    reader.close();

    const next = await reader.next();
    assert.equal(next, null);
  } finally {
    await deleteFile(filePath);
  }
});
