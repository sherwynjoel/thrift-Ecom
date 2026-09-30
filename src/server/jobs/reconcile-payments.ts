import { db } from "@/server/db";
import { getPaymentProvider, type PaymentProvider } from "@/server/payments";
import { markOrderPaid } from "@/server/services/orders";

const HOUR = 3_600_000;
export const RECONCILE_WINDOW_MS = 48 * HOUR;

export interface ReconcileResult {
  checked: number;
  paid: number;
  attention: number;
  errors: number;
}

/**
 * Safety net for lost webhooks (controller ruling for Task 12): for recent unpaid orders that reached
 * the provider, asks the provider for the order's payments and feeds every captured one through
 * `markOrderPaid` — which is idempotent (conditional status updates, amount check, exactly-once
 * re-reserve for EXPIRED orders), so overlapping runs or a webhook arriving at the same time are safe.
 * A failure on one order is logged and counted; it never aborts the run.
 */
export async function runReconcilePayments(now: Date = new Date(), provider: PaymentProvider = getPaymentProvider()): Promise<ReconcileResult> {
  const orders = await db.order.findMany({
    where: {
      status: { in: ["PENDING_PAYMENT", "EXPIRED"] },
      providerOrderId: { not: null },
      createdAt: { gte: new Date(now.getTime() - RECONCILE_WINDOW_MS), lte: now },
    },
    select: { id: true, number: true, providerOrderId: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const result: ReconcileResult = { checked: 0, paid: 0, attention: 0, errors: 0 };
  for (const o of orders) {
    result.checked++;
    try {
      const payments = await provider.fetchOrderPayments(o.providerOrderId!);
      for (const p of payments) {
        if (p.status !== "captured") continue;
        // A missing amount is a mismatch (null), never "matches" — same rule as the webhook.
        const amount = Number.isInteger(p.amountPaise) ? p.amountPaise : null;
        const r = await markOrderPaid(o.id, p.id, "reconcile", { amountPaise: amount });
        if (r.outcome === "paid") result.paid++;
        else if (r.outcome === "attention" || r.outcome === "amount_mismatch") result.attention++;
      }
    } catch (err) {
      result.errors++;
      console.error("[reconcile-payments] failed", o.number, err);
    }
  }
  return result;
}
