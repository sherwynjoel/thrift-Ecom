import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct, linkProductToCollection } from "../helpers/fixtures";
import {
  getCollectionBySlug,
  getFacets,
  getProductBySlug,
  getRelatedProducts,
  listCollections,
  listProducts,
  searchProducts,
} from "@/server/services/catalog";
import type { ProductFilters } from "@/server/services/catalog";
import { NotFoundError } from "@/server/errors";

describe("catalog service", () => {
  beforeEach(resetDb);

  it("lists active collections with active product counts, featured first then sortOrder", async () => {
    const a = await createCollection({ name: "Alpha", sortOrder: 2 });
    const b = await createCollection({ name: "Beta", sortOrder: 1, isFeatured: true });
    await createCollection({ name: "Hidden", isActive: false });
    await createProduct({ collectionIds: [a.id] });
    await createProduct({ collectionIds: [a.id], status: "DRAFT" });
    await createProduct({ collectionIds: [b.id] });
    const all = await listCollections();
    expect(all.map((c) => c.slug)).toEqual(["beta", "alpha"]);
    expect(all.find((c) => c.slug === "alpha")?.productCount).toBe(1);
    expect((await listCollections({ featuredOnly: true })).map((c) => c.slug)).toEqual(["beta"]);
    await expect(getCollectionBySlug("hidden")).rejects.toBeInstanceOf(NotFoundError);
    expect((await getCollectionBySlug("beta")).productCount).toBe(1);
  });

  it("lists only active products, paginated 24 per page, newest first", async () => {
    const col = await createCollection({ name: "Tees" });
    for (let i = 0; i < 30; i++) {
      await createProduct({ name: `Tee ${i}`, collectionIds: [col.id], createdAt: new Date(2026, 0, i + 1) });
    }
    await createProduct({ name: "Draft", collectionIds: [col.id], status: "DRAFT" });
    const p1 = await listProducts({ collectionSlug: "tees", sort: "newest" });
    expect(p1.total).toBe(30);
    expect(p1.items).toHaveLength(24);
    expect(p1.hasMore).toBe(true);
    expect(p1.items[0].name).toBe("Tee 29");
    const p2 = await listProducts({ collectionSlug: "tees", sort: "newest", page: 2 });
    expect(p2.items).toHaveLength(6);
    expect(p2.hasMore).toBe(false);
  });

  it("sorts featured by collection sortOrder and by price both ways", async () => {
    const col = await createCollection({ name: "Sorted" });
    const cheap = await createProduct({ name: "Cheap", basePricePaise: 30000 });
    const mid = await createProduct({ name: "Mid", basePricePaise: 50000 });
    const dear = await createProduct({ name: "Dear", basePricePaise: 90000 });
    await linkProductToCollection(col.id, dear.id, 0);
    await linkProductToCollection(col.id, cheap.id, 1);
    await linkProductToCollection(col.id, mid.id, 2);
    const names = async (sort: "featured" | "price-asc" | "price-desc") =>
      (await listProducts({ collectionSlug: "sorted", sort })).items.map((p) => p.name);
    expect(await names("featured")).toEqual(["Dear", "Cheap", "Mid"]);
    expect(await names("price-asc")).toEqual(["Cheap", "Mid", "Dear"]);
    expect(await names("price-desc")).toEqual(["Dear", "Mid", "Cheap"]);
  });

  it("filters by size, color, fit, and price range", async () => {
    await createProduct({ name: "Black L", fit: "OVERSIZED", basePricePaise: 50000, variants: [{ size: "L", colorName: "Black" }] });
    await createProduct({ name: "White S", fit: "REGULAR", basePricePaise: 80000, variants: [{ size: "S", colorName: "White" }] });
    const names = async (filters: ProductFilters) => (await listProducts({ filters })).items.map((p) => p.name);
    expect(await names({ size: ["L"] })).toEqual(["Black L"]);
    expect(await names({ color: ["White"] })).toEqual(["White S"]);
    expect(await names({ fit: ["REGULAR"] })).toEqual(["White S"]);
    expect(await names({ minPricePaise: 60000 })).toEqual(["White S"]);
    expect(await names({ maxPricePaise: 60000 })).toEqual(["Black L"]);
  });

  it("builds product cards with price, colors, first two images, and low stock flag", async () => {
    await createProduct({
      name: "Card",
      basePricePaise: 54900,
      compareAtPricePaise: 119900,
      variants: [
        { size: "M", colorName: "Black", colorHex: "#111111", stock: 2 },
        { size: "L", colorName: "Beige", colorHex: "#e5d5b5", stock: 4 },
      ],
      images: [{ url: "/a.svg" }, { url: "/b.svg" }, { url: "/c.svg" }],
    });
    const [card] = (await listProducts({})).items;
    expect(card.pricePaise).toBe(54900);
    expect(card.compareAtPricePaise).toBe(119900);
    expect(card.images.map((i) => i.url)).toEqual(["/a.svg", "/b.svg"]);
    expect(card.colors).toEqual([{ name: "Black", hex: "#111111" }, { name: "Beige", hex: "#e5d5b5" }]);
    expect(card.lowStock).toBe(true);
  });

  it("returns product detail with variants and collections, 404 for draft or missing", async () => {
    const col = await createCollection({ name: "Detail Col" });
    await createProduct({ name: "Detail", collectionIds: [col.id], variants: [{ size: "M", colorName: "Black", pricePaise: 64900 }] });
    await createProduct({ name: "Draft Detail", status: "DRAFT" });
    const d = await getProductBySlug("detail");
    expect(d.variants[0].pricePaise).toBe(64900);
    expect(d.collections[0].slug).toBe("detail-col");
    await expect(getProductBySlug("draft-detail")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getProductBySlug("nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("finds related products from the same collections, excluding itself", async () => {
    const col = await createCollection({ name: "Rel" });
    const me = await createProduct({ name: "Me", collectionIds: [col.id] });
    await createProduct({ name: "Sibling", collectionIds: [col.id] });
    await createProduct({ name: "Stranger" });
    const rel = await getRelatedProducts(me.id, 4);
    expect(rel.map((p) => p.name)).toEqual(["Sibling"]);
  });

  it("computes facets from active products and searches by name or description", async () => {
    await createProduct({ name: "Skate Tee", basePricePaise: 40000, variants: [{ size: "S", colorName: "Red", colorHex: "#f00" }] });
    await createProduct({ name: "Plain", basePricePaise: 70000, variants: [{ size: "XL", colorName: "Black", colorHex: "#000" }] });
    const f = await getFacets();
    expect(f.sizes).toEqual(["S", "XL"]);
    expect(f.colors).toEqual([{ name: "Black", hex: "#000" }, { name: "Red", hex: "#f00" }]);
    expect(f.minPricePaise).toBe(40000);
    expect(f.maxPricePaise).toBe(70000);
    expect((await searchProducts("skate")).items.map((p) => p.name)).toEqual(["Skate Tee"]);
    expect((await searchProducts("zzz")).total).toBe(0);
  });
});
