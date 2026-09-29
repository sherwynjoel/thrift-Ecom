import { describe, expect, it } from "vitest";
import { discountPercent, formatPaise } from "@/lib/money";

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
