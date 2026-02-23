import assert from "node:assert";
import { test } from "node:test";
import { createPageReader } from "../dist/main.js";

test("invalid file returns null", async () => {
  const reader = createPageReader({ filepath: "./does-not-exist.txt" });
  const page = await reader.next();
  assert.equal(page, null, "Expected null when file does not exist");
});
