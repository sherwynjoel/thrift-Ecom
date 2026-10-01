import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { addToWishlist, listWishlist, listWishlistProductIds, removeFromWishlist } from "@/server/services/wishlist";
import { listAdminProducts } from "@/server/services/admin-products";
import { NotFoundError, ValidationError } from "@/server/errors";

describe("wishlist service", () => {
  beforeEach(resetDb);

  it("adds idempotently and lists newest first", async () => {
    const u = await createUser();
    const a = await createProduct({ name: "Alpha Tee" });
    const b = await createProduct({ name: "Beta Tee" });
    expect(await addToWishlist(u.id, a.id)).toEqual({ added: true });
    expect(await addToWishlist(u.id, a.id)).toEqual({ added: false });
    await addToWishlist(u.id, b.id);
    expect((await listWishlist(u.id)).map((p) => p.name)).toEqual(["Beta Tee", "Alpha Tee"]);
    expect(await listWishlistProductIds(u.id)).toEqual([b.id, a.id]);
  });

  it("refuses unknown or unpublished products and hides products archived later", async () => {
    const u = await createUser();
    const draft = await createProduct({ status: "DRAFT" });
    await expect(addToWishlist(u.id, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addToWishlist(u.id, "nope")).rejects.toBeInstanceOf(NotFoundError);
    const p = await createProduct();
    await addToWishlist(u.id, p.id);
    await db.product.update({ where: { id: p.id }, data: { status: "ARCHIVED" } });
    expect(await listWishlist(u.id)).toEqual([]);
    expect(await listWishlistProductIds(u.id)).toEqual([p.id]);
  });

  it("removes idempotently and only for that user", async () => {
    const [u, v] = [await createUser(), await createUser()];
    const p = await createProduct();
    await addToWishlist(u.id, p.id);
    await addToWishlist(v.id, p.id);
    await removeFromWishlist(u.id, p.id);
    await removeFromWishlist(u.id, p.id);
    expect(await listWishlistProductIds(u.id)).toEqual([]);
    expect(await listWishlistProductIds(v.id)).toEqual([p.id]);
  });

  it("caps the list size", async () => {
    const u = await createUser();
    const p = await createProduct();
    // Reassign and restore manually: vi.spyOn(...).mockRestore() breaks this Prisma model's methods
    // for later tests in this file on this Vitest version.
    const original = db.wishlistItem.count;
    db.wishlistItem.count = (async () => 200) as unknown as typeof original;
    try {
      await expect(addToWishlist(u.id, p.id)).rejects.toBeInstanceOf(ValidationError);
    } finally {
      db.wishlistItem.count = original;
    }
  });

  it("shows how many customers saved each product in the admin list", async () => {
    const p = await createProduct({ name: "Saved Tee" });
    for (const u of [await createUser(), await createUser()]) await addToWishlist(u.id, p.id);
    const row = (await listAdminProducts({ q: "saved" })).items[0];
    expect(row.wishlistCount).toBe(2);
  });
});
