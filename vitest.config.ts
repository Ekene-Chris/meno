import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 15000,
    // Integration files share global AI quota tables and committed concurrency fixtures.
    // Run files sequentially so another suite cannot consume a quota under test.
    fileParallelism: false,
  },
});
