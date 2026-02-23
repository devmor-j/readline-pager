import assert from "node:assert";
import { test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTextLines, createTmpFile, deleteFile } from "./utils.ts";

test("worker mode reads correctly", async () => {
  const content = createTextLines(1_500);
  const filePath = await createTmpFile("worker.txt", content);

  const reader = createPageReader({
    filepath: filePath,
    pageSize: 500,
    useWorker: true,
  });
  const results: string[][] = [];

  try {
    for await (const page of reader) {
      results.push(page);
    }

    assert.equal(results.length, 3);
  } finally {
    await deleteFile(filePath);
  }
});
