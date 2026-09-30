import { db } from "@/server/db";
import { getStorage } from "@/server/adapters/storage";

export const DESIGN_RETENTION_DAYS = 30;
/** Uploaded studio images that no design has used for this long are deleted. */
export const UNUSED_ASSET_HOURS = 24;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const BATCH = 200;

async function deleteFile(key: string): Promise<boolean> {
  try {
    await getStorage().delete(key);
    return true;
  } catch (err) {
    console.error("[purge-designs] could not delete", key, err);
    return false;
  }
}

/**
 * 1. Designs older than 30 days that no cart line and no order line references: row, then preview/print files.
 *    Their DesignAsset rows lose designId (SetNull) and fall to step 2.
 * 2. Uploaded assets older than 24 h that no design uses: row, then file. An asset a design still uses
 *    (designId set, or listed in a design's assetKeys) is kept; the delete is conditional on designId
 *    being null, so a design saved meanwhile (which marks its assets) keeps them.
 */
export async function runPurgeDesigns(now: Date = new Date()): Promise<{ purged: number; filesDeleted: number }> {
  const cutoff = new Date(now.getTime() - DESIGN_RETENTION_DAYS * DAY_MS);
  const unreferenced = { cartItems: { none: {} }, orderItems: { none: {} } };
  const stale = await db.design.findMany({
    where: { createdAt: { lt: cutoff }, ...unreferenced },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true, frontPreviewKey: true, backPreviewKey: true, frontPrintKey: true, backPrintKey: true },
  });
  let purged = 0;
  let filesDeleted = 0;
  for (const d of stale) {
    // Conditional delete: a design added to a bag or ordered since the read survives.
    const r = await db.design.deleteMany({ where: { id: d.id, ...unreferenced } });
    if (r.count !== 1) continue;
    purged++;
    for (const key of [d.frontPreviewKey, d.backPreviewKey, d.frontPrintKey, d.backPrintKey]) {
      if (key !== null && (await deleteFile(key))) filesDeleted++;
    }
  }

  const assetCutoff = new Date(now.getTime() - UNUSED_ASSET_HOURS * HOUR_MS);
  const unused = await db.designAsset.findMany({
    where: { designId: null, createdAt: { lt: assetCutoff } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true, key: true },
  });
  for (const a of unused) {
    const user = await db.design.findFirst({ where: { assetKeys: { has: a.key } }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (user) {
      // Its newest design was purged but another one still uses it: point at that one instead.
      await db.designAsset.updateMany({ where: { id: a.id, designId: null }, data: { designId: user.id } });
      continue;
    }
    const r = await db.designAsset.deleteMany({ where: { id: a.id, designId: null } });
    if (r.count === 1 && (await deleteFile(a.key))) filesDeleted++;
  }
  return { purged, filesDeleted };
}
