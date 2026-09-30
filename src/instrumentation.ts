/**
 * Runs once when the Next.js server starts. In production it refuses to start with an incomplete
 * configuration (see src/server/env-check.ts) instead of failing later at a customer's first payment.
 * Skipped in development/test, on the edge runtime, and during `next build` (build machines need no
 * runtime secrets).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { enforceProductionConfig } = await import("./server/env-check");
    enforceProductionConfig(process.env);
  }
}
