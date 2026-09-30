import { db } from "@/server/db";
import { getStorage } from "@/server/adapters/storage";

export const DESIGN_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
const BATCH = 200;

export async function runPurgeDesigns(now: Date = new Date()): Promise<{ purged: number; filesDeleted: number }> {
  const cutoff = new Date(now.getTime() - DESIGN_RETENTION_DAYS * DAY_MS);
  const unreferenced = { cartItems: { none: {} }, orderItems: { none: {} } };
  const stale = await db.design.findMany({ where: { createdAt: { lt: cutoff }, ...unreferenced }, orderBy: { createdAt: "asc" }, take: BATCH });
  const storage = getStorage();
  let purged = 0;
  let filesDeleted = 0;
  for (const d of stale) {
    // Conditional delete: a design added to a bag or ordered since the read survives.
    const r = await db.design.deleteMany({ where: { id: d.id, ...unreferenced } });
    if (r.count !== 1) continue;
    purged++;
    const own = [d.frontPreviewKey, d.backPreviewKey, d.frontPrintKey, d.backPrintKey].filter((k): k is string => k !== null);
    const orphanAssets: string[] = [];
    for (const key of d.assetKeys) {
      if ((await db.design.count({ where: { assetKeys: { has: key } } })) === 0) orphanAssets.push(key);
    }
    for (const key of [...own, ...orphanAssets]) {
      try {
        await storage.delete(key);
        filesDeleted++;
      } catch (err) {
        console.error("[purge-designs] could not delete", key, err);
      }
    }
  }
  return { purged, filesDeleted };
}
