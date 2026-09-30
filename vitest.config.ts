import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test", override: true });

export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig says "preserve" (Next compiles JSX); tests that render components need the automatic runtime.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
