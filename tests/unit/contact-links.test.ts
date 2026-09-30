import { describe, expect, it } from "vitest";
import { orderWhatsappText, telLink, whatsappLink } from "@/lib/contact-links";

describe("contact links", () => {
  it("builds tel and wa.me links for Indian mobiles", () => {
    expect(telLink("9876543210")).toBe("tel:+919876543210");
    const text = orderWhatsappText({ number: "ORD-1001", name: "Asha Rao", brand: "Shop" });
    expect(text).toBe("Hi Asha, this is Shop about your order ORD-1001.");
    expect(whatsappLink("9876543210", text)).toBe("https://wa.me/919876543210?text=Hi%20Asha%2C%20this%20is%20Shop%20about%20your%20order%20ORD-1001.");
  });
});
