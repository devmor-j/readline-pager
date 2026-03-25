import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const [platform, arch, libc] = process.argv.slice(2);

if (!platform || !arch) {
  console.error(
    "Usage: node scripts/package-native.js <platform> <arch> [libc]",
  );
  process.exit(1);
}

const outDir = join(process.cwd(), "pkg");
const libcSuffix = platform === "linux" && libc === "musl" ? "-musl" : "";
const pkgName = `@devmor-j/readline-pager-${platform}${libcSuffix}-${arch}`;
const nativeFilename = "readline-pager.node";
const jsFilename = "index.js";
const version = process.env.npm_package_version;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(`build/Release/${nativeFilename}`, join(outDir, nativeFilename));

writeFileSync(
  join(outDir, jsFilename),
  `module.exports = require("./${nativeFilename}");\n`,
);

const pkg = {
  name: pkgName,
  version: version,
  main: jsFilename,
  os: [platform],
  cpu: [arch],
  files: [jsFilename, nativeFilename],
  repository: {
    type: "git",
    url: "git+https://github.com/devmor-j/readline-pager.git",
  },
  homepage: "https://github.com/devmor-j/readline-pager#readme",
  bugs: {
    url: "https://github.com/devmor-j/readline-pager/issues",
  },
  author: "Morteza Jamshidi",
  license: "MIT",
};

writeFileSync(join(outDir, "package.json"), JSON.stringify(pkg, null, 2));

console.log(`✔ Generated ${pkgName} | ${version}`);
