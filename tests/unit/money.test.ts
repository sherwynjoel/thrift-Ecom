import { describe, expect, it } from "vitest";
import { discountPercent, formatPaise, paiseToRupees, rupeesToPaise } from "@/lib/money";

describe("money", () => {
  it("formats paise as Indian rupees with grouping", () => {
    expect(formatPaise(54900)).toBe("₹549");
    expect(formatPaise(119900)).toBe("₹1,199");
    expect(formatPaise(12345600)).toBe("₹1,23,456");
    expect(formatPaise(0)).toBe("₹0");
  });

  it("computes discount percent, or null when no real discount", () => {
    expect(discountPercent(54900, 119900)).toBe(54);
    expect(discountPercent(54900, null)).toBeNull();
    expect(discountPercent(54900, 54900)).toBeNull();
    expect(discountPercent(54900, 40000)).toBeNull();
  });
});

describe("rupee/paise conversion", () => {
  it("parses rupee strings into paise", () => {
    expect(rupeesToPaise("549")).toBe(54900);
    expect(rupeesToPaise(" 549.5 ")).toBe(54950);
    expect(rupeesToPaise("0.01")).toBe(1);
    expect(rupeesToPaise("")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("1.234")).toBeNull();
  });

  it("formats paise for an input field", () => {
    expect(paiseToRupees(54900)).toBe("549");
    expect(paiseToRupees(54950)).toBe("549.50");
    expect(paiseToRupees(null)).toBe("");
    expect(paiseToRupees(undefined)).toBe("");
  });
});
