import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Each landing test builds the whole site: give them time and keep the Mac breathing.
    testTimeout: 60_000,
    maxWorkers: 2,
    exclude: [...configDefaults.exclude, "video/**"],
  },
});
