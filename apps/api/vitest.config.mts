import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // SWC is required so Nest's decorator metadata (DI) survives the test transform.
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    globalSetup: ["./test/global-setup.ts"],
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
