import { describe, expect, it } from "vitest";
import { collectionInputSchema, productInputSchema } from "@/lib/validation/admin";

const base = {
  name: "Test Tee",
  slug: "",
  description: "",
  fit: "OVERSIZED",
  fabric: "100% Cotton",
  basePricePaise: 59900,
  compareAtPricePaise: null,
  status: "DRAFT",
  isCustomizable: false,
  collectionIds: [],
  variants: [],
};

describe("productInputSchema", () => {
  it("accepts a draft without variants", () => {
    expect(productInputSchema.safeParse(base).success).toBe(true);
  });

  it("requires at least one variant to publish", () => {
    const r = productInputSchema.safeParse({ ...base, status: "ACTIVE" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "variants")).toBe(true);
  });

  it("rejects a compare-at price not above the base price", () => {
    const r = productInputSchema.safeParse({ ...base, compareAtPricePaise: 59900 });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate size/color pairs and bad hex or slug", () => {
    const v = { size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 3 };
    expect(productInputSchema.safeParse({ ...base, variants: [v, { ...v, colorName: "black" }] }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, variants: [{ ...v, colorHex: "black" }] }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, variants: [{ ...v, size: "XXXL" }] }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, slug: "Bad Slug" }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, variants: [{ ...v, stock: -1 }] }).success).toBe(false);
  });
});

describe("collectionInputSchema", () => {
  it("validates name and optional slug", () => {
    expect(collectionInputSchema.safeParse({ name: "Summer", slug: "", description: "", isFeatured: true, isActive: true, sortOrder: 2 }).success).toBe(true);
    expect(collectionInputSchema.safeParse({ name: "S", slug: "", description: "", isFeatured: false, isActive: true, sortOrder: 0 }).success).toBe(false);
  });
});
