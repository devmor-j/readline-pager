import assert from "node:assert";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.js";

suite("filepath", () => {
  test("it throws if filepath is missing", () => {
    assert.throws(() => {
      createPager("");
    });
  });

  test("it throws if file does not exist on read", async () => {
    const pager = createPager("./tmp/does-not-exist.txt");

    await assert.rejects(() => pager.next());
  });
});
