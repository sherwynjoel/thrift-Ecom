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

  it("is registered as a cron job", () => {
    expect(Object.keys(JOBS)).toContain("purge-designs");
  });
});
