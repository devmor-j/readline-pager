import { execSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import process from "node:process";

const [argPlatform, argArch, argLibc] = process.argv.slice(2);

const platform = process.env.TARGET_PLATFORM || argPlatform || process.platform;
const arch = process.env.TARGET_ARCH || argArch || process.arch;

let libc = process.env.TARGET_LIBC || argLibc || "";
if (!libc && platform === "linux") {
  try {
    const lddOutput = execSync("ldd --version 2>&1", { encoding: "utf8" });
    if (lddOutput.includes("musl")) libc = "musl";
  } catch {}
}

const libcSuffix = platform === "linux" && libc === "musl" ? "-musl" : "";

let version = process.env.npm_package_version;
if (!version) {
  try {
    const pkgRoot = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    );
    version = pkgRoot.version;
  } catch (err) {
    console.error("Unable to determine package version:", err);
    process.exit(1);
  }
}

const outDir = join(process.cwd(), "pkg");
const pkgName = `@devmor-j/readline-pager-${platform}${libcSuffix}-${arch}`;
const nativeFilename = "readline-pager.node";
const jsFilename = "index.js";

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join("build", "Release", nativeFilename), join(outDir, nativeFilename));

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
  ...(platform === "linux" && {
    libc: [libc || "glibc"],
  }),
  peerDependencies: {
    "readline-pager": version,
  },
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
