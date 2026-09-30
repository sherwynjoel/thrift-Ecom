import { db } from "@/server/db";
import { lowStockDigestEmail } from "@/server/emails/templates";
import { sendToAdmin } from "@/server/services/notifications";
import { getSettings } from "@/server/services/settings";

const MAX_PER_DIGEST = 200;

/**
 * Emails the admin one digest of live variants that fell to the low-stock threshold and haven't been
 * alerted yet. Claim-before-send (like abandoned-cart and daily-summary): one UPDATE … RETURNING
 * stamps `lowStockAlertedAt` on the eligible rows that are still unstamped and returns exactly the
 * ids this run claimed. An overlapping run blocks on those rows, re-checks `lowStockAlertedAt IS
 * NULL` after the first commits, and claims nothing (SKIP LOCKED in the picker lets it move on to
 * other rows instead of waiting). The digest covers only the claimed rows; if sending fails (or there
 * is no recipient) the claim is released so the next run tries again.
 */
export async function runLowStock(now: Date = new Date()): Promise<{ reset: number; alerted: number; skipped?: "no-recipient" | "failed" }> {
  const { lowStockThreshold: threshold } = await getSettings();
  const reset = await db.productVariant.updateMany({ where: { lowStockAlertedAt: { not: null }, stock: { gt: threshold } }, data: { lowStockAlertedAt: null } });

  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE "ProductVariant" v SET "lowStockAlertedAt" = ${now}
    WHERE v."lowStockAlertedAt" IS NULL AND v.stock <= ${threshold}
      AND v.id IN (
        SELECT v2.id FROM "ProductVariant" v2 JOIN "Product" p ON p.id = v2."productId"
        WHERE v2."lowStockAlertedAt" IS NULL AND v2.stock <= ${threshold} AND p.status = 'ACTIVE'
        ORDER BY v2.stock ASC, v2.sku ASC
        LIMIT ${MAX_PER_DIGEST}
        FOR UPDATE OF v2 SKIP LOCKED
      )
    RETURNING v.id`;
  if (claimed.length === 0) return { reset: reset.count, alerted: 0 };
  const ids = claimed.map((r) => r.id);

  const release = () => db.productVariant.updateMany({ where: { id: { in: ids }, lowStockAlertedAt: now }, data: { lowStockAlertedAt: null } });
  let result: Awaited<ReturnType<typeof sendToAdmin>>;
  try {
    const rows = await db.productVariant.findMany({
      where: { id: { in: ids } },
      include: { product: { select: { name: true } } },
      orderBy: [{ stock: "asc" }, { sku: "asc" }],
    });
    result = await sendToAdmin(lowStockDigestEmail(rows.map((v) => ({ productName: v.product.name, size: v.size, colorName: v.colorName, sku: v.sku, stock: v.stock })), threshold));
  } catch (err) {
    await release();
    throw err;
  }
  if (result !== "sent") {
    await release();
    return { reset: reset.count, alerted: 0, skipped: result };
  }
  return { reset: reset.count, alerted: ids.length };
}
