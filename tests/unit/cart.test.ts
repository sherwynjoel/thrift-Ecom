import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct } from "../helpers/fixtures";
import { addItem, getCart, mergeGuestCartIntoUser, removeItem, updateItem } from "@/server/services/cart";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";

async function variantOf(name: string, stock: number, pricePaise = 59900) {
  const p = await createProduct({ name, basePricePaise: pricePaise, variants: [{ size: "M", colorName: "Black", stock }] });
  return p.variants[0];
}

describe("cart service", () => {
  beforeEach(resetDb);

  it("returns an empty cart view for an unknown guest without creating rows", async () => {
    const view = await getCart({ guestToken: "nobody" });
    expect(view.items).toEqual([]);
    expect(view.subtotalPaise).toBe(0);
    expect(await db.cart.count()).toBe(0);
  });

  it("adds items, sums quantities, and computes totals", async () => {
    const v = await variantOf("Tee", 10, 50000);
    await addItem({ guestToken: "g1" }, v.id, 2);
    const view = await addItem({ guestToken: "g1" }, v.id, 1);
    expect(view.items).toHaveLength(1);
    expect(view.items[0].quantity).toBe(3);
    expect(view.items[0].lineTotalPaise).toBe(150000);
    expect(view.subtotalPaise).toBe(150000);
    expect(view.itemCount).toBe(3);
    expect(view.items[0].product.slug).toBe("tee");
    expect(view.items[0].variant.size).toBe("M");
  });

  it("rejects quantities beyond stock or the per-line cap, and unknown or inactive variants", async () => {
    const v = await variantOf("Scarce", 2);
    await expect(addItem({ guestToken: "g2" }, v.id, 3)).rejects.toBeInstanceOf(OutOfStockError);
    await addItem({ guestToken: "g2" }, v.id, 2);
    await expect(addItem({ guestToken: "g2" }, v.id, 1)).rejects.toBeInstanceOf(OutOfStockError);

    const plenty = await variantOf("Plenty", 100);
    await expect(addItem({ guestToken: "g2" }, plenty.id, 11)).rejects.toBeInstanceOf(ValidationError);
    await expect(addItem({ guestToken: "g2" }, plenty.id, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(addItem({ guestToken: "g2" }, "missing", 1)).rejects.toBeInstanceOf(NotFoundError);

    const draft = await createProduct({ name: "Draft", status: "DRAFT" });
    await expect(addItem({ guestToken: "g2" }, draft.variants[0].id, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates and removes lines, treating quantity 0 as remove", async () => {
    const v = await variantOf("Upd", 5);
    const view = await addItem({ guestToken: "g3" }, v.id, 1);
    const itemId = view.items[0].id;
    expect((await updateItem({ guestToken: "g3" }, itemId, 4)).items[0].quantity).toBe(4);
    await expect(updateItem({ guestToken: "g3" }, itemId, 6)).rejects.toBeInstanceOf(OutOfStockError);
    expect((await updateItem({ guestToken: "g3" }, itemId, 0)).items).toEqual([]);
    await expect(removeItem({ guestToken: "g3" }, itemId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not let one cart touch another cart's line", async () => {
    const v = await variantOf("Iso", 5);
    const mine = await addItem({ guestToken: "me" }, v.id, 1);
    await expect(updateItem({ guestToken: "you" }, mine.items[0].id, 2)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("merges a guest cart into the user cart with stock caps and deletes the guest cart", async () => {
    const user = await db.user.create({ data: { email: "u@test.local" } });
    const a = await variantOf("A", 3);
    const b = await variantOf("B", 10);
    await addItem({ userId: user.id }, a.id, 2);
    await addItem({ guestToken: "guest" }, a.id, 2);
    await addItem({ guestToken: "guest" }, b.id, 1);

    const merged = await mergeGuestCartIntoUser("guest", user.id);
    const qty = Object.fromEntries(merged.items.map((i) => [i.variantId, i.quantity]));
    expect(qty[a.id]).toBe(3);
    expect(qty[b.id]).toBe(1);
    expect(await db.cart.findUnique({ where: { guestToken: "guest" } })).toBeNull();
    expect((await getCart({ userId: user.id })).itemCount).toBe(4);
  });
});
