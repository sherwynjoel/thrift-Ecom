import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct } from "../helpers/fixtures";
import { listInventory, setVariantStock } from "@/server/services/admin-inventory";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

describe("inventory admin", () => {
  beforeEach(resetDb);

  it("lists non-archived variants, filters low stock at or below the threshold, and searches", async () => {
    await createProduct({ name: "Alpha Tee", variants: [{ size: "S", colorName: "Black", stock: 5 }, { size: "M", colorName: "Black", stock: 6 }] });
    await createProduct({ name: "Old Tee", status: "ARCHIVED", variants: [{ size: "S", colorName: "Red", stock: 0 }] });
    const all = await listInventory();
    expect(all.total).toBe(2);
    expect(all.threshold).toBe(5);
    expect(all.lowCount).toBe(1);
    const low = await listInventory({ lowOnly: true });
    expect(low.items.map((r) => [r.size, r.stock, r.low])).toEqual([["S", 5, true]]);
    expect((await listInventory({ q: "alpha" })).total).toBe(2);
  });

  it("sets stock, resetting the low-stock alert only above the threshold", async () => {
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 1 }] });
    const id = p.variants[0].id;
    await db.productVariant.update({ where: { id }, data: { lowStockAlertedAt: new Date() } });
    await setVariantStock(id, 4);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id } })).lowStockAlertedAt).not.toBeNull();
    const row = await setVariantStock(id, 20);
    expect(row).toMatchObject({ stock: 20, low: false });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id } })).lowStockAlertedAt).toBeNull();
    await expect(setVariantStock(id, -1)).rejects.toBeInstanceOf(ValidationError);
    await expect(setVariantStock("missing", 3)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("applies an edit as a change against the stock the admin loaded, so concurrent sales are kept", async () => {
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    const id = p.variants[0].id;
    // Admin loaded 5; meanwhile checkout sold 2 (stock is now 3). Admin types 10 (+5), so stock becomes 8.
    await db.productVariant.update({ where: { id }, data: { stock: 3 } });
    expect(await setVariantStock(id, 10, 5)).toMatchObject({ stock: 8 });
    // Admin loaded 8 and types 0 (-8), but checkout sold 2 more (stock 6): the write would go negative.
    await db.productVariant.update({ where: { id }, data: { stock: 6 } });
    await expect(setVariantStock(id, 0, 8)).rejects.toBeInstanceOf(ConflictError);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id } })).stock).toBe(6);
  });
});
