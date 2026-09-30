import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

const root = mkdtempSync(join(tmpdir(), "designs-"));
const storage = new LocalDiskStorage(root, "/api/uploads");
vi.mock("@/server/adapters/storage", async (orig) => ({ ...(await orig<typeof import("@/server/adapters/storage")>()), getStorage: () => storage }));

import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDesignRow, createOrderItemRow, createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { fakePng } from "../helpers/png";
import { runPurgeDesigns } from "@/server/jobs/purge-designs";
import { JOBS } from "@/server/jobs";

const DAY = 86_400_000;

describe("purge-designs job", () => {
  beforeEach(resetDb);

  it("purges old unreferenced designs with their files and keeps everything else", async () => {
    const p = await createProduct({ isCustomizable: true });
    const old = new Date(Date.now() - 31 * DAY);
    for (const k of ["designs/print/old.png", "designs/previews/old.png", "designs/assets/shared.png", "designs/assets/solo.png"]) {
      await storage.put(k, fakePng(1, 1), "image/png");
    }
    const stale = await createDesignRow({ productId: p.id, cartToken: "g", createdAt: old, frontPrintKey: "designs/print/old.png", frontPreviewKey: "designs/previews/old.png", assetKeys: ["designs/assets/shared.png", "designs/assets/solo.png"] });
    const recent = await createDesignRow({ productId: p.id, cartToken: "g", assetKeys: ["designs/assets/shared.png"] });
    const inCart = await createDesignRow({ productId: p.id, cartToken: "g", createdAt: old });
    const cart = await db.cart.create({ data: { guestToken: "g" } });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: p.variants[0].id, quantity: 1, designId: inCart.id } });
    const u = await createUser();
    const ordered = await createDesignRow({ productId: p.id, userId: u.id, createdAt: old });
    await createOrderItemRow((await createOrderRow(u.id)).id, { designId: ordered.id });
    // Uploaded assets are tracked rows marked with the newest design using them.
    await db.designAsset.create({ data: { key: "designs/assets/shared.png", cartToken: "g", designId: recent.id, createdAt: old } });
    await db.designAsset.create({ data: { key: "designs/assets/solo.png", cartToken: "g", designId: stale.id, createdAt: old } });

    expect(await runPurgeDesigns()).toEqual({ purged: 1, filesDeleted: 3 });
    const left = (await db.design.findMany({ select: { id: true } })).map((d) => d.id).sort();
    expect(left).toEqual([recent.id, inCart.id, ordered.id].sort());
    expect(await db.design.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(existsSync(join(root, "designs", "print", "old.png"))).toBe(false);
    expect(existsSync(join(root, "designs", "previews", "old.png"))).toBe(false);
    expect(existsSync(join(root, "designs", "assets", "solo.png"))).toBe(false);
    expect(existsSync(join(root, "designs", "assets", "shared.png"))).toBe(true);
    expect(await runPurgeDesigns()).toEqual({ purged: 0, filesDeleted: 0 });
  });

  it("keeps the files a purged design shared with a design saved meanwhile", async () => {
    const p = await createProduct({ isCustomizable: true });
    const old = new Date(Date.now() - 31 * DAY);
    await storage.put("designs/assets/art.png", fakePng(1, 1), "image/png");
    const stale = await createDesignRow({ productId: p.id, cartToken: "g", createdAt: old, assetKeys: ["designs/assets/art.png"] });
    await db.designAsset.create({ data: { key: "designs/assets/art.png", cartToken: "g", designId: stale.id, createdAt: old } });
    // "Edit design" saves a new design using the same image right after the job checked who uses it.
    const original = db.design.findFirst;
    let saved = false;
    (db.design as { findFirst: unknown }).findFirst = (async (args: Parameters<typeof original>[0]) => {
      const r = await original(args);
      if (!saved) {
        saved = true;
        const d = await createDesignRow({ productId: p.id, cartToken: "g", assetKeys: ["designs/assets/art.png"] });
        await db.designAsset.updateMany({ where: { key: "designs/assets/art.png" }, data: { designId: d.id } });
      }
      return r;
    }) as unknown;
    try {
      await runPurgeDesigns();
    } finally {
      (db.design as { findFirst: unknown }).findFirst = original;
    }
    expect(saved).toBe(true);
    expect(existsSync(join(root, "designs", "assets", "art.png"))).toBe(true);
    expect(await db.designAsset.count()).toBe(1);
  });

  it("deletes uploaded assets no design used within 24 hours and keeps fresh or used ones", async () => {
    const p = await createProduct({ isCustomizable: true });
    const now = new Date();
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
    for (const k of ["abandoned", "fresh", "used", "legacy"]) await storage.put(`designs/assets/${k}.png`, fakePng(1, 1), "image/png");
    const d = await createDesignRow({ productId: p.id, cartToken: "g", assetKeys: ["designs/assets/used.png", "designs/assets/legacy.png"] });
    await db.designAsset.create({ data: { key: "designs/assets/abandoned.png", cartToken: "g", createdAt: hoursAgo(25) } });
    await db.designAsset.create({ data: { key: "designs/assets/fresh.png", cartToken: "g", createdAt: hoursAgo(23) } });
    await db.designAsset.create({ data: { key: "designs/assets/used.png", cartToken: "g", designId: d.id, createdAt: hoursAgo(48) } });
    // Unmarked but still listed by a design: re-pointed at it, never deleted.
    const legacy = await db.designAsset.create({ data: { key: "designs/assets/legacy.png", cartToken: "g", createdAt: hoursAgo(48) } });

    expect(await runPurgeDesigns(now)).toEqual({ purged: 0, filesDeleted: 1 });
    expect(existsSync(join(root, "designs", "assets", "abandoned.png"))).toBe(false);
    for (const k of ["fresh", "used", "legacy"]) expect(existsSync(join(root, "designs", "assets", `${k}.png`))).toBe(true);
    expect((await db.designAsset.findMany({ select: { key: true } })).map((a) => a.key).sort()).toEqual(["designs/assets/fresh.png", "designs/assets/legacy.png", "designs/assets/used.png"]);
    expect((await db.designAsset.findUniqueOrThrow({ where: { id: legacy.id } })).designId).toBe(d.id);
  });

  it("reads only the columns it needs from designs", async () => {
    const original = db.design.findMany;
    const seen: unknown[] = [];
    (db.design as { findMany: unknown }).findMany = ((args: Parameters<typeof original>[0]) => {
      seen.push(args);
      return original(args);
    }) as unknown;
    try {
      await runPurgeDesigns();
    } finally {
      (db.design as { findMany: unknown }).findMany = original;
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ select: { id: true, frontPrintKey: true } });
    expect(Object.keys((seen[0] as { select: object }).select)).not.toContain("frontJson");
  });

  it("is registered as a cron job", () => {
    expect(Object.keys(JOBS)).toContain("purge-designs");
  });
});
