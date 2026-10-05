import { describe, expect, it } from "vitest";
import { ageLabel, groupPrintQueue } from "@/lib/print-queue";
import { printHoldWhatsappText } from "@/lib/contact-links";

describe("print queue helpers", () => {
  it("groups by colour and size in first-seen order and sums units", () => {
    const items = [
      { id: "a", colorName: "Black", size: "M", quantity: 1 },
      { id: "b", colorName: "White", size: "L", quantity: 2 },
      { id: "c", colorName: "Black", size: "M", quantity: 3 },
    ];
    expect(groupPrintQueue(items).map((g) => [g.key, g.units, g.items.map((i) => i.id)])).toEqual([
      ["Black / M", 4, ["a", "c"]],
      ["White / L", 2, ["b"]],
    ]);
  });

  it("describes how long ago an item was paid", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(ageLabel(null, now)).toBe("—");
    expect(ageLabel(new Date("2026-10-05T11:30:00Z"), now)).toBe("<1h");
    expect(ageLabel(new Date("2026-10-05T07:00:00Z"), now)).toBe("5h");
    expect(ageLabel(new Date("2026-10-02T11:00:00Z"), now)).toBe("3d");
  });

  it("writes a polite hold message", () => {
    expect(printHoldWhatsappText({ number: "ORD-1001", name: "Asha Rao", brand: "Thrift" })).toBe(
      "Hi Asha, this is Thrift about your custom tee in order ORD-1001. We need to check something about your artwork before printing.",
    );
  });
});
