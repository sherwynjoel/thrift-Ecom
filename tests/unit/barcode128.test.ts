import { describe, expect, it } from "vitest";
import { code128Bars, code128BValues, code128Widths, CODE128_PATTERNS, CODE128_STOP } from "@/lib/barcode128";

describe("Code 128-B encoder", () => {
  it("has 106 distinct 11-module symbols and a 13-module stop", () => {
    expect(CODE128_PATTERNS).toHaveLength(106);
    expect(new Set(CODE128_PATTERNS).size).toBe(106);
    for (const p of CODE128_PATTERNS) expect([...p].reduce((s, d) => s + Number(d), 0)).toBe(11);
    expect([...CODE128_STOP].reduce((s, d) => s + Number(d), 0)).toBe(13);
  });

  it("computes the mod-103 checksum", () => {
    // Start B = 104; "A" = 33, "B" = 34; (104 + 33×1 + 34×2) mod 103 = 205 mod 103 = 102
    expect(code128BValues("AB")).toEqual([104, 33, 34, 102]);
  });

  it("emits start, data, checksum and stop widths", () => {
    expect(code128Widths("AB")).toBe("211214" + "111323" + "131123" + "411131" + "2331112");
    const { bars, modules } = code128Bars("AB");
    expect(modules).toBe(57);
    expect(bars).toHaveLength(16);
    expect(bars[0]).toEqual({ x: 0, width: 2 });
    const last = bars[bars.length - 1];
    expect(last.x + last.width).toBe(57);
  });

  it("encodes order numbers and rejects what Code 128-B cannot carry", () => {
    expect(code128Bars("ORD-1001").modules).toBe((8 + 2) * 11 + 13);
    expect(() => code128BValues("")).toThrow();
    expect(() => code128BValues("₹100")).toThrow(/cannot encode/);
  });
});
