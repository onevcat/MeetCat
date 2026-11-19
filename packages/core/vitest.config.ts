import { defineConfig } from "vitest/config";

// Homepage fixtures carry labels captured on a JST machine; parsers compare
// them with UTC instance ids, so tests must run in the same timezone.
process.env.TZ = "Asia/Tokyo";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["**/__tests__/**/*.test.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/inject.ts",
        "src/**/index.ts",
        "src/types.ts",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
