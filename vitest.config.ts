import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    coverage: {
      include: ["src/lib/**"],
      thresholds: { lines: 80 },
    },
  },
});
