import { describe, expect, it } from "vitest";
import { nextRadioIndex, radioTabIndex } from "@/lib/roving-radio";

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

describe("nextRadioIndex", () => {
  it("steps forward/backward and wraps at the ends", () => {
    expect(nextRadioIndex("ArrowRight", 3, 0)).toBe(1);
    expect(nextRadioIndex("ArrowDown", 3, 0)).toBe(1);
    expect(nextRadioIndex("ArrowRight", 3, 2)).toBe(0);
    expect(nextRadioIndex("ArrowLeft", 3, 0)).toBe(2);
    expect(nextRadioIndex("ArrowUp", 3, 0)).toBe(2);
  });
  it("jumps to the first/last index on Home/End", () => {
    expect(nextRadioIndex("Home", 4, 2)).toBe(0);
    expect(nextRadioIndex("End", 4, 2)).toBe(3);
  });
  it("ignores other keys and an empty group", () => {
    expect(nextRadioIndex("Tab", 3, 0)).toBeNull();
    expect(nextRadioIndex("ArrowRight", 0, 0)).toBeNull();
    expect(nextRadioIndex("Home", 0, 0)).toBeNull();
  });
});
