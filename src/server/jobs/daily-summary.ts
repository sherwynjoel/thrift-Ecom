import { db } from "@/server/db";
import { dailySummaryEmail } from "@/server/emails/templates";
import { sendToAdmin } from "@/server/services/notifications";
import { getSettings } from "@/server/services/settings";
import { formatDateIst, istDateKey, startOfIstDay } from "@/lib/dates";
import { PAID_STATUSES } from "@/lib/order-status";

export async function runDailySummary(now: Date = new Date()): Promise<{ sent: boolean; reason?: "disabled" | "no-recipient" | "already-sent" | "failed" }> {
  const s = await getSettings();
  if (!s.dailySummaryEnabled) return { sent: false, reason: "disabled" };
  if (!s.adminNotifyEmail) return { sent: false, reason: "no-recipient" };
  const key = istDateKey(now);
  const claim = await db.storeSetting.updateMany({
    where: { id: 1, OR: [{ lastDailySummaryOn: null }, { lastDailySummaryOn: { not: key } }] },
    data: { lastDailySummaryOn: key },
  });
  if (claim.count !== 1) return { sent: false, reason: "already-sent" };

  const start = startOfIstDay(now);
  const paid = { in: [...PAID_STATUSES] };
  const [agg, toShip, needsAttention, lowStock] = await Promise.all([
    db.order.aggregate({ where: { status: paid, paidAt: { gte: start, lte: now } }, _count: { _all: true }, _sum: { totalPaise: true } }),
    db.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
    db.order.count({ where: { needsAttention: true } }),
    db.productVariant.count({ where: { stock: { lte: s.lowStockThreshold }, product: { status: "ACTIVE" } } }),
  ]);
  const result = await sendToAdmin(dailySummaryEmail({
    dateLabel: formatDateIst(now), paidOrders: agg._count._all, revenuePaise: agg._sum.totalPaise ?? 0, toShip, needsAttention, lowStock,
  }));
  if (result !== "sent") {
    await db.storeSetting.update({ where: { id: 1 }, data: { lastDailySummaryOn: s.lastDailySummaryOn } });
    return { sent: false, reason: result === "no-recipient" ? "no-recipient" : "failed" };
  }
  return { sent: true };
}
