import assert from "node:assert";
import { test } from "node:test";
import { createPageReader } from "../dist/main.js";
import { createTmpFile, deleteFile } from "./utils.ts";

/* -------------------------------------------------- */
/* delimiter */
/* -------------------------------------------------- */

test("custom delimiter works", async () => {
  const content = ["a", "b", "c", "d"].join("|");
  const filePath = await createTmpFile("delimiter.txt", content);

  const reader = createPageReader({
    filepath: filePath,
    pageSize: 2,
    delimiter: "|",
  });

  try {
    const first = await reader.next();
    const second = await reader.next();

    assert.deepEqual(first, ["a", "b"]);
    assert.deepEqual(second, ["c", "d"]);
  } finally {
    await deleteFile(filePath);
  }
});
