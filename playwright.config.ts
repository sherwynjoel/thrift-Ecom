import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // A single `next dev` webServer instance backs every project. Running more than one worker
  // sends concurrent cold-compile requests to that one server, which under contention blows
  // past the 45s test timeout (observed empirically). Serialize everything against it instead.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3001", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "npx next dev -p 3001",
    url: "http://localhost:3001",
    reuseExistingServer: false,
    timeout: 180_000,
    // PAYMENT_PROVIDER is forced to mock so e2e never reaches Razorpay even if the dev .env is switched to it.
    env: { NEXT_PUBLIC_SITE_URL: "http://localhost:3001", NEXT_DIST_DIR: ".next-e2e", PAYMENT_PROVIDER: "mock" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /(checkout|studio)-mobile|mobile-layout/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /home|product-cart|admin-mobile/ },
    { name: "reduced-motion", use: { ...devices["Desktop Chrome"], reducedMotion: "reduce" }, testMatch: /home/ },
    // Chromium with touch at 390x844, the phone size the checkout spec targets.
    { name: "mobile-checkout", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, testMatch: /checkout-mobile/ },
    // Every route at the smallest common Android width: no sideways scroll, tap targets >= 44 px.
    { name: "mobile-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 } }, testMatch: /mobile-layout/ },
    { name: "mobile-studio", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, testMatch: /studio-mobile/ },
  ],
});
