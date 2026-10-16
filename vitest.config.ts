import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't load the React Router plugin.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
