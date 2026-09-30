import { db } from "@/server/db";
import { lowStockDigestEmail } from "@/server/emails/templates";
import { sendToAdmin } from "@/server/services/notifications";
import { getSettings } from "@/server/services/settings";

export async function runLowStock(now: Date = new Date()): Promise<{ reset: number; alerted: number; skipped?: "no-recipient" | "failed" }> {
  const { lowStockThreshold: threshold } = await getSettings();
  const reset = await db.productVariant.updateMany({ where: { lowStockAlertedAt: { not: null }, stock: { gt: threshold } }, data: { lowStockAlertedAt: null } });
  const rows = await db.productVariant.findMany({
    where: { lowStockAlertedAt: null, stock: { lte: threshold }, product: { status: "ACTIVE" } },
    include: { product: { select: { name: true } } },
    orderBy: [{ stock: "asc" }, { sku: "asc" }],
    take: 200,
  });
  if (rows.length === 0) return { reset: reset.count, alerted: 0 };
  const result = await sendToAdmin(lowStockDigestEmail(rows.map((v) => ({ productName: v.product.name, size: v.size, colorName: v.colorName, sku: v.sku, stock: v.stock })), threshold));
  if (result !== "sent") return { reset: reset.count, alerted: 0, skipped: result };
  await db.productVariant.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { lowStockAlertedAt: now } });
  return { reset: reset.count, alerted: rows.length };
}
