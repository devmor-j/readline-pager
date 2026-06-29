import { defineConfig } from "tsdown";

export default defineConfig({
  target: "node18",
  outDir: "dist",
  entry: ["src/main.ts", "src/native.ts"],
  format: ["esm", "cjs"],
  clean: true,
  dts: true,
  sourcemap: true,
  deps: {
    neverBundle: [/\.node$/],
  },
});
