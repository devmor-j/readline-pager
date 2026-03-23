import assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { suite, test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const pkgRoot = process.cwd();

async function runCjsTest(script: string) {
  const dir = join(tmpdir(), `pager-cjs-${crypto.randomUUID()}`);
  await mkdir(dir, { recursive: true });

  const pkg = {
    type: "commonjs",
  };

  const pkgPath = join(dir, "package.json");
  const scriptPath = join(dir, "test.cjs");

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
  await writeFile(scriptPath, script);

  try {
    const { stdout } = await exec("node", [scriptPath], {
      cwd: dir,
    });

    return stdout.trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

suite("commonjs", () => {
  test("it throws if filepath is missing", async () => {
    const out = await runCjsTest(`
        const assert = require("node:assert");
        const { createPager } = require("${pkgRoot}");

        assert.throws(() => {
          createPager("");
        });

        console.log("ok");
      `);

    assert.equal(out, "ok");
  });

  test("it throws if file does not exist on read", async () => {
    const out = await runCjsTest(`
        const assert = require("node:assert");
        const { createPager } = require("${pkgRoot}");

        (async () => {
          await assert.rejects(async () => {
            createPager("./tmp/does-not-exist.txt");
          });

          console.log("ok");
        })();
      `);

    assert.equal(out, "ok");
  });

  test("monkey works on commonjs", async () => {
    const out = await runCjsTest(`
    const assert = require("node:assert");
    const fs = require("node:fs");
    const path = require("node:path");
    const os = require("node:os");
    const { createPager } = require("${pkgRoot}");

    (async () => {
      const tmpFile = path.join(os.tmpdir(), "pager-monkey.txt");
      const lines = Array.from({ length: 100 }, () =>
        Math.random().toString(36).slice(2)
      );
      fs.writeFileSync(tmpFile, lines.join("\\n"));

      const pager = createPager(tmpFile, { pageSize: 7, delimiter: "\\n" });
      const collected = [];

      const iter = pager[Symbol.asyncIterator]();
      let page = await iter.next();
      while (!page.done) {
        assert.ok(Array.isArray(page.value));
        collected.push(...page.value);
        if (collected.length > 50) break;
        page = await iter.next();
      }

      while (true) {
        const page = pager.nextSync();
        if (!page) break;
        collected.push(...page);
      }

      if (iter.return) await iter.return();

      assert.deepEqual(collected, lines, "all lines must be read");
      console.log("ok");
    })();
    `);

    assert.equal(out, "ok");
  });
});
