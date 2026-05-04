import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: process.env.DBAR_COVERAGE_DIR ?? "/tmp/dbar-coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
      thresholds: {
        statements: 65,
        branches: 55,
        functions: 75,
        lines: 65,
      },
    },
  },
});
