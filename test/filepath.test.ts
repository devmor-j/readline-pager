import assert from "node:assert";
import { chmod } from "node:fs/promises";
import { suite, test } from "node:test";
import { createPager } from "../dist/main.mjs";
import { createTmpFile, tryDeleteFile } from "./_utils.ts";

suite("filepath", () => {
  test("it throws if filepath is missing", () => {
    assert.throws(() => {
      createPager("");
    });
  });

  test("it throws if file does not exist on read", async () => {
    await assert.rejects(async () => {
      createPager("./tmp/does-not-exist.txt");
    });
  });

  test("throws if file cannot be read due to permissions", async () => {
    const filepath = await createTmpFile("secret", {
      filename: "no-permission.txt",
    });

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
});

suite("exceptional files", () => {
  test("empty file yields single empty line", async () => {
    const content = "";
    const filepath = await createTmpFile(content, {
      filename: "empty.txt",
    });

    try {
      const pager = createPager(filepath);

      const firstPage = await pager.next();
      assert.deepEqual(firstPage, [""]);

      const lastPage = await pager.next();
      assert.equal(lastPage, null);
      assert.equal(firstPage?.length, 1);
      assert.equal(firstPage?.at(0), "");
      assert.equal(firstPage?.at(-1), "");
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("single line with trailing newline", async () => {
    const content = "only-line\n";
    const filepath = await createTmpFile(content, {
      filename: "single.txt",
    });

    try {
      const pager = createPager(filepath);

      const pages: string[] = [];

      for await (const p of pager) {
        pages.push(...p);
      }

      assert.deepEqual(pages, ["only-line", ""]);
      assert.equal(pages?.length, 2);
      assert.equal(pages?.at(0), "only-line");
      assert.equal(pages?.at(-1), "");
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("multiple lines without trailing delimiter", async () => {
    const content = "a\nb\nc";
    const filepath = await createTmpFile(content, {
      filename: "no-trailing.txt",
    });

    try {
      const pager = createPager(filepath);

      const lines: string[] = [];
      for await (const p of pager) {
        lines.push(...p);
      }

      assert.deepEqual(lines, ["a", "b", "c"]);
      assert.equal(lines.length, 3);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("emits extra empty line when file ends with newline", async () => {
    const lines = ["a", "b", "c", ""];
    const content = lines.join("\n");

    const filepath = await createTmpFile(content, {
      filename: "forward-trailing-newline.txt",
    });

    try {
      const pager = createPager(filepath, { pageSize: 10 });

      const result: string[] = [];

      for (const page of pager) {
        result.push(...page);
      }

      assert.deepEqual(result, lines);
    } finally {
      await tryDeleteFile(filepath);
    }
  });

  test("empty lines do not signal end-of-file", async () => {
    const lines = ["line-0", "", "line-2"];
    const content = lines.join("\n");
    const filepath = await createTmpFile(content, {
      filename: "empty-line.txt",
    });

    try {
      const pager = createPager(filepath, {
        pageSize: 1,
      });

      const collected: string[] = [];

      for await (const page of pager) {
        assert.ok(page !== null, "pager returned null before EOF");
        assert.ok(Array.isArray(page));

        collected.push(...page);
      }

      assert.deepEqual(collected, lines);
    } finally {
      await tryDeleteFile(filepath);
    }
  });
});
