import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// Screenshot audit: npm run audit:mobile → .audit/mobile/<viewport>/*.png + report.json (gitignored).
export default defineConfig({
  ...base,
  testDir: "tests/audit",
  outputDir: ".audit/test-results",
  reporter: "list",
  retries: 0,
  timeout: 600_000,
  projects: [
    { name: "360x740", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 } } },
    { name: "390x844", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
