import { describe, expect, it } from "vitest";
import {
  abandonedCartEmail, adminNewOrderEmail, dailySummaryEmail, lowStockDigestEmail, orderConfirmationEmail, orderShippedEmail,
} from "@/server/emails/templates";
import type { OrderView } from "@/server/services/order-records";

function sampleOrder(over: Partial<OrderView> = {}): OrderView {
  const now = new Date("2026-10-01T10:00:00Z");
  return {
    id: "o1", number: "ORD-1001", status: "PAID", userId: "u1", email: "buyer@example.test", createdAt: now, expiresAt: now,
    paidAt: now, processingAt: null, shippedAt: null, deliveredAt: null, cancelledAt: null, refundedAt: null,
    subtotalPaise: 119800, discountPaise: 19900, shippingPaise: 0, totalPaise: 99900, couponCode: null, offerLabel: "Any 2 for ₹999",
    paymentProvider: "mock", providerOrderId: "mock_order_1", providerPaymentId: "mock_pay_1",
    carrier: null, trackingNumber: null, trackingUrl: null, customerNote: "<b>ring twice</b>",
    ship: { name: "Asha <script>alert(1)</script> Rao", phone: "9876543210", line1: "12 MG Road", line2: null, landmark: null, city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    items: [{ id: "i1", productId: "p1", productName: "Tee & <Co>", productSlug: "tee", size: "M", colorName: "Black", imageUrl: null, sku: "SKU-1", unitPricePaise: 59900, quantity: 2, lineTotalPaise: 119800,
      designId: null, designFrontPreviewUrl: null, designBackPreviewUrl: null, printFrontUrl: null, printBackUrl: null, printedAt: null, heldAt: null, holdNote: null }],
    itemCount: 2, invoiceSnapshot: null,
    ...over,
  };
}

describe("order emails", () => {
  it("escapes customer-controlled text in the confirmation", () => {
    const m = orderConfirmationEmail(sampleOrder());
    expect(m.subject).toBe("Order ORD-1001 confirmed");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("Asha &lt;script&gt;");
    expect(m.html).toContain("Tee &amp; &lt;Co&gt;");
    expect(m.html).toContain("₹999");
    expect(m.html).toContain("/account/orders/ORD-1001");
    expect(m.text).toContain("ORD-1001");
  });

  it("gives the admin a link to the order and the escaped note", () => {
    const m = adminNewOrderEmail(sampleOrder());
    expect(m.subject).toBe("New order ORD-1001 · ₹999");
    expect(m.html).toContain("/admin/orders/o1");
    expect(m.html).toContain("&lt;b&gt;ring twice&lt;/b&gt;");
  });

  it("links tracking only for http(s) URLs", () => {
    const ok = orderShippedEmail(sampleOrder({ status: "SHIPPED", carrier: "Delhivery", trackingNumber: "AWB123", trackingUrl: "https://www.delhivery.com/track/package/AWB123" }));
    expect(ok.subject).toBe("Order ORD-1001 has shipped");
    expect(ok.html).toContain('href="https://www.delhivery.com/track/package/AWB123"');
    const bad = orderShippedEmail(sampleOrder({ status: "SHIPPED", carrier: "Other", trackingNumber: "X1", trackingUrl: "javascript:alert(1)" }));
    expect(bad.html).not.toContain("javascript:");
    expect(bad.html).toContain("X1");
  });
});

describe("operations emails", () => {
  it("summarises low stock, the day, and abandoned bags", () => {
    const low = lowStockDigestEmail([{ productName: "Tee <1>", size: "M", colorName: "Black", sku: "S1", stock: 2 }], 5);
    expect(low.subject).toBe("Low stock: 1 variant at or below 5");
    expect(low.html).toContain("Tee &lt;1&gt;");
    const day = dailySummaryEmail({ dateLabel: "1 Oct 2026", paidOrders: 3, revenuePaise: 299700, toShip: 2, needsAttention: 1, lowStock: 4 });
    expect(day.subject).toContain("1 Oct 2026");
    expect(day.html).toContain("₹2,997");
    const cart = abandonedCartEmail({ name: "Ravi", items: [{ name: "Tee", size: "L", colorName: "White" }] });
    expect(cart.subject).toBe("You left something in your bag");
    expect(cart.html).toContain("/cart");
    expect(`${low.subject}${day.subject}${cart.subject}`).not.toMatch(/[\r\n]/);
  });
});
