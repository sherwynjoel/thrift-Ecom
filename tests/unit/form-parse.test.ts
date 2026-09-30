import { describe, expect, it } from "vitest";
import { fromDateTimeLocal, parseIntField, parseRupeesField, toDateTimeLocal } from "@/lib/form-parse";
import { promoState } from "@/lib/promotion-labels";

describe("admin form parsers", () => {
  it("parses rupees and whole numbers, telling blank from invalid", () => {
    expect(parseRupeesField("99.5", { optional: false })).toBe(9950);
    expect(parseRupeesField("", { optional: true })).toBeNull();
    expect(parseRupeesField("", { optional: false })).toBeUndefined();
    expect(parseRupeesField("abc", { optional: true })).toBeUndefined();
    expect(parseIntField(" 12 ", { optional: false })).toBe(12);
    expect(parseIntField("", { optional: true })).toBeNull();
    expect(parseIntField("1.5", { optional: true })).toBeUndefined();
    expect(parseIntField("-3", { optional: true })).toBeUndefined();
  });

  it("round-trips datetime-local values in the local zone", () => {
    const d = new Date(2026, 9, 1, 9, 5);
    expect(toDateTimeLocal(d)).toBe("2026-10-01T09:05");
    expect(fromDateTimeLocal("2026-10-01T09:05")).toBe(d.toISOString());
    expect(fromDateTimeLocal("")).toBeNull();
    expect(toDateTimeLocal(null)).toBe("");
  });
});

describe("promoState", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  it("reports inactive, scheduled, ended and active", () => {
    expect(promoState({ active: false, startsAt: null, endsAt: null }, now)).toBe("Inactive");
    expect(promoState({ active: true, startsAt: new Date("2026-10-11T00:00:00Z"), endsAt: null }, now)).toBe("Scheduled");
    expect(promoState({ active: true, startsAt: null, endsAt: new Date("2026-10-09T00:00:00Z") }, now)).toBe("Ended");
    expect(promoState({ active: true, startsAt: null, endsAt: null }, now)).toBe("Active");
  });
});
