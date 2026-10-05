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
  releaseOrder, STALE_PROVIDER_ORDER_MS,
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
    expect(bad.details.couponCode).toEqual(["This code can't be applied"]);
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

  it("reuses the user's own pending order on an identical retry instead of creating a duplicate", async () => {
    const { user, variant, address } = await buyer({ qty: 1, stock: 1 });
    const first = await placeOrder(user.id, { addressId: address.id });
    expect(await stockOf(variant.id)).toBe(0);
    const second = await placeOrder(user.id, { addressId: address.id });
    expect(second.orderId).toBe(first.orderId);
    expect(second.number).toBe(first.number);
    expect(second.providerOrderId).toBe(first.providerOrderId);
    expect(await db.order.count({ where: { userId: user.id } })).toBe(1);
    expect(await stockOf(variant.id)).toBe(0);
    const cart = await db.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(cart).toHaveLength(1);
  });

  it("supersedes the user's own pending order when the cart changes before retrying", async () => {
    const { user, variant, address } = await buyer({ qty: 1, stock: 5 });
    const first = await placeOrder(user.id, { addressId: address.id });
    expect(await stockOf(variant.id)).toBe(4);
    await addItem({ userId: user.id }, variant.id, 1);
    const second = await placeOrder(user.id, { addressId: address.id });
    expect(second.number).not.toBe(first.number);
    const firstOrder = await db.order.findUniqueOrThrow({ where: { id: first.orderId } });
    expect(firstOrder.status).toBe("EXPIRED");
    const pending = await db.order.findMany({ where: { userId: user.id, status: "PENDING_PAYMENT" } });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(second.orderId);
    expect(await stockOf(variant.id)).toBe(3);
    const cart = await db.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(cart).toHaveLength(1);
  });

  it("supersedes instead of reusing when line prices change even though the total stays the same", async () => {
    const user = await createUser();
    const product = await createProduct({ variants: [{ size: "M", colorName: "Black", pricePaise: 59900 }, { size: "L", colorName: "Black", pricePaise: 59900 }] });
    const [a, b] = product.variants;
    const address = await createAddress(user.id, ADDRESS);
    await addItem({ userId: user.id }, a.id, 1);
    await addItem({ userId: user.id }, b.id, 1);
    const first = await placeOrder(user.id, { addressId: address.id });
    await db.productVariant.update({ where: { id: a.id }, data: { pricePaise: 60000 } });
    await db.productVariant.update({ where: { id: b.id }, data: { pricePaise: 59800 } });
    const second = await placeOrder(user.id, { addressId: address.id });
    expect(second.amountPaise).toBe(first.amountPaise);
    expect(second.orderId).not.toBe(first.orderId);
    const items = await db.orderItem.findMany({ where: { orderId: second.orderId }, orderBy: { unitPricePaise: "asc" } });
    expect(items.map((i) => i.unitPricePaise)).toEqual([59800, 60000]);
  });

  it("resolves a concurrent same-user double-submit to a single order, decrementing stock once", async () => {
    const { user, variant, address } = await buyer({ qty: 2, stock: 5 });
    const [a, b] = await Promise.all([
      placeOrder(user.id, { addressId: address.id }),
      placeOrder(user.id, { addressId: address.id }),
    ]);
    expect(a.orderId).toBe(b.orderId);
    expect(a.number).toBe(b.number);
    expect(a.providerOrderId).toBe(b.providerOrderId);
    expect(await db.order.count({ where: { userId: user.id } })).toBe(1);
    expect(await stockOf(variant.id)).toBe(3);
  });

  it("rolls back a supersede when the new attempt's coupon check fails inside the transaction", async () => {
    await db.coupon.create({ data: { code: "ONECODE", type: "FLAT", value: 1000, usageLimit: 1 } });
    const other = await buyer();
    await placeOrder(other.user.id, { addressId: other.address.id, couponCode: "onecode" }); // consumes the only slot (still PENDING)

    const { user, variant, address } = await buyer({ qty: 1, stock: 5 });
    const orderA = await placeOrder(user.id, { addressId: address.id }); // no coupon yet
    await addItem({ userId: user.id }, variant.id, 1); // change the cart so this isn't a pure reuse

    await expect(placeOrder(user.id, { addressId: address.id, couponCode: "onecode" })).rejects.toBeInstanceOf(ValidationError);
    const a = await db.order.findUniqueOrThrow({ where: { id: orderA.orderId } });
    expect(a.status).toBe("PENDING_PAYMENT");
    expect(await stockOf(variant.id)).toBe(4);
    expect(await db.order.count({ where: { userId: user.id } })).toBe(1);
  });

  it("lets only one of two concurrent checkouts use a usageLimit:1 coupon", async () => {
    await db.coupon.create({ data: { code: "ONECODE", type: "FLAT", value: 1000, usageLimit: 1 } });
    const a = await buyer();
    const b = await buyer();
    const results = await Promise.allSettled([
      placeOrder(a.user.id, { addressId: a.address.id, couponCode: "onecode" }),
      placeOrder(b.user.id, { addressId: b.address.id, couponCode: "onecode" }),
    ]);
    expect(await db.order.count({ where: { couponCode: "ONECODE" } })).toBe(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ValidationError);
  });

  it("lets only one of two concurrent buyers win the last unit", async () => {
    const product = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 1 }] });
    const variant = product.variants[0]!;
    const buyerA = await createUser();
    const buyerB = await createUser();
    const addrA = await createAddress(buyerA.id, ADDRESS);
    const addrB = await createAddress(buyerB.id, ADDRESS);
    await addItem({ userId: buyerA.id }, variant.id, 1);
    await addItem({ userId: buyerB.id }, variant.id, 1);
    const results = await Promise.allSettled([
      placeOrder(buyerA.id, { addressId: addrA.id }),
      placeOrder(buyerB.id, { addressId: addrB.id }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(StockChangedError);
    expect(await stockOf(variant.id)).toBe(0);
    expect(await db.order.count()).toBe(1);
  });

  it("rolls back an earlier line's decrement when a later line's stock vanishes mid-transaction", async () => {
    const user = await createUser();
    const address = await createAddress(user.id, ADDRESS);
    const productA = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    const variantA = productA.variants[0]!;
    const productB = await createProduct({ variants: [{ size: "L", colorName: "White", stock: 5 }] });
    const variantB = productB.variants[0]!;
    await addItem({ userId: user.id }, variantA.id, 1);
    await addItem({ userId: user.id }, variantB.id, 1);

    // Holds a real row lock on variantB for 80ms so placeOrder's own transaction blocks trying to
    // decrement it, then commits stock:0 — a genuine external write landing strictly after
    // reconcileCartStock's (pre-transaction) read but before the in-transaction decrement. This
    // must roll back any earlier decrement (variantA) in the same transaction.
    const blockerTx = db.$transaction(async (tx) => {
      await tx.productVariant.update({ where: { id: variantB.id }, data: { stock: 0 } });
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    const err = await placeOrder(user.id, { addressId: address.id }).catch((e) => e);
    await blockerTx;

    expect(err).toBeInstanceOf(StockChangedError);
    expect(await stockOf(variantA.id)).toBe(5);
    expect(await stockOf(variantB.id)).toBe(0);
    expect(await db.order.count()).toBe(0);
    // If the miss were instead caught by the pre-transaction reconcile (the timing-dependent failure
    // mode this test guards against), line B would have been deleted from the bag as "sold out".
    // The in-transaction path never touches the cart, so both lines must still be there.
    const cart = await db.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(cart.map((c) => c.variantId).sort()).toEqual([variantA.id, variantB.id].sort());
  });

  it("supersedes instead of reusing when the delivery address changes between attempts", async () => {
    const { user, address } = await buyer({ qty: 1, stock: 5 });
    const first = await placeOrder(user.id, { addressId: address.id });
    const otherAddress = await createAddress(user.id, { ...ADDRESS, fullName: "Someone Else", line1: "99 Other Road" });
    const second = await placeOrder(user.id, { addressId: otherAddress.id });
    expect(second.number).not.toBe(first.number);
    const firstOrder = await db.order.findUniqueOrThrow({ where: { id: first.orderId } });
    expect(firstOrder.status).toBe("EXPIRED");
    const secondOrder = await db.order.findUniqueOrThrow({ where: { id: second.orderId } });
    expect(secondOrder).toMatchObject({ status: "PENDING_PAYMENT", shipName: "Someone Else", shipLine1: "99 Other Road" });
  });

  it("supersedes instead of reusing when only the note changes between attempts", async () => {
    const { user, address } = await buyer({ qty: 1, stock: 5 });
    const first = await placeOrder(user.id, { addressId: address.id });
    const second = await placeOrder(user.id, { addressId: address.id, customerNote: "Leave at the door" });
    expect(second.number).not.toBe(first.number);
    expect((await db.order.findUniqueOrThrow({ where: { id: first.orderId } })).status).toBe("EXPIRED");
    expect((await db.order.findUniqueOrThrow({ where: { id: second.orderId } })).customerNote).toBe("Leave at the door");
  });

  it("supersedes (never reuses) a stale pending order whose payment never started", async () => {
    const { user, address } = await buyer({ qty: 1, stock: 5 });
    const first = await placeOrder(user.id, { addressId: address.id });
    // Simulates the request that created it dying between the transaction commit and the
    // provider.createOrder()/providerOrderId update (serverless kill, DB blip) — the order is stuck
    // PENDING_PAYMENT with no providerOrderId, old enough that it can no longer be the one still
    // legitimately mid-flight.
    await db.order.update({ where: { id: first.orderId }, data: { providerOrderId: null, createdAt: new Date(Date.now() - STALE_PROVIDER_ORDER_MS - 1000) } });
    const second = await placeOrder(user.id, { addressId: address.id });
    expect(second.number).not.toBe(first.number);
    expect(second.providerOrderId).toMatch(/^mock_order_/);
    expect((await db.order.findUniqueOrThrow({ where: { id: first.orderId } })).status).toBe("EXPIRED");
  });

  it("stops waiting for a reused order once its creator's payment start fails, instead of waiting out the poll timeout", async () => {
    const { user, address } = await buyer({ qty: 1, stock: 5 });
    const spy = vi.spyOn(MockProvider.prototype, "createOrder").mockRejectedValueOnce(new Error("provider down"));
    const startedAt = Date.now();
    const results = await Promise.allSettled([
      placeOrder(user.id, { addressId: address.id }),
      placeOrder(user.id, { addressId: address.id }),
    ]);
    const elapsedMs = Date.now() - startedAt;
    spy.mockRestore();
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    // Well under the 3s poll timeout — proves the reuser bailed out on seeing the order leave
    // PENDING_PAYMENT rather than silently waiting the whole window out.
    expect(elapsedMs).toBeLessThan(2500);
    expect(await db.order.count({ where: { userId: user.id } })).toBe(1);
    expect((await db.order.findFirstOrThrow({ where: { userId: user.id } })).status).toBe("CANCELLED");
  });

  it("never reuses a pending order whose stock was already released (defensive stockReserved check)", async () => {
    const { user, address } = await buyer({ qty: 1, stock: 5 });
    const first = await placeOrder(user.id, { addressId: address.id });
    await db.order.update({ where: { id: first.orderId }, data: { stockReserved: false } });
    const second = await placeOrder(user.id, { addressId: address.id });
    expect(second.number).not.toBe(first.number);
    expect((await db.order.findUniqueOrThrow({ where: { id: first.orderId } })).status).toBe("EXPIRED");
  });

  it("supersedes instead of reusing an open order with too little time left before it expires", async () => {
    const { user, address } = await buyer({ qty: 1, stock: 5 });
    const first = await placeOrder(user.id, { addressId: address.id });
    await db.order.update({ where: { id: first.orderId }, data: { expiresAt: new Date(Date.now() + 2 * 60_000) } });
    const second = await placeOrder(user.id, { addressId: address.id });
    expect(second.number).not.toBe(first.number);
    expect((await db.order.findUniqueOrThrow({ where: { id: first.orderId } })).status).toBe("EXPIRED");
  });

  it("locks overlapping variants in one sorted pass so a superseded order and a concurrent overlapping checkout don't deadlock", async () => {
    // A's id sorts before B's (created first) so a naive independent-pass ordering would have one
    // transaction touch [B, A] (restock the old order's B, then decrement the new cart's A) while
    // this concurrent one touches [A, B] (decrement A then B) — opposite orders over the same rows.
    const productA = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    const variantA = productA.variants[0]!;
    const productB = await createProduct({ variants: [{ size: "L", colorName: "White", stock: 5 }] });
    const variantB = productB.variants[0]!;

    const user = await createUser();
    const address = await createAddress(user.id, ADDRESS);
    await addItem({ userId: user.id }, variantB.id, 1);
    const first = await placeOrder(user.id, { addressId: address.id }); // holds only B
    await db.cartItem.deleteMany({ where: { cart: { userId: user.id } } });
    await addItem({ userId: user.id }, variantA.id, 1); // retry's cart is now only A -> old={B}, new={A}

    const other = await createUser();
    const otherAddress = await createAddress(other.id, ADDRESS);
    await addItem({ userId: other.id }, variantA.id, 1);
    await addItem({ userId: other.id }, variantB.id, 1); // fresh overlapping checkout: new={A,B}

    const [retry, overlapping] = await Promise.all([
      placeOrder(user.id, { addressId: address.id }),
      placeOrder(other.id, { addressId: otherAddress.id }),
    ]);

    expect(retry.number).not.toBe(first.number);
    expect(overlapping.providerOrderId).toMatch(/^mock_order_/);
    expect((await db.order.findUniqueOrThrow({ where: { id: first.orderId } })).status).toBe("EXPIRED");
    expect(await stockOf(variantA.id)).toBe(3); // 5 - 1 (user's retry) - 1 (other's overlapping order)
    expect(await stockOf(variantB.id)).toBe(4); // 5 - 1 (other's overlapping order); user's B was restocked
  });

  describe("slow payment provider (I-1)", () => {
    /** Makes the next provider.createOrder call block until `release()` is called; `entered` resolves once it is in flight. */
    function gateNextCreateOrder() {
      const original = MockProvider.prototype.createOrder;
      let release!: () => void;
      let markEntered!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const entered = new Promise<void>((r) => { markEntered = r; });
      const spy = vi.spyOn(MockProvider.prototype, "createOrder").mockImplementationOnce(async function (this: MockProvider, input) {
        markEntered();
        await gate;
        return original.call(this, input);
      });
      return { release, entered, spy };
    }

    it("does not treat an order as stale while a slow provider call (up to the 15 s Razorpay timeout) may still finish", () => {
      expect(STALE_PROVIDER_ORDER_MS).toBeGreaterThanOrEqual(20_000);
    });

    it("never returns a live payload for an order superseded while its slow createOrder was in flight", async () => {
      const { user, variant, address } = await buyer({ qty: 1, stock: 5 });
      const { release, entered, spy } = gateNextCreateOrder();
      const slow = placeOrder(user.id, { addressId: address.id });
      const slowSettled = slow.then(() => "resolved" as const, (e: unknown) => e);
      await entered;
      const first = await db.order.findFirstOrThrow({ where: { userId: user.id } });
      expect(first.providerOrderId).toBeNull();
      // Time passes past the stale threshold while the provider is still thinking; a second attempt supersedes.
      await db.order.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - STALE_PROVIDER_ORDER_MS - 1000) } });
      const second = await placeOrder(user.id, { addressId: address.id });
      expect(second.orderId).not.toBe(first.id);
      expect(await stockOf(variant.id)).toBe(4);

      release();
      const outcome = await slowSettled;
      spy.mockRestore();
      expect(outcome).toBeInstanceOf(PaymentError);
      expect((outcome as PaymentError).message).toMatch(/replaced/i);
      const firstAfter = await db.order.findUniqueOrThrow({ where: { id: first.id } });
      expect(firstAfter.status).toBe("EXPIRED");
      expect(firstAfter.providerOrderId).toBeNull();
      expect(await stockOf(variant.id)).toBe(4);
      expect((await db.order.findUniqueOrThrow({ where: { id: second.orderId } })).status).toBe("PENDING_PAYMENT");
    });

    it("does not supersede an order whose provider call is merely slow (inside the provider timeout)", async () => {
      const { user, variant, address } = await buyer({ qty: 1, stock: 5 });
      const { release, entered, spy } = gateNextCreateOrder();
      const slow = placeOrder(user.id, { addressId: address.id });
      await entered;
      const first = await db.order.findFirstOrThrow({ where: { userId: user.id } });
      await db.order.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 15_000) } });
      // The identical retry reuses (waits for) the in-flight order instead of superseding it.
      await expect(placeOrder(user.id, { addressId: address.id })).rejects.toBeInstanceOf(ConflictError);
      release();
      const payload = await slow;
      spy.mockRestore();
      expect(payload.orderId).toBe(first.id);
      expect((await db.order.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("PENDING_PAYMENT");
      expect(await db.order.count({ where: { userId: user.id } })).toBe(1);
      expect(await stockOf(variant.id)).toBe(4);
    });
  });

  it("does not hand back a reused order's payload once another attempt has superseded it (m2)", async () => {
    const { user, address } = await buyer({ qty: 1, stock: 5 });
    const first = await placeOrder(user.id, { addressId: address.id });
    expect(first.providerOrderId).toMatch(/^mock_order_/);
    // Between the identical retry deciding to reuse the order and the reuse wait's first read, a
    // different attempt supersedes it. Simulated by expiring it just before that read.
    const original = db.order.findUnique;
    let superseded = false;
    db.order.findUnique = (async (args: { where: { id?: string }; select?: { providerOrderId?: boolean } }) => {
      if (!superseded && args.where.id === first.orderId && args.select?.providerOrderId) {
        superseded = true;
        await db.order.update({ where: { id: first.orderId }, data: { status: "EXPIRED" } });
      }
      return original.call(db.order, args as Parameters<typeof original>[0]);
    }) as unknown as typeof original;
    try {
      await expect(placeOrder(user.id, { addressId: address.id })).rejects.toBeInstanceOf(PaymentError);
    } finally {
      db.order.findUnique = original;
    }
    expect(superseded).toBe(true);
  });

  describe("supersede vs a concurrent release of the same order (m1)", () => {
    const lockWaiters = async () => {
      const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      return Number(rows[0]!.n);
    };
    const waitFor = async (cond: () => Promise<boolean>) => {
      const deadline = Date.now() + 5000;
      while (!(await cond())) {
        if (Date.now() > deadline) throw new Error("timed out waiting for lock waiters");
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    it("does not deadlock when a releaseOrder queues behind a superseding placeOrder on the same variant", async () => {
      const { user, variant, address } = await buyer({ qty: 1, stock: 5 });
      const first = await placeOrder(user.id, { addressId: address.id });
      await addItem({ userId: user.id }, variant.id, 1); // cart changed -> the next attempt supersedes `first`

      // Hold the variant row so both contenders queue up behind it in a known order: placeOrder
      // first, then a release of the order it is about to supersede (the creator's failure path).
      let unblock: (() => void) | undefined;
      const blocker = db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ProductVariant" WHERE id = ${variant.id} FOR UPDATE`;
        await new Promise<void>((r) => { unblock = r; });
      }, { timeout: 15_000 });
      await waitFor(async () => unblock !== undefined);

      const retry = placeOrder(user.id, { addressId: address.id }).then((v) => v, (e: unknown) => e);
      await waitFor(async () => (await lockWaiters()) >= 1);
      const release = releaseOrder(first.orderId, ["PENDING_PAYMENT"], "CANCELLED", "PAYMENT_FAILED", "test release").then((v) => v, (e: unknown) => e);
      await waitFor(async () => (await lockWaiters()) >= 2);
      unblock!();
      await blocker;

      const [retryOutcome, releaseOutcome] = await Promise.all([retry, release]);
      expect(retryOutcome).not.toBeInstanceOf(Error);
      expect(releaseOutcome).not.toBeInstanceOf(Error);
      expect(releaseOutcome).toBe(false); // the supersede won; the late release is a no-op
      expect((await db.order.findUniqueOrThrow({ where: { id: first.orderId } })).status).toBe("EXPIRED");
      expect(await stockOf(variant.id)).toBe(3); // 5 - 2 (new order); the first order's unit restocked exactly once
    });

    it("never deadlocks across many concurrent supersede + release races", async () => {
      for (let i = 0; i < 15; i++) {
        // fresh user + product each round (no resetDb here: it restarts the order-number sequence mid-test)
        const { user, variant, address } = await buyer({ qty: 1, stock: 5 });
        const first = await placeOrder(user.id, { addressId: address.id });
        await addItem({ userId: user.id }, variant.id, 1);
        const [retry, release] = await Promise.allSettled([
          placeOrder(user.id, { addressId: address.id }),
          releaseOrder(first.orderId, ["PENDING_PAYMENT"], "CANCELLED", "PAYMENT_FAILED", "test release"),
        ]);
        expect(retry.status, String(retry.status === "rejected" ? retry.reason : "")).toBe("fulfilled");
        expect(release.status, String(release.status === "rejected" ? release.reason : "")).toBe("fulfilled");
        expect(await stockOf(variant.id)).toBe(3);
      }
    }, 60_000);
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

  it("keeps the first payment id on a cancelled order and notes a different later one without overwriting it, once", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    await cancelOrder(p.orderId, { reason: "test" });
    expect((await markOrderPaid(p.orderId, "pay_first", "webhook")).outcome).toBe("attention");
    let o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o.providerPaymentId).toBe("pay_first");
    expect(o.events.filter((e) => e.type === "ATTENTION")).toHaveLength(1);

    expect((await markOrderPaid(p.orderId, "pay_second", "webhook")).outcome).toBe("attention");
    expect((await markOrderPaid(p.orderId, "pay_second", "webhook")).outcome).toBe("attention"); // a retry of the same different id
    o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o.providerPaymentId).toBe("pay_first"); // never overwritten
    expect(o.events.filter((e) => e.type === "ATTENTION")).toHaveLength(1); // not duplicated
    expect(o.events.filter((e) => e.type === "NOTE")).toHaveLength(1); // deduped per payment id
  });

  it("still records the first real payment id when an order was already flagged for an amount mismatch", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    expect((await markOrderPaid(p.orderId, "pay_wrong_amount", "webhook", { amountPaise: 100 })).outcome).toBe("amount_mismatch");
    await cancelOrder(p.orderId, { reason: "test" });
    expect((await markOrderPaid(p.orderId, "pay_real", "webhook")).outcome).toBe("attention");
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o.providerPaymentId).toBe("pay_real");
    const note = o.events.find((e) => e.type === "NOTE");
    expect(note?.message).toContain("pay_real");
    expect(note?.message).toContain("recorded");
  });

  it("lets a late payment on a superseded order re-reserve stock through the normal EXPIRED path", async () => {
    const { user, variant, address } = await buyer({ qty: 1, stock: 5 });
    const orderA = await placeOrder(user.id, { addressId: address.id });
    await addItem({ userId: user.id }, variant.id, 1);
    const orderB = await placeOrder(user.id, { addressId: address.id });
    expect(orderB.number).not.toBe(orderA.number);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderA.orderId } })).status).toBe("EXPIRED");
    expect(await stockOf(variant.id)).toBe(3);

    expect((await markOrderPaid(orderA.orderId, "pay_late", "webhook")).outcome).toBe("paid");
    expect(await stockOf(variant.id)).toBe(2);
    const a = await db.order.findUniqueOrThrow({ where: { id: orderA.orderId } });
    expect(a).toMatchObject({ status: "PAID", needsAttention: false });
    const b = await db.order.findUniqueOrThrow({ where: { id: orderB.orderId } });
    expect(b.status).toBe("PENDING_PAYMENT");
  });

  it("does not fabricate phantom stock when a 'needs attention' late payment is later cancelled", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    await expireStaleOrders(later());
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 1 } });
    expect((await markOrderPaid(p.orderId, "pay_late", "webhook")).outcome).toBe("attention");
    expect(await stockOf(variant.id)).toBe(1);
    await cancelOrder(p.orderId, { reason: "refund needed" });
    expect(await stockOf(variant.id)).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).status).toBe("CANCELLED");
  });

  it("flags a second, different captured payment on an already-paid order once per payment id", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    expect((await markOrderPaid(p.orderId, "pay_1", "client")).outcome).toBe("paid");
    // Same id again stays idempotent and silent.
    expect((await markOrderPaid(p.orderId, "pay_1", "webhook")).outcome).toBe("already_paid");
    // A different captured payment (webhook and reconcile racing, plus a retry) → flagged once.
    const outcomes = await Promise.all([
      markOrderPaid(p.orderId, "pay_2", "webhook"),
      markOrderPaid(p.orderId, "pay_2", "reconcile"),
    ]);
    expect(outcomes.map((o) => o.outcome)).toEqual(["attention", "attention"]);
    await markOrderPaid(p.orderId, "pay_2", "webhook");
    let o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "PAID", providerPaymentId: "pay_1", needsAttention: true });
    expect(o.events.filter((e) => e.message.includes("pay_2"))).toHaveLength(1);
    expect(o.events.find((e) => e.message.includes("pay_2"))).toMatchObject({ type: "ATTENTION", message: "Second payment pay_2 captured — refund it in the payment dashboard" });
    // Still flagged: a third payment is noted (not a second ATTENTION), once, even after shipping.
    await db.order.update({ where: { id: p.orderId }, data: { status: "SHIPPED" } });
    await Promise.all([markOrderPaid(p.orderId, "pay_3", "webhook"), markOrderPaid(p.orderId, "pay_3", "webhook")]);
    o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o.events.filter((e) => e.message.includes("pay_3")).map((e) => e.type)).toEqual(["NOTE"]);
    expect(o.events.filter((e) => e.type === "ATTENTION")).toHaveLength(1);
    expect(o.events.filter((e) => e.type === "PAID")).toHaveLength(1);
    expect(o.status).toBe("SHIPPED");
    expect(await stockOf(variant.id)).toBe(3);
  });

  it("flags a different captured payment that arrives after the order was refunded (M1), once", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    await markOrderPaid(p.orderId, "pay_1", "client");
    await db.order.update({ where: { id: p.orderId }, data: { status: "REFUNDED", refundedAt: new Date() } });
    // The refunded payment itself again: silent.
    expect((await markOrderPaid(p.orderId, "pay_1", "webhook")).outcome).toBe("already_paid");
    expect((await markOrderPaid(p.orderId, "pay_2", "webhook")).outcome).toBe("attention");
    expect((await markOrderPaid(p.orderId, "pay_2", "reconcile")).outcome).toBe("attention");
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "REFUNDED", providerPaymentId: "pay_1", needsAttention: true });
    expect(o.events.filter((e) => e.message.includes("pay_2")).map((e) => e.type)).toEqual(["ATTENTION"]);
  });

  it("resolves a concurrent client+webhook payment to exactly one PAID transition", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    const [a, b] = await Promise.all([
      markOrderPaid(p.orderId, "pay_1", "client"),
      markOrderPaid(p.orderId, "pay_1", "webhook"),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(["already_paid", "paid"]);
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o.status).toBe("PAID");
    expect(o.events.filter((e) => e.type === "PAID")).toHaveLength(1);
    expect(await stockOf(variant.id)).toBe(3);
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

  it("flags a cancelled paid order 'refund pending' in the same step, and not an unpaid one (I1)", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    await markOrderPaid(p.orderId, "pay_1", "client");
    expect(await cancelOrder(p.orderId, { reason: "Print defect" })).toEqual({ restocked: true, refundPending: true });
    expect(await stockOf(variant.id)).toBe(5);
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "CANCELLED", needsAttention: true, providerPaymentId: "pay_1" });
    expect(o.events.find((e) => e.type === "ATTENTION")?.message).toBe(
      "Cancelled after payment: refund ₹1,198 pending (payment pay_1). Use Refund, or Mark refunded if it was refunded in the payment dashboard.",
    );
    expect(o.events.find((e) => e.type === "STATUS_CHANGED")?.message).toBe("Cancelled: Print defect; stock restocked");

    const q = await buyer();
    const pq = await placeOrder(q.user.id, { addressId: q.address.id });
    expect(await cancelOrder(pq.orderId)).toEqual({ restocked: true, refundPending: false });
    expect(await db.order.findUniqueOrThrow({ where: { id: pq.orderId } })).toMatchObject({ status: "CANCELLED", needsAttention: false });
  });

  it("still records the pending refund when a paid order being cancelled was already flagged for something else", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    await markOrderPaid(p.orderId, "pay_1", "client");
    await db.order.update({ where: { id: p.orderId }, data: { needsAttention: true } });
    await cancelOrder(p.orderId);
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o.needsAttention).toBe(true);
    expect(o.events.filter((e) => e.message.startsWith("Cancelled after payment")).map((e) => e.type)).toEqual(["NOTE"]);
  });

  it("says so when a cancelled order had no stock to put back (M10)", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    await expireStaleOrders(later());
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 1 } });
    await markOrderPaid(p.orderId, "pay_late", "webhook"); // paid after expiry, stock short → stockReserved false
    expect(await cancelOrder(p.orderId)).toEqual({ restocked: false, refundPending: true });
    expect(await stockOf(variant.id)).toBe(1);
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o.events.find((e) => e.type === "STATUS_CHANGED")?.message).toBe("Cancelled; no stock to restock (the order held none)");
  });

  it("runs two expiry sweeps concurrently without double-restocking", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    await placeOrder(user.id, { addressId: address.id });
    const [a, b] = await Promise.all([expireStaleOrders(later()), expireStaleOrders(later())]);
    expect(a + b).toBe(1);
    expect(await stockOf(variant.id)).toBe(5);
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

  it("keeps retry and list scoped to the owner even when another user has orders", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    const other = await buyer();
    await placeOrder(other.user.id, { addressId: other.address.id });
    await expect(getRetryPayload(other.user.id, p.number)).rejects.toBeInstanceOf(NotFoundError);
    const page = await listOrdersForUser(user.id);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
  });
});
