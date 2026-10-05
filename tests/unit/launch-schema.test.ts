import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDeliveredPurchase, createProduct, createUser } from "../helpers/fixtures";

describe("phase 4 schema", () => {
  beforeEach(resetDb);

  it("enforces 1–5 ratings and one review per order item", async () => {
    const u = await createUser();
    const p = await createProduct();
    const { item, order } = await createDeliveredPurchase(u.id, p.id);
    expect(order.status).toBe("DELIVERED");
    expect(order.deliveredAt).toBeInstanceOf(Date);
    await expect(db.review.create({ data: { productId: p.id, userId: u.id, orderItemId: item.id, rating: 6 } })).rejects.toThrow();
    await expect(db.review.create({ data: { productId: p.id, userId: u.id, orderItemId: item.id, rating: 0 } })).rejects.toThrow();
    await db.review.create({ data: { productId: p.id, userId: u.id, orderItemId: item.id, rating: 5 } });
    await expect(db.review.create({ data: { productId: p.id, userId: u.id, orderItemId: item.id, rating: 4 } })).rejects.toThrow();
  });

  it("keeps one wishlist row per user and product and cascades product deletes", async () => {
    const u = await createUser();
    const p = await createProduct();
    await db.wishlistItem.create({ data: { userId: u.id, productId: p.id } });
    await expect(db.wishlistItem.create({ data: { userId: u.id, productId: p.id } })).rejects.toThrow();
    await db.product.delete({ where: { id: p.id } });
    expect(await db.wishlistItem.count()).toBe(0);
  });
});
