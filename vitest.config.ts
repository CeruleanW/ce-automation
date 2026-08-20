import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only match *.test.ts — leave *.spec.ts for Playwright
    include: ["src/**/*.test.ts"],
  },
});
