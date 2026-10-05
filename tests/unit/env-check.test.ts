import { describe, expect, it } from "vitest";
import { assertProductionConfig, enforceProductionConfig, productionConfigProblems, shouldCheckProductionConfig } from "@/server/env-check";

const GOOD = {
  AUTH_SECRET: "a".repeat(44),
  PAYMENT_PROVIDER: "razorpay",
  RAZORPAY_KEY_ID: "rzp_live_x",
  RAZORPAY_KEY_SECRET: "secret",
  RAZORPAY_WEBHOOK_SECRET: "whsec",
  CRON_SECRET: "c".repeat(32),
  EMAIL_DRIVER: "smtp",
  SMTP_URL: "smtps://u:p@smtp.example.com:465",
  EMAIL_FROM: "shop@example.com",
  NEXT_PUBLIC_SITE_URL: "https://shop.example.com",
};

describe("productionConfigProblems (I2)", () => {
  it("accepts a complete production configuration (smtp or ses)", () => {
    expect(productionConfigProblems(GOOD)).toEqual([]);
    expect(productionConfigProblems({ ...GOOD, EMAIL_DRIVER: "ses", SMTP_URL: undefined, AWS_REGION: "ap-south-1" })).toEqual([]);
  });

  it("lists every problem of an unconfigured server without echoing values", () => {
    const problems = productionConfigProblems({});
    expect(problems).toHaveLength(5);
    expect(problems.join("\n")).toMatch(/AUTH_SECRET/);
    expect(problems.join("\n")).toMatch(/PAYMENT_PROVIDER must be "razorpay".*unset, which means mock/);
    expect(problems.join("\n")).toMatch(/EMAIL_DRIVER must be "smtp" or "ses".*unset/);
    expect(productionConfigProblems({ ...GOOD, RAZORPAY_KEY_SECRET: "topsecretvalue", CRON_SECRET: "short" }).join(" ")).not.toContain("topsecretvalue");
  });

  it("accepts payments and email switched off before keys exist (launch preview), but never mock or console", () => {
    const preview = {
      ...GOOD,
      PAYMENT_PROVIDER: "disabled",
      RAZORPAY_KEY_ID: undefined,
      RAZORPAY_KEY_SECRET: undefined,
      RAZORPAY_WEBHOOK_SECRET: undefined,
      EMAIL_DRIVER: "disabled",
      SMTP_URL: undefined,
    };
    expect(productionConfigProblems(preview)).toEqual([]);
    expect(productionConfigProblems({ ...preview, PAYMENT_PROVIDER: "mock" })).toHaveLength(1);
    expect(productionConfigProblems({ ...preview, EMAIL_DRIVER: "console" })).toHaveLength(1);
  });

  it.each([
    ["mock payments", { PAYMENT_PROVIDER: "mock" }, /PAYMENT_PROVIDER/],
    ["a missing webhook secret", { RAZORPAY_WEBHOOK_SECRET: " " }, /RAZORPAY_WEBHOOK_SECRET/],
    ["a short cron secret", { CRON_SECRET: "c".repeat(31) }, /CRON_SECRET must be at least 32/],
    ["console email", { EMAIL_DRIVER: "console" }, /EMAIL_DRIVER/],
    ["smtp without a URL", { SMTP_URL: "" }, /SMTP_URL/],
    ["ses without a region", { EMAIL_DRIVER: "ses" }, /AWS_REGION/],
    ["no sender", { EMAIL_FROM: undefined }, /EMAIL_FROM/],
    ["an http site URL", { NEXT_PUBLIC_SITE_URL: "http://shop.example.com" }, /NEXT_PUBLIC_SITE_URL/],
    ["a localhost site URL", { NEXT_PUBLIC_SITE_URL: "https://localhost:3000" }, /NEXT_PUBLIC_SITE_URL/],
    ["a malformed site URL", { NEXT_PUBLIC_SITE_URL: "shop.example.com" }, /NEXT_PUBLIC_SITE_URL/],
    ["no auth secret", { AUTH_SECRET: "" }, /AUTH_SECRET/],
  ])("refuses %s", (_label, over, pattern) => {
    const problems = productionConfigProblems({ ...GOOD, ...over });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(pattern);
  });

  it("throws with the full list, and passes a good config", () => {
    expect(() => assertProductionConfig(GOOD)).not.toThrow();
    const orig = console.error;
    console.error = () => {};
    try {
      expect(() => assertProductionConfig({ ...GOOD, PAYMENT_PROVIDER: undefined, CRON_SECRET: undefined })).toThrow(/Refusing to start[\s\S]*PAYMENT_PROVIDER[\s\S]*CRON_SECRET/);
    } finally {
      console.error = orig;
    }
  });

  it("checks only a production Node.js server, never during next build, dev or tests", () => {
    expect(shouldCheckProductionConfig({ NEXT_RUNTIME: "nodejs", NODE_ENV: "production" })).toBe(true);
    expect(shouldCheckProductionConfig({ NEXT_RUNTIME: "nodejs", NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toBe(false);
    expect(shouldCheckProductionConfig({ NEXT_RUNTIME: "nodejs", NODE_ENV: "development" })).toBe(false);
    expect(shouldCheckProductionConfig({ NEXT_RUNTIME: "nodejs", NODE_ENV: "test" })).toBe(false);
    expect(shouldCheckProductionConfig({ NEXT_RUNTIME: "edge", NODE_ENV: "production" })).toBe(false);
    expect(shouldCheckProductionConfig({ NODE_ENV: "production" })).toBe(true);
  });

  it("exits the process on a bad production config at server start, and does nothing otherwise", () => {
    const origExit = process.exit;
    const origError = console.error;
    const codes: (string | number | null | undefined)[] = [];
    process.exit = ((code?: string | number | null) => {
      codes.push(code);
    }) as typeof process.exit;
    console.error = () => {};
    try {
      enforceProductionConfig({ NEXT_RUNTIME: "nodejs", NODE_ENV: "production" });
      enforceProductionConfig({ NEXT_RUNTIME: "nodejs", NODE_ENV: "production", ...GOOD });
      enforceProductionConfig({ NEXT_RUNTIME: "nodejs", NODE_ENV: "production", NEXT_PHASE: "phase-production-build" });
      enforceProductionConfig({ NEXT_RUNTIME: "nodejs", NODE_ENV: "development" });
    } finally {
      process.exit = origExit;
      console.error = origError;
    }
    expect(codes).toEqual([1]);
  });
});
