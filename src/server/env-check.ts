/**
 * Production configuration check, run once at server start (src/instrumentation.ts). Every item here
 * would otherwise fail only at first use, in front of a customer or silently in a cron log: payments
 * that can't start, a webhook Razorpay eventually disables, emails printed to the log instead of sent,
 * links in emails pointing at localhost, cron jobs that never run (I2).
 *
 * Pure: takes the environment, returns the list of problems (empty = fine). Never echoes values.
 */
export type Env = Record<string, string | undefined>;

export const MIN_CRON_SECRET_LENGTH = 32;

const set = (v: string | undefined) => Boolean(v && v.trim());

export function productionConfigProblems(env: Env): string[] {
  const problems: string[] = [];

  if (!set(env.AUTH_SECRET)) problems.push("AUTH_SECRET is not set.");

  // "disabled" lets the store run before Razorpay keys exist (checkout shows "payment opens soon"); mock is never allowed.
  const provider = (env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  if (provider === "razorpay") {
    for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const) {
      if (!set(env[k])) problems.push(`${k} is not set.`);
    }
  } else if (provider !== "disabled") {
    problems.push(`PAYMENT_PROVIDER must be "razorpay" (or "disabled" before keys exist) in production (it is ${provider ? `"${provider}"` : "unset, which means mock"}).`);
  }

  if ((env.CRON_SECRET ?? "").trim().length < MIN_CRON_SECRET_LENGTH) {
    problems.push(`CRON_SECRET must be at least ${MIN_CRON_SECRET_LENGTH} characters (openssl rand -hex 32).`);
  }

  const driver = (env.EMAIL_DRIVER ?? "").trim();
  if (driver === "smtp") {
    if (!set(env.SMTP_URL)) problems.push("SMTP_URL is not set (EMAIL_DRIVER=smtp).");
    if (!set(env.EMAIL_FROM)) problems.push("EMAIL_FROM is not set.");
  } else if (driver === "ses") {
    if (!set(env.AWS_REGION)) problems.push("AWS_REGION is not set (EMAIL_DRIVER=ses).");
    if (!set(env.EMAIL_FROM)) problems.push("EMAIL_FROM is not set.");
  } else if (driver !== "disabled") {
    problems.push(`EMAIL_DRIVER must be "smtp" or "ses" (or "disabled" before a sender exists) in production (it is ${driver ? `"${driver}"` : "unset, which prints emails to the log"}).`);
  }

  const site = (env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  let url: URL | null = null;
  try {
    url = site ? new URL(site) : null;
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname)) {
    problems.push("NEXT_PUBLIC_SITE_URL must be the public https:// address of the store (not localhost).");
  }

  return problems;
}

/** Only a production Node.js server is checked: not dev/test, not the edge runtime, not `next build`. */
export function shouldCheckProductionConfig(env: Env): boolean {
  return env.NEXT_RUNTIME !== "edge" && env.NODE_ENV === "production" && env.NEXT_PHASE !== "phase-production-build";
}

/** Throws (so the server refuses to start) when the production configuration is incomplete. */
export function assertProductionConfig(env: Env): void {
  const problems = productionConfigProblems(env);
  if (problems.length === 0) return;
  const text = `Refusing to start: the production configuration is incomplete.\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee "Environment variables" in README.md.`;
  console.error(`[config] ${text}`);
  throw new Error(text);
}

/**
 * Server start (Node.js runtime only): stop the process on an incomplete production configuration.
 * Throwing from `register()` alone leaves `next start` running and answering every request with a
 * 500, which a process manager would not notice; exiting makes the failed deploy obvious.
 */
export function enforceProductionConfig(env: Env): void {
  if (!shouldCheckProductionConfig(env)) return;
  try {
    assertProductionConfig(env);
  } catch {
    process.exit(1);
  }
}
