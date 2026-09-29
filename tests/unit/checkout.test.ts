import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { placeOrder } from "@/server/services/orders";
import { MOCK_SECRET, MockProvider } from "@/server/payments/mock";
import { hmacSha256Hex } from "@/server/payments/hmac";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { confirmClientPayment, getCheckoutView, handleRazorpayWebhook, previewCartPricing } from "@/server/services/checkout";

const ADDRESS = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };
const mock = new MockProvider();

async function placed(qty = 1) {
  const user = await createUser();
  const product = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
  const address = await createAddress(user.id, ADDRESS);
  await addItem({ userId: user.id }, product.variants[0].id, qty);
  const payload = await placeOrder(user.id, { addressId: address.id });
  return { user, product, address, payload };
}

function signed(body: unknown) {
  const raw = JSON.stringify(body);
  return { raw, sig: hmacSha256Hex(MOCK_SECRET, raw) };
}

const captured = (providerOrderId: string, paymentId: string, amount: number) => ({
  event: "payment.captured",
  payload: { payment: { entity: { id: paymentId, order_id: providerOrderId, amount, status: "captured" } } },
});

describe("checkout view and preview", () => {
  beforeEach(resetDb);

  it("returns lines, addresses and a server price, and reports stock it adjusted", async () => {
    const user = await createUser();
    const p = await createProduct({ basePricePaise: 59900, variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    await createAddress(user.id, ADDRESS);
    await addItem({ userId: user.id }, p.variants[0].id, 3);
    await db.productVariant.update({ where: { id: p.variants[0].id }, data: { stock: 2 } });
    const view = await getCheckoutView(user.id);
    expect(view.stockIssues).toEqual([expect.objectContaining({ requested: 3, available: 2 })]);
    expect(view.lines).toEqual([expect.objectContaining({ quantity: 2, unitPricePaise: 59900, lineTotalPaise: 119800, size: "M" })]);
    expect(view.addresses).toHaveLength(1);
    expect(view.price).toMatchObject({ subtotalPaise: 119800, shippingPaise: 0, totalPaise: 119800 });
  });

  it("counts stock held by the user's own open order as theirs when they return to checkout", async () => {
    const user = await createUser();
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 1 }] });
    const address = await createAddress(user.id, ADDRESS);
    await addItem({ userId: user.id }, p.variants[0].id, 1);
    await placeOrder(user.id, { addressId: address.id });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: p.variants[0].id } })).stock).toBe(0);

    const view = await getCheckoutView(user.id);
    expect(view.stockIssues).toEqual([]);
    expect(view.lines).toEqual([expect.objectContaining({ variantId: p.variants[0].id, quantity: 1 })]);
    expect(await db.cartItem.count({ where: { cart: { userId: user.id } } })).toBe(1);

    // Someone else's reservation is still a real sell-out for a different shopper.
    const other = await createUser();
    await addItem({ userId: other.id }, p.variants[0].id, 1).catch(() => undefined);
    const otherView = await getCheckoutView(other.id);
    expect(otherView.lines).toHaveLength(0);
  });

  it("previews offers for any cart, including guests", async () => {
    const p = await createProduct({ basePricePaise: 59900, variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    await db.offer.create({ data: { label: "Any 2 for ₹999", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900 } });
    await addItem({ guestToken: "guest-1" }, p.variants[0].id, 2);
    expect(await previewCartPricing({ guestToken: "guest-1" })).toMatchObject({ offerLabel: "Any 2 for ₹999", discountPaise: 19900, discountedSubtotalPaise: 99900, shippingPaise: 0, totalPaise: 99900 });
    expect((await previewCartPricing({ guestToken: "nobody" })).totalPaise).toBe(0);
  });
});

describe("client payment confirmation", () => {
  beforeEach(resetDb);

  it("marks the order paid with a valid signature", async () => {
    const { user, payload } = await placed();
    const r = await confirmClientPayment(user.id, { orderId: payload.orderId, providerOrderId: payload.providerOrderId, paymentId: "mock_pay_1", signature: mock.sign(payload.providerOrderId, "mock_pay_1") });
    expect(r).toEqual({ outcome: "paid", number: payload.number });
  });

  it("rejects bad signatures, foreign orders and mismatched provider orders", async () => {
    const { user, payload } = await placed();
    const base = { orderId: payload.orderId, providerOrderId: payload.providerOrderId, paymentId: "mock_pay_1" };
    await expect(confirmClientPayment(user.id, { ...base, signature: "deadbeef" })).rejects.toBeInstanceOf(ForbiddenError);
    const o = await db.order.findUniqueOrThrow({ where: { id: payload.orderId }, include: { events: true } });
    expect(o.status).toBe("PENDING_PAYMENT");
    expect(o.events.map((e) => e.type)).toContain("PAYMENT_FAILED");
    const stranger = await createUser();
    await expect(confirmClientPayment(stranger.id, { ...base, signature: mock.sign(payload.providerOrderId, "mock_pay_1") })).rejects.toBeInstanceOf(NotFoundError);
    await expect(confirmClientPayment(user.id, { ...base, providerOrderId: "mock_order_other", signature: mock.sign("mock_order_other", "mock_pay_1") })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("Razorpay webhook handling", () => {
  beforeEach(resetDb);

  it("rejects bad signatures", async () => {
    const { raw } = signed({ event: "payment.captured" });
    expect(await handleRazorpayWebhook(raw, "nope")).toEqual({ status: 400, handled: "bad-signature" });
    expect(await handleRazorpayWebhook(raw, null)).toEqual({ status: 400, handled: "bad-signature" });
  });

  it("marks paid on payment.captured, idempotently", async () => {
    const { payload } = await placed();
    const { raw, sig } = signed(captured(payload.providerOrderId, "pay_wh_1", payload.amountPaise));
    expect(await handleRazorpayWebhook(raw, sig)).toEqual({ status: 200, handled: "paid" });
    expect(await handleRazorpayWebhook(raw, sig)).toEqual({ status: 200, handled: "already_paid" });
    expect((await db.order.findUniqueOrThrow({ where: { id: payload.orderId } })).providerPaymentId).toBe("pay_wh_1");
  });

  it("flags order.paid with the wrong amount", async () => {
    const { payload } = await placed();
    const body = { event: "order.paid", payload: { order: { entity: { id: payload.providerOrderId, amount_paid: 100 } }, payment: { entity: { id: "pay_x", order_id: payload.providerOrderId, amount: 100 } } } };
    const { raw, sig } = signed(body);
    expect(await handleRazorpayWebhook(raw, sig)).toEqual({ status: 200, handled: "amount_mismatch" });
  });

  it("acknowledges unknown orders and records failures", async () => {
    const unknown = signed(captured("order_unknown", "pay_1", 100));
    expect(await handleRazorpayWebhook(unknown.raw, unknown.sig)).toEqual({ status: 200, handled: "unknown-order" });
    const { payload } = await placed();
    const failed = signed({ event: "payment.failed", payload: { payment: { entity: { id: "pay_f", order_id: payload.providerOrderId, error_description: "Card declined" } } } });
    expect(await handleRazorpayWebhook(failed.raw, failed.sig)).toEqual({ status: 200, handled: "payment-failed" });
    const events = await db.orderEvent.findMany({ where: { orderId: payload.orderId, type: "PAYMENT_FAILED" } });
    expect(events[0].message).toContain("Card declined");
  });
});
