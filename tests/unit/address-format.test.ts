import { describe, expect, it } from "vitest";
import { addressLines, addressText, formatPhone } from "@/lib/address-format";

const a = { line1: "12 MG Road", line2: "Indiranagar", landmark: "near Metro Pillar 40", city: "Bengaluru", state: "Karnataka", pincode: "560001" };

describe("address formatting", () => {
  it("builds printable lines and skips blanks", () => {
    expect(addressLines(a)).toEqual(["12 MG Road", "Indiranagar", "Near Metro Pillar 40", "Bengaluru, Karnataka 560001"]);
    expect(addressLines({ ...a, line2: null, landmark: null })).toEqual(["12 MG Road", "Bengaluru, Karnataka 560001"]);
  });

  it("formats phones and whole blocks", () => {
    expect(formatPhone("9876543210")).toBe("98765 43210");
    expect(addressText("Asha Rao", "9876543210", { ...a, line2: null, landmark: null })).toBe(
      "Asha Rao\n12 MG Road\nBengaluru, Karnataka 560001\nPhone: 98765 43210",
    );
  });
});
