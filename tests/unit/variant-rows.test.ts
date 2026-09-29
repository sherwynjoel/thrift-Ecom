import { describe, expect, it } from "vitest";
import { buildVariantRows, variantKey } from "@/lib/variant-rows";

const black = { name: "Black", hex: "#111111" };
const white = { name: "White", hex: "#f2f2ee" };

describe("buildVariantRows", () => {
  it("builds one row per size × color in SIZES order, colors in given order", () => {
    const rows = buildVariantRows(["L", "S"], [black, white], []);
    expect(rows.map((r) => `${r.size}/${r.colorName}`)).toEqual(["S/Black", "L/Black", "S/White", "L/White"]);
    expect(rows.every((r) => r.stock === 0 && r.pricePaise === null && r.id === undefined)).toBe(true);
  });

  it("keeps id, stock and price of existing rows, matched case-insensitively by color", () => {
    const existing = [{ key: variantKey("M", "black"), id: "v1", size: "M", colorName: "black", colorHex: "#000000", pricePaise: 64900, stock: 7 }];
    const [row] = buildVariantRows(["M"], [black], existing);
    expect(row).toMatchObject({ id: "v1", stock: 7, pricePaise: 64900, colorName: "Black", colorHex: "#111111" });
  });

  it("drops rows whose size or color is no longer selected", () => {
    const existing = buildVariantRows(["S", "M"], [black], []);
    expect(buildVariantRows(["S"], [black], existing)).toHaveLength(1);
  });

  it("ignores blank color names and duplicate colors", () => {
    expect(buildVariantRows(["S"], [black, { name: " ", hex: "#fff000" }, { name: "BLACK", hex: "#222222" }], [])).toHaveLength(1);
  });
});
