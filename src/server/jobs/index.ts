import { runAbandonedCart } from "./abandoned-cart";
import { runDailySummary } from "./daily-summary";
import { runExpireOrders } from "./expire-orders";
import { runLowStock } from "./low-stock";
import { runReconcilePayments } from "./reconcile-payments";

export const JOBS = {
  "expire-orders": runExpireOrders,
  "low-stock": runLowStock,
  "daily-summary": runDailySummary,
  "abandoned-cart": runAbandonedCart,
  "reconcile-payments": (now: Date) => runReconcilePayments(now),
} as const;

export type JobName = keyof typeof JOBS;

export function isJobName(s: string): s is JobName {
  return Object.prototype.hasOwnProperty.call(JOBS, s);
}

export function runJob(name: JobName, now: Date = new Date()): Promise<unknown> {
  return JOBS[name](now);
}
