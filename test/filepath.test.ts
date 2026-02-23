import assert from "node:assert";
import { suite, test } from "node:test";
import { createPageReader } from "../dist/main.js";

suite("filepath", () => {
  test("it throws if filepath is missing", () => {
    assert.throws(() => {
      createPageReader("");
    });
  });

  test("it throws if file does not exist on read", async () => {
    const reader = createPageReader("./tmp/does-not-exist.txt");

    await assert.rejects(() => reader.next());
  });
});
