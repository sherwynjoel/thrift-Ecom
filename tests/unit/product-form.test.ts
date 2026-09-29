import { describe, expect, it } from "vitest";
import { paiseToRupees } from "@/lib/money";
import { emptyProductForm, productFormFromProduct, rebuildRows, toProductInput } from "@/lib/product-form";

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

  it("refuses to save a variant price override that doesn't parse, instead of silently dropping it", () => {
    const s = {
      ...emptyProductForm(),
      name: "Tee",
      fabric: "Cotton",
      priceText: "599",
      sizes: ["M"],
      rows: [{ key: "M|black", size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 1 }],
      priceTexts: { "M|black": "12.345" },
    };
    const result = toProductInput(s);
    expect(result.input).toBeNull();
    expect(result.errors.variants).toEqual(["Fix the price override for Black / M"]);
  });

  it("recovers a variant's id, stock, and price override after its size is toggled off and back on", () => {
    const s = productFormFromProduct({
      name: "Tee", slug: "tee", description: "", fit: "REGULAR", fabric: "Cotton", basePricePaise: 59900, compareAtPricePaise: null,
      status: "DRAFT", isCustomizable: false, collectionIds: [],
      variants: [
        { id: "vS", size: "S", colorName: "Black", colorHex: "#111111", pricePaise: 45000, stock: 4 },
        { id: "vM", size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 9 },
      ],
    });
    const withoutS = rebuildRows(s, ["M"], s.colors);
    expect(withoutS.rows.map((r) => r.key)).toEqual(["M|black"]);

    const s2 = { ...s, sizes: ["M"], rows: withoutS.rows, priceTexts: withoutS.priceTexts };
    const restored = rebuildRows(s2, ["S", "M"], s2.colors);
    const sRow = restored.rows.find((r) => r.key === "S|black");
    expect(sRow).toMatchObject({ id: "vS", stock: 4, pricePaise: 45000 });
  });

  it("keeps the displayed price and the saved price in sync after a size is toggled off and back on", () => {
    const s = productFormFromProduct({
      name: "Tee", slug: "tee", description: "", fit: "REGULAR", fabric: "Cotton", basePricePaise: 59900, compareAtPricePaise: null,
      status: "DRAFT", isCustomizable: false, collectionIds: [],
      variants: [
        { id: "vS", size: "S", colorName: "Black", colorHex: "#111111", pricePaise: 45000, stock: 4 },
        { id: "vM", size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 9 },
      ],
    });
    // Simulate typing "700" into the S row's price override, without saving.
    const edited = {
      ...s,
      priceTexts: { ...s.priceTexts, "S|black": "700" },
      rows: s.rows.map((r) => (r.key === "S|black" ? { ...r, pricePaise: 70000 } : r)),
    };

    const withoutS = rebuildRows(edited, ["M"], edited.colors);
    const s2 = { ...edited, sizes: ["M"], rows: withoutS.rows, priceTexts: withoutS.priceTexts };
    const restored = rebuildRows(s2, ["S", "M"], s2.colors);

    const sRow = restored.rows.find((r) => r.key === "S|black")!;
    const displayedText = restored.priceTexts["S|black"] ?? paiseToRupees(sRow.pricePaise);

    const finalState = { ...s, sizes: ["S", "M"], rows: restored.rows, priceTexts: restored.priceTexts };
    const saved = toProductInput(finalState).input;
    const savedPrice = saved!.variants.find((v) => v.size === "S")!.pricePaise;

    expect(displayedText).toBe("450");
    expect(savedPrice).toBe(45000);
  });

  it("saves a newly typed price override without toggling anything", () => {
    const s = productFormFromProduct({
      name: "Tee", slug: "tee", description: "", fit: "REGULAR", fabric: "Cotton", basePricePaise: 59900, compareAtPricePaise: null,
      status: "DRAFT", isCustomizable: false, collectionIds: [],
      variants: [{ id: "vS", size: "S", colorName: "Black", colorHex: "#111111", pricePaise: 45000, stock: 4 }],
    });
    const edited = {
      ...s,
      priceTexts: { ...s.priceTexts, "S|black": "700" },
      rows: s.rows.map((r) => (r.key === "S|black" ? { ...r, pricePaise: 70000 } : r)),
    };
    const { input } = toProductInput(edited);
    expect(input!.variants.find((v) => v.size === "S")!.pricePaise).toBe(70000);
  });
});
