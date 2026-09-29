import { describe, expect, it } from "vitest";
import { colorsOf, defaultColor, sizesFor } from "@/lib/variant-matrix";

const v = (size: string, colorName: string, stock: number, pricePaise = 59900) => ({ id: `${colorName}-${size}`, sku: "", size, colorName, colorHex: "#000", stock, pricePaise });

describe("variant-matrix", () => {
  const variants = [v("L", "Black", 0), v("S", "Black", 2), v("M", "White", 5), v("XL", "White", 0)];

  it("lists colors in first-seen order", () => {
    expect(colorsOf(variants).map((c) => c.name)).toEqual(["Black", "White"]);
  });

  it("orders sizes by the canonical size list for one color", () => {
    expect(sizesFor(variants, "Black").map((s) => s.size)).toEqual(["S", "L"]);
    expect(sizesFor(variants, "White").map((s) => s.stock)).toEqual([5, 0]);
  });

  it("defaults to the first color that has stock", () => {
    expect(defaultColor(variants)).toBe("Black");
    expect(defaultColor([v("M", "Red", 0), v("M", "Blue", 1)])).toBe("Blue");
    expect(defaultColor([v("M", "Red", 0)])).toBe("Red");
    expect(defaultColor([])).toBeNull();
  });
});
