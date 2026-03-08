import { defineConfig } from "tsdown";

export default defineConfig({
  target: "node18",
  outDir: "dist",
  entry: ["src/main.ts", "src/worker.ts"],
  format: ["esm", "cjs"],
  clean: true,
  dts: true,
  external: [/\.node$/],
});
