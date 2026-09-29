import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct, linkProductToCollection } from "../helpers/fixtures";
import {
  createProduct as adminCreate,
  deleteProduct,
  getAdminProduct,
  listAdminProducts,
  updateProduct,
} from "@/server/services/admin-products";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

const input = (over: Record<string, unknown> = {}) => ({
  name: "Midnight Tee",
  slug: "",
  description: "Soft and heavy.",
  fit: "OVERSIZED",
  fabric: "100% Cotton",
  basePricePaise: 69900,
  compareAtPricePaise: 99900,
  status: "ACTIVE",
  isCustomizable: false,
  collectionIds: [] as string[],
  variants: [
    { size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 5 },
    { size: "L", colorName: "Black", colorHex: "#111111", pricePaise: 74900, stock: 2 },
  ],
  ...over,
});

describe("admin products service", () => {
  beforeEach(resetDb);

  it("creates a product with derived unique slug, SKUs and collection links", async () => {
    const col = await createCollection({ name: "Drops" });
    await createProduct({ name: "Midnight Tee" }); // occupies slug midnight-tee
    const { id, slug } = await adminCreate(input({ collectionIds: [col.id] }));
    expect(slug).toBe("midnight-tee-2");
    const p = await getAdminProduct(id);
    expect(p.variants.map((v) => v.sku).sort()).toEqual(["MIDNIGHT-TEE-2-BLACK-L", "MIDNIGHT-TEE-2-BLACK-M"]);
    expect(p.variants.find((v) => v.size === "L")?.pricePaise).toBe(74900);
    expect(p.collectionIds).toEqual([col.id]);
  });

  it("rejects invalid input with field errors", async () => {
    await expect(adminCreate(input({ name: "x", variants: [] }))).rejects.toBeInstanceOf(ValidationError);
    await expect(adminCreate(input({ collectionIds: ["nope"] }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates fields, updates/creates/deletes variants, keeps SKUs stable", async () => {
    const { id } = await adminCreate(input());
    const before = await getAdminProduct(id);
    const m = before.variants.find((v) => v.size === "M")!;
    await updateProduct(id, input({
      name: "Midnight Tee v2",
      slug: "midnight-tee",
      variants: [
        { id: m.id, size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 9 },
        { size: "XL", colorName: "White", colorHex: "#f2f2ee", pricePaise: null, stock: 1 },
      ],
    }));
    const after = await getAdminProduct(id);
    expect(after.name).toBe("Midnight Tee v2");
    expect(after.variants.map((v) => `${v.size}/${v.colorName}/${v.stock}`).sort()).toEqual(["M/Black/9", "XL/White/1"]);
    expect(after.variants.find((v) => v.id === m.id)?.sku).toBe(m.sku);
  });

  it("refuses to drop a variant that is in a customer's bag", async () => {
    const { id } = await adminCreate(input());
    const p = await getAdminProduct(id);
    const l = p.variants.find((v) => v.size === "L")!;
    const cart = await db.cart.create({ data: { guestToken: "g-admin" } });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: l.id, quantity: 1 } });
    const keepOnlyM = p.variants.filter((v) => v.size === "M").map((v) => ({ id: v.id, size: v.size, colorName: v.colorName, colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock }));
    await expect(updateProduct(id, input({ variants: keepOnlyM }))).rejects.toBeInstanceOf(ConflictError);
    expect((await getAdminProduct(id)).variants.find((v) => v.id === l.id)?.inCarts).toBe(1);
  });

  it("rejects variant ids from another product", async () => {
    const other = await createProduct({ name: "Other" });
    const { id } = await adminCreate(input());
    const foreign = { id: other.variants[0].id, size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 1 };
    await expect(updateProduct(id, input({ variants: [foreign] }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("syncs collection links, appending new ones at the end and keeping existing order", async () => {
    const a = await createCollection({ name: "A" });
    const b = await createCollection({ name: "B" });
    const existing = await createProduct({ name: "First" });
    await linkProductToCollection(b.id, existing.id, 4);
    const { id } = await adminCreate(input({ collectionIds: [a.id] }));
    await updateProduct(id, input({ collectionIds: [b.id] }));
    const links = await db.productCollection.findMany({ where: { productId: id } });
    expect(links.map((l) => [l.collectionId, l.sortOrder])).toEqual([[b.id, 5]]);
  });

  it("lists with search, status filter, stock totals and first image", async () => {
    await createProduct({ name: "Alpha Tee", status: "DRAFT", images: [{ url: "/a1.svg" }, { url: "/a2.svg" }], variants: [{ size: "S", colorName: "Red", stock: 3 }, { size: "M", colorName: "Red", stock: 4 }] });
    await createProduct({ name: "Beta Tee", status: "ACTIVE" });
    const all = await listAdminProducts();
    expect(all.total).toBe(2);
    const drafts = await listAdminProducts({ status: "DRAFT" });
    expect(drafts.items.map((p) => p.name)).toEqual(["Alpha Tee"]);
    expect(drafts.items[0]).toMatchObject({ variantCount: 2, totalStock: 7, imageUrl: "/a1.svg" });
    expect((await listAdminProducts({ q: "beta" })).items.map((p) => p.name)).toEqual(["Beta Tee"]);
  });

  it("only deletes non-active products and 404s afterwards", async () => {
    const { id } = await adminCreate(input());
    await expect(deleteProduct(id)).rejects.toBeInstanceOf(ConflictError);
    await updateProduct(id, input({ status: "ARCHIVED" }));
    await deleteProduct(id);
    await expect(getAdminProduct(id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("swaps two existing variants' size and color in one save", async () => {
    const { id } = await adminCreate(input());
    const before = await getAdminProduct(id);
    const m = before.variants.find((v) => v.size === "M")!;
    const l = before.variants.find((v) => v.size === "L")!;
    await updateProduct(id, input({
      variants: [
        { id: m.id, size: "L", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 9 },
        { id: l.id, size: "M", colorName: "Black", colorHex: "#111111", pricePaise: 74900, stock: 1 },
      ],
    }));
    const after = await getAdminProduct(id);
    const newM = after.variants.find((v) => v.id === m.id)!;
    const newL = after.variants.find((v) => v.id === l.id)!;
    expect(newM.size).toBe("L");
    expect(newM.stock).toBe(9);
    expect(newM.sku).toBe(m.sku);
    expect(newL.size).toBe("M");
    expect(newL.stock).toBe(1);
    expect(newL.sku).toBe(l.sku);
  });

  it("keeps its own slug unchanged when resaving with the same slug", async () => {
    const { id, slug } = await adminCreate(input());
    expect(slug).toBe("midnight-tee");
    await updateProduct(id, input({ slug }));
    const after = await getAdminProduct(id);
    expect(after.slug).toBe("midnight-tee");
  });
});
