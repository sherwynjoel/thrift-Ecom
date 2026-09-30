import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDesignRow, createOrderItemRow, createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { getSettings, getCustomFees } from "@/server/services/settings";
import { getLiveOffers } from "@/server/services/promotions";
import { ORDER_EVENT_TYPES } from "@/lib/order-status";

describe("phase 3 schema", () => {
  beforeEach(resetDb);

  it("keeps plain lines unique per variant but allows one custom line per design", async () => {
    const p = await createProduct({ isCustomizable: true });
    const v = p.variants[0];
    const cart = await db.cart.create({ data: { guestToken: "g1" } });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: 1 } });
    await expect(db.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: 1 } })).rejects.toMatchObject({ code: "P2002" });
    const d1 = await createDesignRow({ productId: p.id, cartToken: "g1" });
    const d2 = await createDesignRow({ productId: p.id, cartToken: "g1" });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: 1, designId: d1.id } });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: 1, designId: d2.id } });
    await expect(db.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: 1, designId: d1.id } })).rejects.toMatchObject({ code: "P2002" });
    expect(await db.cartItem.count()).toBe(3);
  });

  it("keeps the partial unique index in the database", async () => {
    const rows = await db.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE indexname = 'CartItem_cartId_variantId_plain_key'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/UNIQUE/);
    expect(rows[0].indexdef).toMatch(/WHERE \("designId" IS NULL\)/);
  });

  it("keeps the partial-index warning on the CartItem model", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    expect(schema).toMatch(/\/\/\/ Partial unique index CartItem_cartId_variantId_plain_key[^\n]*\r?\nmodel CartItem \{/);
  });

  it("removes cart lines with their design but keeps order items", async () => {
    const p = await createProduct({ isCustomizable: true });
    const d = await createDesignRow({ productId: p.id, cartToken: "g1" });
    const cart = await db.cart.create({ data: { guestToken: "g1" } });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: p.variants[0].id, quantity: 1, designId: d.id } });
    const order = await createOrderRow((await createUser()).id);
    const item = await createOrderItemRow(order.id, { designId: d.id });
    await db.design.delete({ where: { id: d.id } });
    expect(await db.cartItem.count()).toBe(0);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ designId: null, printFrontUrl: "/api/uploads/designs/print/f.png" });
  });

  it("defaults the print fees, the offer flag and adds the PRINTED event", async () => {
    const s = await getSettings();
    expect([s.customFrontFeePaise, s.customBackFeePaise]).toEqual([0, 14900]);
    expect(await getCustomFees()).toEqual({ frontPaise: 0, backPaise: 14900 });
    await db.offer.create({ data: { label: "Any 2", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900 } });
    await db.offer.create({ data: { label: "Custom too", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900, includeCustom: true } });
    expect((await getLiveOffers()).map((o) => [o.label, o.includeCustom])).toEqual([["Any 2", false], ["Custom too", true]]);
    expect(ORDER_EVENT_TYPES).toContain("PRINTED");
  });
});
