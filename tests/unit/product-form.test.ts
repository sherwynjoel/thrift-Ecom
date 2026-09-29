import { describe, expect, it } from "vitest";
import { emptyProductForm, productFormFromProduct, toProductInput } from "@/lib/product-form";

describe("product form helper", () => {
  it("starts empty with one black color and no sizes", () => {
    const s = emptyProductForm();
    expect(s.status).toBe("DRAFT");
    expect(s.colors).toEqual([{ name: "Black", hex: "#111111" }]);
    expect(s.rows).toEqual([]);
  });

  it("loads a product into sizes, colors, and rows keyed by size|color", () => {
    const s = productFormFromProduct({
      name: "Tee", slug: "tee", description: "", fit: "REGULAR", fabric: "Cotton", basePricePaise: 54950, compareAtPricePaise: null,
      status: "ACTIVE", isCustomizable: true, collectionIds: ["c1"],
      variants: [
        { id: "v1", size: "L", colorName: "White", colorHex: "#ffffff", pricePaise: null, stock: 3 },
        { id: "v2", size: "S", colorName: "White", colorHex: "#ffffff", pricePaise: 49900, stock: 0 },
      ],
    });
    expect(s.priceText).toBe("549.50");
    expect(s.sizes).toEqual(["S", "L"]);
    expect(s.colors).toEqual([{ name: "White", hex: "#ffffff" }]);
    expect(s.rows.map((r) => [r.key, r.id, r.stock])).toEqual([["S|white", "v2", 0], ["L|white", "v1", 3]]);
  });

  it("converts to service input, reporting bad price text locally", () => {
    const s = { ...emptyProductForm(), name: "Tee", fabric: "Cotton", priceText: "abc" };
    expect(toProductInput(s).errors.basePricePaise).toBeDefined();
    const ok = toProductInput({ ...s, priceText: "599", compareAtText: "" });
    expect(ok.errors).toEqual({});
    expect(ok.input).toMatchObject({ basePricePaise: 59900, compareAtPricePaise: null, variants: [] });
  });
});
