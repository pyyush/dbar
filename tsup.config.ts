import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    splitting: false,
  },
  {
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    dts: true,
    clean: false,
    splitting: false,
  },
]);
