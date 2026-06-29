import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/mcp-bin.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: false,
  splitting: false,
  minify: false,
});
