import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";

suite("filepath", () => {
  test("it throws if filepath is missing", () => {
    assert.throws(() => {
      createPageReader({ filepath: "" });
    });
  });

  test("it throws if file does not exist on read", async () => {
    const reader = createPageReader({
      filepath: "./tmp/does-not-exist.txt",
    });

    await assert.rejects(() => reader.next());
  });
});
