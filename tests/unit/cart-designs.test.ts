import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDesignRow, createProduct, createUser } from "../helpers/fixtures";
import { addItem, getCart, mergeGuestCartIntoUser, updateItem } from "@/server/services/cart";
import { getSettings } from "@/server/services/settings";
import { ConflictError, NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";

async function blank(stock = 10, over: { slug?: string; basePricePaise?: number } = {}) {
  return createProduct({ isCustomizable: true, ...over, variants: [{ size: "M", colorName: "Black", stock }] });
}

describe("cart with custom lines", () => {
  beforeEach(resetDb);

  it("keeps plain and custom lines of one variant apart and checks stock across them", async () => {
    const p = await blank(3);
    const v = p.variants[0];
    const d = await createDesignRow({ productId: p.id, cartToken: "g1" });
    await addItem({ guestToken: "g1" }, v.id, 2);
    const view = await addItem({ guestToken: "g1" }, v.id, 1, { designId: d.id });
    expect(view.items.map((i) => [i.quantity, i.design?.id ?? null])).toEqual([[2, null], [1, d.id]]);
    await expect(addItem({ guestToken: "g1" }, v.id, 1, { designId: d.id })).rejects.toMatchObject({ available: 1 });
    await expect(addItem({ guestToken: "g1" }, v.id, 1)).rejects.toBeInstanceOf(OutOfStockError);
    const custom = view.items.find((i) => i.design)!;
    await expect(updateItem({ guestToken: "g1" }, custom.id, 2)).rejects.toBeInstanceOf(OutOfStockError);
  });

  it("adds the same design once and increases its quantity", async () => {
    const p = await blank();
    const d = await createDesignRow({ productId: p.id, cartToken: "g1" });
    await addItem({ guestToken: "g1" }, p.variants[0].id, 1, { designId: d.id });
    const view = await addItem({ guestToken: "g1" }, p.variants[0].id, 2, { designId: d.id });
    expect(view.items).toHaveLength(1);
    expect(view.items[0].quantity).toBe(3);
  });

  it("holds at most 10 custom designs per bag, and still takes more of one already in it", async () => {
    const p = await blank(50);
    const v = p.variants[0];
    const designs = [];
    for (let i = 0; i < 11; i++) designs.push(await createDesignRow({ productId: p.id, cartToken: "g1" }));
    for (const d of designs.slice(0, 10)) await addItem({ guestToken: "g1" }, v.id, 1, { designId: d.id });
    const err = await addItem({ guestToken: "g1" }, v.id, 1, { designId: designs[10].id }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as Error).message).toBe("Your bag can hold up to 10 custom designs");
    expect((await addItem({ guestToken: "g1" }, v.id, 1, { designId: designs[0].id })).items).toHaveLength(10);
    expect((await addItem({ guestToken: "g1" }, v.id, 1)).items).toHaveLength(11); // plain lines are not capped
  });

  it("refuses designs owned by someone else, made for another product or another color", async () => {
    const p = await blank();
    const other = await createProduct({ isCustomizable: true, variants: [{ size: "M", colorName: "White", stock: 5 }] });
    const theirs = await createDesignRow({ productId: p.id, cartToken: "someone-else" });
    const mine = await createDesignRow({ productId: p.id, cartToken: "g1" });
    const white = await createDesignRow({ productId: other.id, cartToken: "g1", colorName: "Black" });
    await expect(addItem({ guestToken: "g1" }, p.variants[0].id, 1, { designId: theirs.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(addItem({ guestToken: "g1" }, other.variants[0].id, 1, { designId: mine.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(addItem({ guestToken: "g1" }, other.variants[0].id, 1, { designId: white.id })).rejects.toBeInstanceOf(ValidationError);
    const u = await createUser();
    await expect(addItem({ userId: u.id }, p.variants[0].id, 1, { designId: mine.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("prices custom lines with the print fees and links back to the studio", async () => {
    await getSettings();
    await db.storeSetting.update({ where: { id: 1 }, data: { customFrontFeePaise: 5000, customBackFeePaise: 14900 } });
    const p = await blank(10, { slug: "blank-tee", basePricePaise: 54900 });
    const d = await createDesignRow({ productId: p.id, cartToken: "g1", backPrintKey: "designs/print/b.png", backPreviewKey: "designs/previews/b.png" });
    const view = await addItem({ guestToken: "g1" }, p.variants[0].id, 2, { designId: d.id });
    expect(view.items[0]).toMatchObject({
      lineTotalPaise: 2 * 74800,
      variant: { pricePaise: 74800 },
      design: { id: d.id, label: "Custom print: front + back", editHref: `/customize/blank-tee?design=${d.id}`, previewUrl: "/api/uploads/designs/previews/f.png" },
      product: { imageUrl: "/api/uploads/designs/previews/f.png" },
    });
    expect(view.subtotalPaise).toBe(149600);
    expect((await getCart({ guestToken: "g1" })).items[0].design?.id).toBe(d.id);
  });

  it("hands designs and custom lines to the user on login, capped by stock", async () => {
    const p = await blank(3);
    const v = p.variants[0];
    const u = await createUser();
    await addItem({ userId: u.id }, v.id, 2);
    const d = await createDesignRow({ productId: p.id, cartToken: "g1" });
    await createDesignRow({ productId: p.id, cartToken: "g1" }); // designed but never added
    await addItem({ guestToken: "g1" }, v.id, 1, { designId: d.id });
    await addItem({ guestToken: "g1" }, v.id, 1);
    const merged = await mergeGuestCartIntoUser("g1", u.id);
    expect(merged.items.map((i) => [i.quantity, i.design?.id ?? null])).toEqual([[2, null], [1, d.id]]);
    expect(await db.design.count({ where: { userId: u.id, cartToken: null } })).toBe(2);
    expect(await db.cart.count({ where: { guestToken: "g1" } })).toBe(0);
  });

  it("turns a lost race on the plain-line unique index into an update", async () => {
    const p = await blank();
    const v = p.variants[0];
    await addItem({ guestToken: "g1" }, v.id, 1);
    // Simulate a concurrent add: the first lookup misses the line another request just created.
    const original = db.cartItem.findFirst;
    let calls = 0;
    (db.cartItem as { findFirst: unknown }).findFirst = ((args: Parameters<typeof original>[0]) => (calls++ === 0 ? Promise.resolve(null) : original(args))) as unknown;
    try {
      const view = await addItem({ guestToken: "g1" }, v.id, 2);
      expect(view.items.map((i) => i.quantity)).toEqual([3]);
    } finally {
      (db.cartItem as { findFirst: unknown }).findFirst = original;
    }
  });

  it("hands designs over even when the guest has no cart", async () => {
    const p = await blank();
    const u = await createUser();
    await createDesignRow({ productId: p.id, cartToken: "lonely" });
    await mergeGuestCartIntoUser("lonely", u.id);
    expect(await db.design.count({ where: { userId: u.id } })).toBe(1);
  });
});
