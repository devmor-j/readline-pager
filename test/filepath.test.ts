import assert from "node:assert";
import { test } from "node:test";
import { createPageReader } from "../dist/main.js";

/* -------------------------------------------------- */
/* filepath validation */
/* -------------------------------------------------- */

test("throws if filepath is missing", () => {
  assert.throws(() => {
    createPageReader({ filepath: "" });
  });
});

test("throws if file does not exist on read", async () => {
  const reader = createPageReader({
    filepath: "./tmp/does-not-exist.txt",
  });

  await assert.rejects(() => reader.next());
});
