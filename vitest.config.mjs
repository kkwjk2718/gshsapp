import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // Avoid spawning one worker per logical CPU on high-core CI/self-hosted runners.
    // Excess workers make isolated module imports contend and can trigger false timeouts.
    maxWorkers: 8,
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
