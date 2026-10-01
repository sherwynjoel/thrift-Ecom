import { describe, expect, it } from "vitest";
import { radioTabIndex } from "@/lib/roving-radio";

const sizes = [{ s: "S", out: true }, { s: "M", out: false }, { s: "L", out: false }];
const tabStops = (checked: string | null) =>
  sizes.map((_, i) => radioTabIndex(sizes, i, (x) => x.s === checked, (x) => x.out));

describe("radioTabIndex", () => {
  it("makes the checked radio the only tab stop", () => {
    expect(tabStops("L")).toEqual([-1, -1, 0]);
  });
  it("falls back to the first enabled radio when none (or a disabled one) is checked", () => {
    expect(tabStops(null)).toEqual([-1, 0, -1]);
    expect(tabStops("S")).toEqual([-1, 0, -1]);
  });
});
