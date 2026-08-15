import assert from "node:assert";
import { chmod } from "node:fs/promises";
import { suite, test } from "node:test";
import { createNativePager, createPager } from "../dist/main.mjs";
import { createTextLines, createTmpFile, tryDeleteFile } from "./utils.ts";

suite("errors", () => {
  test("it throws if filepath is empty", () => {
    assert.throws(() => {
      createPager("");
    });
    assert.throws(() => {
      createNativePager("");
    });
  });

  test("createPager throws on invalid numeric args", () => {
    assert.throws(
      () => createPager("x", { pageSize: 0 }),
      /pageSize must be >= 1/,
    );
    assert.throws(
      () => createPager("x", { prefetch: 0 }),
      /prefetch must be >= 1/,
    );
  });

  test("throws if file cannot be read due to permissions", async () => {
    const filepath = await createTmpFile("secret");

    try {
      await chmod(filepath, 0o000);

      await assert.rejects(async () => {
        createPager(filepath);
      });
    } finally {
      await chmod(filepath, 0o644).catch(() => {});
      await tryDeleteFile(filepath);
    }
  });

  test("native isMusl catch on getReport throw", async () => {
    if (process.platform !== "linux") return;

    process.report.getReport = () => {
      throw new Error("boom");
    };

    const filepath = await createTmpFile("a");
    try {
      createNativePager(filepath);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("close while async next is pending wakes consumerWaiter", async () => {
    const filepath = await createTmpFile(createTextLines(10));
    try {
      const pager = createPager(filepath, { pageSize: 100 });
      const nextPromise = pager.next();
      await pager.close();
      const result = await nextPromise;
      assert.equal(result, null);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("createNativePager throws on unsupported platform", () => {
    const originalPlatform = process.platform;
    const originalArch = process.arch;

    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: "x64",
      configurable: true,
    });

    try {
      assert.throws(() => {
        createNativePager("dummy");
      }, /Unsupported platform/);
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
      Object.defineProperty(process, "arch", {
        value: originalArch,
        configurable: true,
      });
    }
  });

  test("createNativePager throws when native addon not available", () => {
    const originalPlatform = process.platform;
    const originalArch = process.arch;

    if (originalPlatform !== "linux") return;

    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: "ppc64",
      configurable: true,
    });

    try {
      assert.throws(() => {
        createNativePager("dummy");
      }, /Native addon not available/);
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
      Object.defineProperty(process, "arch", {
        value: originalArch,
        configurable: true,
      });
    }
  });

  test("createNativePager throws on multi-character delimiter", () => {
    assert.throws(
      () => createNativePager("dummy", { delimiter: "\n\n" }),
      /native reader only supports single-character delimiters/,
    );
  });
});
