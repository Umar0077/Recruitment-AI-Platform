import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { environment: "jsdom", include: ["tests/auth/**/*.test.{js,jsx}", "tests/speech/**/*.test.{js,jsx}", "tests/api-usage/**/*.test.{js,jsx}", "tests/recording/**/*.test.{js,jsx}", "tests/performance/**/*.test.{js,jsx}"], clearMocks: true, maxWorkers: 2 },
});
