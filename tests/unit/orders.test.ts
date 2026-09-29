import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { MockProvider } from "@/server/payments/mock";
import { ConflictError, NotFoundError, PaymentError, StockChangedError, ValidationError } from "@/server/errors";
import {
  cancelOrder, expireStaleOrders, getOrderForUser, getRetryPayload, listOrdersForUser, markOrderPaid, ORDER_TTL_MS, placeOrder,
} from "@/server/services/orders";

const ADDRESS = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };

async function buyer(opts: { stock?: number; qty?: number; price?: number } = {}) {
  const user = await createUser();
  const product = await createProduct({ basePricePaise: opts.price ?? 59900, variants: [{ size: "M", colorName: "Black", stock: opts.stock ?? 5 }] });
  const variant = product.variants[0];
  const address = await createAddress(user.id, ADDRESS);
  await addItem({ userId: user.id }, variant.id, opts.qty ?? 1);
  return { user, product, variant, address };
}
const stockOf = async (id: string) => (await db.productVariant.findUniqueOrThrow({ where: { id } })).stock;
const later = () => new Date(Date.now() + ORDER_TTL_MS + 1000);

describe("placeOrder", () => {
  beforeEach(resetDb);

  it("reserves stock, snapshots items and prices, and numbers orders from ORD-1001", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const payload = await placeOrder(user.id, { addressId: address.id, customerNote: " Gift wrap please " });
    expect(payload).toMatchObject({ number: "ORD-1001", amountPaise: 119800, currency: "INR", provider: "mock", keyId: null, prefill: { name: "Asha Rao", contact: "9876543210", email: user.email } });
    expect(payload.providerOrderId).toMatch(/^mock_order_/);
    expect(await stockOf(variant.id)).toBe(3);
    const order = await db.order.findUniqueOrThrow({ where: { id: payload.orderId }, include: { items: true, events: true } });
    expect(order).toMatchObject({ status: "PENDING_PAYMENT", subtotalPaise: 119800, shippingPaise: 0, totalPaise: 119800, shipCity: "Bengaluru", customerNote: "Gift wrap please", providerOrderId: payload.providerOrderId, paymentProvider: "mock" });
    expect(order.items[0]).toMatchObject({ variantId: variant.id, sku: variant.sku, size: "M", colorName: "Black", unitPricePaise: 59900, quantity: 2, lineTotalPaise: 119800 });
    expect(order.events.map((e) => e.type)).toEqual(["CREATED"]);
    expect(order.expiresAt.getTime() - order.createdAt.getTime()).toBeGreaterThanOrEqual(ORDER_TTL_MS - 5000);
    expect(await db.cartItem.count({ where: { cart: { userId: user.id } } })).toBe(1);
    const second = await buyer();
    expect((await placeOrder(second.user.id, { addressId: second.address.id })).number).toBe("ORD-1002");
  });

  it("adds shipping below the threshold and applies a coupon", async () => {
    const { user, address } = await buyer();
    await db.coupon.create({ data: { code: "TENOFF", type: "FLAT", value: 1000 } });
    const p = await placeOrder(user.id, { addressId: address.id, couponCode: "tenoff" });
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId } });
    expect(o).toMatchObject({ subtotalPaise: 59900, discountPaise: 1000, shippingPaise: 7900, totalPaise: 66800, couponCode: "TENOFF", offerLabel: null });
  });

  it("rejects bad coupons, foreign addresses and empty bags without creating orders", async () => {
    const { user, address } = await buyer();
    const bad = await placeOrder(user.id, { addressId: address.id, couponCode: "NOPE" }).catch((e) => e);
    expect(bad).toBeInstanceOf(ValidationError);
    expect(bad.details.couponCode).toEqual(["This code is not valid"]);
    const other = await buyer();
    await expect(placeOrder(user.id, { addressId: other.address.id })).rejects.toBeInstanceOf(ValidationError);
    const lonely = await createUser();
    const addr = await createAddress(lonely.id, ADDRESS);
    await expect(placeOrder(lonely.id, { addressId: addr.id })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.order.count()).toBe(0);
  });

  it("adjusts the bag and refuses when stock ran short", async () => {
    const { user, variant, address } = await buyer({ qty: 3 });
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 1 } });
    const err = await placeOrder(user.id, { addressId: address.id }).catch((e) => e);
    expect(err).toBeInstanceOf(StockChangedError);
    expect(err.issues).toEqual([expect.objectContaining({ variantId: variant.id, requested: 3, available: 1 })]);
    expect((await db.cartItem.findFirstOrThrow({ where: { variantId: variant.id } })).quantity).toBe(1);
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 0 } });
    await expect(placeOrder(user.id, { addressId: address.id })).rejects.toBeInstanceOf(StockChangedError);
    expect(await db.cartItem.count()).toBe(0);
    expect(await db.order.count()).toBe(0);
  });

  it("cancels the order and releases stock when the provider fails", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const spy = vi.spyOn(MockProvider.prototype, "createOrder").mockRejectedValueOnce(new Error("provider down"));
    await expect(placeOrder(user.id, { addressId: address.id })).rejects.toBeInstanceOf(PaymentError);
    spy.mockRestore();
    const o = await db.order.findFirstOrThrow({ include: { events: true } });
    expect(o.status).toBe("CANCELLED");
    expect(o.events.map((e) => e.type)).toContain("PAYMENT_FAILED");
    expect(await stockOf(variant.id)).toBe(5);
  });
});

describe("markOrderPaid", () => {
  beforeEach(resetDb);

  it("marks paid once, clears only the ordered items from the bag, and is idempotent", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const extra = await createProduct({ variants: [{ size: "L", colorName: "White", stock: 5 }] });
    const p = await placeOrder(user.id, { addressId: address.id });
    await addItem({ userId: user.id }, extra.variants[0].id, 1);
    expect(await markOrderPaid(p.orderId, "pay_1", "client")).toEqual({ outcome: "paid", number: "ORD-1001" });
    expect(await markOrderPaid(p.orderId, "pay_1", "webhook")).toEqual({ outcome: "already_paid", number: "ORD-1001" });
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "PAID", providerPaymentId: "pay_1", needsAttention: false });
    expect(o.paidAt).not.toBeNull();
    expect(o.events.filter((e) => e.type === "PAID")).toHaveLength(1);
    const cart = await db.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(cart.map((c) => c.variantId)).toEqual([extra.variants[0].id]);
    expect(await stockOf(variant.id)).toBe(3);
  });

  it("flags an amount mismatch without marking paid", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    expect((await markOrderPaid(p.orderId, "pay_x", "webhook", { amountPaise: 100 })).outcome).toBe("amount_mismatch");
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "PENDING_PAYMENT", needsAttention: true });
    expect(o.events.map((e) => e.type)).toContain("ATTENTION");
  });

  it("re-reserves stock when payment lands after expiry", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    expect(await expireStaleOrders(later())).toBe(1);
    expect(await stockOf(variant.id)).toBe(5);
    expect((await markOrderPaid(p.orderId, "pay_late", "webhook")).outcome).toBe("paid");
    expect(await stockOf(variant.id)).toBe(3);
    expect(await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).toMatchObject({ status: "PAID", needsAttention: false });
  });

  it("marks a late payment paid but needing attention when stock is gone", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    await expireStaleOrders(later());
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 1 } });
    expect((await markOrderPaid(p.orderId, "pay_late", "webhook")).outcome).toBe("attention");
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "PAID", needsAttention: true });
    expect(o.events.map((e) => e.type)).toEqual(expect.arrayContaining(["PAID", "ATTENTION"]));
    expect(await stockOf(variant.id)).toBe(1);
  });

  it("flags money received for a cancelled order", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    await cancelOrder(p.orderId, { reason: "test" });
    expect((await markOrderPaid(p.orderId, "pay_c", "webhook")).outcome).toBe("attention");
    expect(await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).toMatchObject({ status: "CANCELLED", needsAttention: true, providerPaymentId: "pay_c" });
  });
});

describe("expiry and cancel", () => {
  beforeEach(resetDb);

  it("expires only past-due pending orders, once", async () => {
    const a = await buyer({ qty: 2 });
    const pa = await placeOrder(a.user.id, { addressId: a.address.id });
    const b = await buyer();
    const pb = await placeOrder(b.user.id, { addressId: b.address.id });
    await db.order.update({ where: { id: pb.orderId }, data: { expiresAt: new Date(Date.now() + 3_600_000) } });
    expect(await expireStaleOrders(later())).toBe(1);
    expect(await expireStaleOrders(later())).toBe(0);
    const oa = await db.order.findUniqueOrThrow({ where: { id: pa.orderId }, include: { events: true } });
    expect(oa.status).toBe("EXPIRED");
    expect(oa.events.map((e) => e.type)).toContain("EXPIRED");
    expect(await stockOf(a.variant.id)).toBe(5);
    expect((await db.order.findUniqueOrThrow({ where: { id: pb.orderId } })).status).toBe("PENDING_PAYMENT");
  });

  it("cancels with restock before shipping, and refuses after", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    await markOrderPaid(p.orderId, "pay_1", "client");
    await cancelOrder(p.orderId, { actorId: null, reason: "Customer asked" });
    expect(await stockOf(variant.id)).toBe(5);
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId } });
    expect(o.status).toBe("CANCELLED");
    expect(o.cancelledAt).not.toBeNull();
    await expect(cancelOrder(p.orderId)).rejects.toBeInstanceOf(ConflictError);
    const q = await buyer();
    const pq = await placeOrder(q.user.id, { addressId: q.address.id });
    await db.order.update({ where: { id: pq.orderId }, data: { status: "SHIPPED" } });
    await expect(cancelOrder(pq.orderId)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("customer reads and retry", () => {
  beforeEach(resetDb);

  it("lists and reads only the owner's orders", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    const page = await listOrdersForUser(user.id);
    expect(page).toMatchObject({ total: 1, hasMore: false });
    expect(page.items[0]).toMatchObject({ number: p.number, itemCount: 1, totalPaise: 67800 });
    const view = await getOrderForUser(user.id, p.number);
    expect(view.ship).toMatchObject({ name: "Asha Rao", city: "Bengaluru", pincode: "560001" });
    const stranger = await createUser();
    await expect(getOrderForUser(stranger.id, p.number)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns a retry payload only while the order is payable", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    expect(await getRetryPayload(user.id, p.number)).toMatchObject({ orderId: p.orderId, providerOrderId: p.providerOrderId, amountPaise: 67800 });
    await markOrderPaid(p.orderId, "pay_1", "client");
    await expect(getRetryPayload(user.id, p.number)).rejects.toBeInstanceOf(ConflictError);
  });
});
