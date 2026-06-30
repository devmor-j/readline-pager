#!/usr/bin/env node
// Generate compile_flags.txt for clangd (IDE support only).
// Run after `node-gyp rebuild` (auto-wired via package.json).
// Not checked into git — paths are machine-specific.

import { existsSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { arch, version as nodeVersion, stderr } from "node:process";

// --- Node-gyp cache directory ---
const nodeGypDir: string =
  platform() === "darwin"
    ? join(homedir(), "Library", "Caches", "node-gyp")
    : join(homedir(), ".cache", "node-gyp");
const nodeDir: string = join(nodeGypDir, nodeVersion.replace(/^v/, ""));

if (!existsSync(nodeDir)) {
  stderr.write(`error: node-gyp headers not found at ${nodeDir}\n`);
  stderr.write(
    "Run `node-gyp rebuild` first or check your node-gyp installation.\n",
  );
  process.exit(1);
}

// --- Standard include subdirectories from node-headers tarball ---
const includeSubdirs: string[] = [
  "include/node",
  "src",
  "deps/openssl/config",
  "deps/openssl/openssl/include",
  "deps/uv/include",
  "deps/zlib",
  "deps/v8/include",
];

// --- Architecture-specific flags (mirrors binding.gyp conditions) ---
const archFlags: string[] =
  arch === "arm64"
    ? ["-march=armv8-a+simd"]
    : ["-mavx2", "-mbmi", "-mbmi2", "-mlzcnt"];

// --- All flags for clangd (optimization flags omitted — they're for the linker) ---
const flags: string[] = [
  "-std=c++23",
  "-fno-exceptions",
  "-fno-rtti",
  "-fPIC",
  "-pthread",
  "-Wall",
  "-Wextra",
  "-Wno-unused-parameter",
  ...archFlags,
  "-fno-strict-aliasing",
  "-DNODE_GYP_MODULE_NAME=readline-pager",
  "-DUSING_UV_SHARED=1",
  "-DUSING_V8_SHARED=1",
  "-DV8_DEPRECATION_WARNINGS=1",
  "-D_GLIBCXX_USE_CXX11_ABI=1",
  "-D_FILE_OFFSET_BITS=64",
  "-D_LARGEFILE_SOURCE",
  "-D__STDC_FORMAT_MACROS",
  "-DOPENSSL_NO_PINSHARED",
  "-DOPENSSL_THREADS",
  "-DBUILDING_NODE_EXTENSION",
  ...includeSubdirs.map((d) => `-I${join(nodeDir, d)}`),
  "",
];

writeFileSync(join(process.cwd(), "compile_flags.txt"), flags.join("\n"));
