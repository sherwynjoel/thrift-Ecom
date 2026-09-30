import { describe, expect, it } from "vitest";
import { COUPON_UNAVAILABLE, discountLabel, payTotalChanged, priceCart, type PricingContext, type PricingCoupon, type PricingOffer } from "@/lib/pricing";

const settings = { shippingFeePaise: 7900, freeShippingThresholdPaise: 99900 };
const now = new Date("2026-10-01T10:00:00Z");
const line = (unitPricePaise: number, quantity = 1, collectionIds: string[] = []) => ({ unitPricePaise, quantity, collectionIds });
const ctx = (over: Partial<PricingContext> = {}): PricingContext => ({ offers: [], coupon: null, settings, now, couponUsesTotal: 0, couponUsesByUser: 0, ...over });
const coupon = (over: Partial<PricingCoupon> = {}): PricingCoupon => ({
  code: "SAVE", type: "FLAT", value: 10000, minSubtotalPaise: 0, maxDiscountPaise: null,
  startsAt: null, endsAt: null, usageLimit: null, perUserLimit: null, active: true, ...over,
});
const offer = (over: Partial<PricingOffer> = {}): PricingOffer => ({
  id: "o1", label: "Any 3 for ₹999", type: "BUNDLE_PRICE", minQty: 3, pricePaise: 99900, percent: null,
  collectionId: null, active: true, startsAt: null, endsAt: null, ...over,
});

describe("priceCart basics and shipping", () => {
  it("prices an empty cart at zero with no shipping", () => {
    expect(priceCart([], ctx())).toEqual({ subtotalPaise: 0, offer: null, coupon: null, applied: null, discountPaise: 0, shippingPaise: 0, totalPaise: 0 });
  });

  it("adds flat shipping below the threshold", () => {
    expect(priceCart([line(59900)], ctx())).toMatchObject({ subtotalPaise: 59900, shippingPaise: 7900, totalPaise: 67800 });
  });

  it("makes shipping free exactly at the threshold", () => {
    expect(priceCart([line(99900)], ctx())).toMatchObject({ shippingPaise: 0, totalPaise: 99900 });
    expect(priceCart([line(99899)], ctx())).toMatchObject({ shippingPaise: 7900, totalPaise: 107799 });
  });

  it("checks the threshold against the discounted subtotal", () => {
    const r = priceCart([line(54900, 2)], ctx({ coupon: coupon({ value: 20000 }) }));
    expect(r).toMatchObject({ subtotalPaise: 109800, applied: "coupon", discountPaise: 20000, shippingPaise: 7900, totalPaise: 97700 });
  });
});

describe("coupons", () => {
  it("rounds percent discounts down to whole paise", () => {
    const r = priceCart([line(33333, 3)], ctx({ coupon: coupon({ type: "PERCENT", value: 10 }) }));
    expect(r).toMatchObject({ subtotalPaise: 99999, discountPaise: 9999, shippingPaise: 7900, totalPaise: 97900 });
  });

  it("caps percent discounts at maxDiscountPaise", () => {
    const r = priceCart([line(100000, 2)], ctx({ coupon: coupon({ type: "PERCENT", value: 50, maxDiscountPaise: 15000 }) }));
    expect(r).toMatchObject({ discountPaise: 15000, shippingPaise: 0, totalPaise: 185000 });
  });

  it("never discounts more than the subtotal and never goes negative", () => {
    const r = priceCart([line(59900)], ctx({ coupon: coupon({ value: 100000 }) }));
    expect(r).toMatchObject({ discountPaise: 59900, shippingPaise: 7900, totalPaise: 7900 });
  });

  it("explains a minimum subtotal shortfall", () => {
    const r = priceCart([line(59900)], ctx({ coupon: coupon({ minSubtotalPaise: 100000 }) }));
    expect(r.couponError).toBe("Add ₹401 more to use this code");
    expect(r).toMatchObject({ coupon: null, applied: null, discountPaise: 0 });
  });

  it("respects the date window inclusively", () => {
    const early = priceCart([line(59900)], ctx({ coupon: coupon({ startsAt: new Date("2026-10-02T00:00:00Z") }) }));
    expect(early.couponError).toBe(COUPON_UNAVAILABLE);
    const late = priceCart([line(59900)], ctx({ coupon: coupon({ endsAt: new Date("2026-09-30T00:00:00Z") }) }));
    expect(late.couponError).toBe(COUPON_UNAVAILABLE);
    const edge = priceCart([line(59900)], ctx({ coupon: coupon({ startsAt: now, endsAt: now }) }));
    expect(edge.couponError).toBeUndefined();
    expect(edge.applied).toBe("coupon");
  });

  it("rejects inactive codes and exhausted usage", () => {
    expect(priceCart([line(59900)], ctx({ coupon: coupon({ active: false }) })).couponError).toBe(COUPON_UNAVAILABLE);
    expect(priceCart([line(59900)], ctx({ coupon: coupon({ usageLimit: 5 }), couponUsesTotal: 5 })).couponError).toBe(COUPON_UNAVAILABLE);
    expect(priceCart([line(59900)], ctx({ coupon: coupon({ usageLimit: 5 }), couponUsesTotal: 4 })).couponError).toBeUndefined();
    expect(priceCart([line(59900)], ctx({ coupon: coupon({ perUserLimit: 1 }), couponUsesByUser: 1 })).couponError).toBe(COUPON_UNAVAILABLE);
    // The min-subtotal hint is only given for codes that would otherwise apply (it reveals the code exists).
    expect(priceCart([line(100)], ctx({ coupon: coupon({ active: false, minSubtotalPaise: 99900 }) })).couponError).toBe(COUPON_UNAVAILABLE);
  });
});

describe("offers", () => {
  it("groups the cheapest eligible units first", () => {
    const r = priceCart([line(59900, 2), line(49900, 2)], ctx({ offers: [offer()] }));
    // cheapest three: 49900 + 49900 + 59900 = 159700 → 99900, saving 59800; the 4th unit pays full price
    expect(r).toMatchObject({ subtotalPaise: 219600, offer: { label: "Any 3 for ₹999", discountPaise: 59800 }, applied: "offer", discountPaise: 59800, shippingPaise: 0, totalPaise: 159800 });
  });

  it("repeats bundle groups", () => {
    const r = priceCart([line(59900, 6)], ctx({ offers: [offer()] }));
    expect(r).toMatchObject({ discountPaise: 159600, totalPaise: 199800 });
  });

  it("never makes a group cost more than its normal price", () => {
    const r = priceCart([line(29900, 3)], ctx({ offers: [offer()] }));
    expect(r).toMatchObject({ offer: null, applied: null, discountPaise: 0, totalPaise: 97600 });
  });

  it("only counts units from the offer's collection", () => {
    const lines = [line(59900, 2, ["c1"]), line(59900, 1, ["c2"])];
    expect(priceCart(lines, ctx({ offers: [offer({ collectionId: "c1", minQty: 2 })] })).discountPaise).toBe(19900);
    expect(priceCart(lines, ctx({ offers: [offer({ collectionId: "c1", minQty: 3 })] })).offer).toBeNull();
  });

  it("applies quantity percent offers at the minimum quantity", () => {
    const pct = offer({ type: "QTY_PERCENT", percent: 10, pricePaise: null, label: "10% off 3+" });
    expect(priceCart([line(33333, 3)], ctx({ offers: [pct] })).discountPaise).toBe(9999);
    expect(priceCart([line(33333, 2)], ctx({ offers: [pct] })).offer).toBeNull();
  });

  it("picks the best live offer and ignores inactive or out-of-window ones", () => {
    const offers = [
      offer({ id: "a", label: "A", type: "QTY_PERCENT", percent: 10, pricePaise: null, minQty: 2 }),
      offer({ id: "b", label: "B", minQty: 2, pricePaise: 99900 }),
      offer({ id: "c", label: "C", minQty: 2, pricePaise: 1000, active: false }),
      offer({ id: "d", label: "D", minQty: 2, pricePaise: 1000, endsAt: new Date("2026-09-01T00:00:00Z") }),
      offer({ id: "e", label: "E", minQty: 2, pricePaise: 1000, startsAt: new Date("2026-11-01T00:00:00Z") }),
    ];
    expect(priceCart([line(59900, 2)], ctx({ offers })).offer).toEqual({ label: "B", discountPaise: 19900 });
  });
});

describe("offer versus coupon", () => {
  const lines = [line(59900, 2), line(49900, 2)];

  it("applies the offer when it saves more, but still reports the coupon", () => {
    const r = priceCart(lines, ctx({ offers: [offer()], coupon: coupon() }));
    expect(r).toMatchObject({ applied: "offer", discountPaise: 59800, coupon: { code: "SAVE", discountPaise: 10000 } });
    expect(discountLabel(r)).toBe("Offer: Any 3 for ₹999");
  });

  it("applies the coupon when it saves more", () => {
    const r = priceCart(lines, ctx({ offers: [offer()], coupon: coupon({ type: "PERCENT", value: 50 }) }));
    expect(r).toMatchObject({ applied: "coupon", discountPaise: 109800, shippingPaise: 0, totalPaise: 109800 });
    expect(discountLabel(r)).toBe("Code SAVE");
  });

  it("gives a tie to the offer", () => {
    const r = priceCart([line(59900, 2)], ctx({ offers: [offer({ minQty: 2 })], coupon: coupon({ value: 19900 }) }));
    expect(r.applied).toBe("offer");
    expect(discountLabel(priceCart([line(59900)], ctx()))).toBeNull();
  });
});

describe("payTotalChanged (M7)", () => {
  it("requires a second tap only when the server total differs from what the shopper saw", () => {
    expect(payTotalChanged(59900, 59900, null)).toBe(false);
    expect(payTotalChanged(67800, 59900, null)).toBe(true);
    // Already told about 67800 (the summary may not have refreshed): the second tap goes through.
    expect(payTotalChanged(67800, 59900, 67800)).toBe(false);
    // It changed yet again: tell them again.
    expect(payTotalChanged(70000, 59900, 67800)).toBe(true);
  });
});
