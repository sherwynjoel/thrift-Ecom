import { describe, expect, it } from "vitest";
import { analyticsIds, toGa4, toMetaPixel, type AnalyticsEvent } from "@/lib/analytics";

const item = { id: "p1", name: "Alpha Tee", pricePaise: 59900, quantity: 2, variant: "Black / M" };

describe("analytics mapping", () => {
  it("accepts only well-formed ids", () => {
    expect(analyticsIds({ ga: " G-ABC123XYZ ", pixel: "123456789012345" })).toEqual({ ga: "G-ABC123XYZ", pixel: "123456789012345" });
    expect(analyticsIds({ ga: "G-abc');alert(1)//", pixel: "12ab" })).toEqual({ ga: null, pixel: null });
    expect(analyticsIds({})).toEqual({ ga: null, pixel: null });
  });

  it("maps to GA4 ecommerce events in rupees", () => {
    expect(toGa4({ name: "add_to_cart", item })).toEqual(["add_to_cart", {
      currency: "INR", value: 1198, items: [{ item_id: "p1", item_name: "Alpha Tee", price: 599, quantity: 2, item_variant: "Black / M" }],
    }]);
    const purchase: AnalyticsEvent = { name: "purchase", transactionId: "ORD-1001", valuePaise: 127700, shippingPaise: 7900, items: [item] };
    expect(toGa4(purchase)[1]).toMatchObject({ transaction_id: "ORD-1001", value: 1277, shipping: 79, currency: "INR" });
  });

  it("maps to Meta Pixel standard events", () => {
    expect(toMetaPixel({ name: "view_item", item: { ...item, quantity: 1 } })).toEqual(["ViewContent", {
      currency: "INR", value: 599, content_type: "product", content_ids: ["p1"], contents: [{ id: "p1", quantity: 1 }], content_name: "Alpha Tee",
    }]);
    expect(toMetaPixel({ name: "begin_checkout", valuePaise: 119800, items: [item] })).toEqual(["InitiateCheckout", {
      currency: "INR", value: 1198, content_type: "product", content_ids: ["p1"], contents: [{ id: "p1", quantity: 2 }], num_items: 2,
    }]);
    expect(toMetaPixel({ name: "purchase", transactionId: "ORD-1", valuePaise: 100, items: [item] })[0]).toBe("Purchase");
  });
});
