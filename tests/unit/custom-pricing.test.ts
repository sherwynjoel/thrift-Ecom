import { describe, expect, it } from "vitest";
import {
  customFeePaise, customFeesOf, customPrintLabel, customUnitPricePaise, designSides, isCustomItem, NO_CUSTOM_FEES, printSidesOf,
} from "@/lib/custom-pricing";
import { priceCart, type PricingContext, type PricingOffer } from "@/lib/pricing";

const fees = { frontPaise: 0, backPaise: 14900 };

describe("custom print fees", () => {
  it("adds the fee of each printed side", () => {
    expect(customFeePaise({ front: true, back: false }, fees)).toBe(0);
    expect(customFeePaise({ front: true, back: true }, fees)).toBe(14900);
    expect(customFeePaise({ front: false, back: true }, { frontPaise: 5000, backPaise: 14900 })).toBe(14900);
    expect(customFeePaise({ front: true, back: true }, { frontPaise: 5000, backPaise: 14900 })).toBe(19900);
    expect(customFeePaise({ front: true, back: true }, NO_CUSTOM_FEES)).toBe(0);
  });

  it("prices plain lines at the variant price and custom lines with fees", () => {
    expect(customUnitPricePaise(54900, null, fees)).toBe(54900);
    expect(customUnitPricePaise(54900, { front: true, back: true }, fees)).toBe(69800);
  });

  it("derives sides from print keys or print urls", () => {
    expect(designSides({ frontPrintKey: "k", backPrintKey: null })).toEqual({ front: true, back: false });
    expect(printSidesOf({ printFrontUrl: null, printBackUrl: "/b.png" })).toEqual({ front: false, back: true });
    expect(printSidesOf({ printFrontUrl: null, printBackUrl: null })).toBeNull();
    expect(isCustomItem({ printFrontUrl: "/f.png", printBackUrl: null })).toBe(true);
    expect(isCustomItem({ printFrontUrl: null, printBackUrl: null })).toBe(false);
    expect(customFeesOf({ customFrontFeePaise: 1, customBackFeePaise: 2 })).toEqual({ frontPaise: 1, backPaise: 2 });
  });

  it("labels the printed sides", () => {
    expect(customPrintLabel({ front: true, back: true })).toBe("Custom print: front + back");
    expect(customPrintLabel({ front: true, back: false })).toBe("Custom print: front");
    expect(customPrintLabel({ front: false, back: true })).toBe("Custom print: back");
    expect(customPrintLabel({ front: false, back: false })).toBeNull();
    expect(customPrintLabel(null)).toBeNull();
  });
});

describe("pricing engine with custom lines", () => {
  const settings = { shippingFeePaise: 7900, freeShippingThresholdPaise: 99900 };
  const now = new Date("2026-10-01T10:00:00Z");
  const ctx = (offers: PricingOffer[]): PricingContext => ({ offers, coupon: null, settings, now });
  const offer = (over: Partial<PricingOffer> = {}): PricingOffer => ({
    id: "o", label: "Any 2 for ₹999", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900, percent: null,
    collectionId: null, active: true, startsAt: null, endsAt: null, ...over,
  });
  const plain = { unitPricePaise: 59900, quantity: 1, collectionIds: [] };
  const custom = { unitPricePaise: 69800, quantity: 1, collectionIds: [], custom: true };

  it("leaves custom lines out of offers by default", () => {
    expect(priceCart([plain, custom], ctx([offer()]))).toMatchObject({ subtotalPaise: 129700, offer: null, discountPaise: 0, shippingPaise: 0, totalPaise: 129700 });
  });

  it("counts custom lines when the offer includes them", () => {
    // 59900 + 69800 = 129700 → 99900, saving 29800; 99900 still reaches the free-shipping threshold
    expect(priceCart([plain, custom], ctx([offer({ includeCustom: true })]))).toMatchObject({ applied: "offer", discountPaise: 29800, shippingPaise: 0, totalPaise: 99900 });
  });

  it("treats custom lines like any other line for shipping and subtotal", () => {
    expect(priceCart([{ ...custom, unitPricePaise: 54900 }], ctx([]))).toMatchObject({ subtotalPaise: 54900, shippingPaise: 7900, totalPaise: 62800 });
  });
});
