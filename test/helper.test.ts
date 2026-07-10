import assert from "node:assert";
import { suite, test } from "node:test";
import { createRingBuffer } from "../src/helper.ts";

suite("helper", () => {
  test("capacity getter returns expected capacity", () => {
    const buf = createRingBuffer<string>(42);
    assert.equal(buf.capacity, 42);
  });

  test("capacity getter returns doubled capacity after push growth", () => {
    const buf = createRingBuffer<string>(4);

    // Push 4 items (full capacity)
    for (let i = 0; i < 4; i++) {
      buf.push(`item-${i}`);
    }
    assert.equal(buf.capacity, 4);

    // Push 5th item triggers growth to 8
    buf.push("item-4");
    assert.equal(buf.capacity, 8);
  });

  test("count returns current number of items", () => {
    const buf = createRingBuffer<string>(4);
    assert.equal(buf.count, 0);

    buf.push("a");
    assert.equal(buf.count, 1);

    buf.push("b");
    assert.equal(buf.count, 2);

    buf.shiftSync();
    assert.equal(buf.count, 1);

    buf.shiftSync();
    assert.equal(buf.count, 0);
  });

  test("shiftSync returns null when empty", () => {
    const buf = createRingBuffer<string>(4);
    assert.equal(buf.shiftSync(), null);
  });

  test("push after shiftSync reuses freed slots", () => {
    const buf = createRingBuffer<string>(4);

    // Push 4 items to fill
    for (let i = 0; i < 4; i++) {
      buf.push(`item-${i}`);
    }
    assert.equal(buf.capacity, 4);

    // Shift 2 items
    assert.equal(buf.shiftSync(), "item-0");
    assert.equal(buf.shiftSync(), "item-1");

    // Push 2 more items — should reuse the freed slots, not grow
    buf.push("item-2");
    buf.push("item-3");
    assert.equal(buf.capacity, 4);
  });
});
