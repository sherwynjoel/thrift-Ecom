import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { getEmail, type ConsoleEmail } from "@/server/adapters/email";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { placeOrder, ORDER_TTL_MS } from "@/server/services/orders";
import { runAbandonedCart } from "@/server/jobs/abandoned-cart";
import { runDailySummary } from "@/server/jobs/daily-summary";
import { runExpireOrders } from "@/server/jobs/expire-orders";
import { runLowStock } from "@/server/jobs/low-stock";
import { runReconcilePayments } from "@/server/jobs/reconcile-payments";
import { isJobName, JOBS } from "@/server/jobs";
import { MockProvider } from "@/server/payments/mock";
import type { ProviderPayment } from "@/server/payments";

const HOUR = 3_600_000;
const outbox = () => getEmail() as ConsoleEmail;
const settings = (data: { adminNotifyEmail?: string | null; dailySummaryEnabled?: boolean; abandonedCartEnabled?: boolean }) =>
  db.storeSetting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });

beforeEach(async () => {
  await resetDb();
  outbox().sent.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe("expire-orders", () => {
  it("expires past-due pending orders once", async () => {
    const user = await createUser();
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    const address = await createAddress(user.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await addItem({ userId: user.id }, p.variants[0].id, 2);
    await placeOrder(user.id, { addressId: address.id });
    const later = new Date(Date.now() + ORDER_TTL_MS + 1000);
    expect(await runExpireOrders(later)).toEqual({ expired: 1 });
    expect(await runExpireOrders(later)).toEqual({ expired: 0 });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: p.variants[0].id } })).stock).toBe(5);
  });
});

describe("low-stock", () => {
  it("sends one digest, stamps variants, and re-arms after a restock", async () => {
    await settings({ adminNotifyEmail: "owner@example.test" });
    const p = await createProduct({ name: "Alpha Tee", variants: [{ size: "S", colorName: "Black", stock: 2 }, { size: "M", colorName: "Black", stock: 10 }] });
    await createProduct({ status: "DRAFT", variants: [{ size: "S", colorName: "Red", stock: 0 }] });
    expect(await runLowStock()).toEqual({ reset: 0, alerted: 1 });
    expect(outbox().sent).toHaveLength(1);
    expect(outbox().sent[0]).toMatchObject({ to: "owner@example.test", subject: "Low stock: 1 variant at or below 5" });
    expect(await runLowStock()).toEqual({ reset: 0, alerted: 0 });
    expect(outbox().sent).toHaveLength(1);
    const s = p.variants.find((v) => v.size === "S")!;
    await db.productVariant.update({ where: { id: s.id }, data: { stock: 12 } });
    expect(await runLowStock()).toEqual({ reset: 1, alerted: 0 });
    await db.productVariant.update({ where: { id: s.id }, data: { stock: 1 } });
    expect(await runLowStock()).toEqual({ reset: 0, alerted: 1 });
  });

  it("sends exactly one digest when two runs overlap, and releases the claim when sending fails", async () => {
    await settings({ adminNotifyEmail: "owner@example.test" });
    const p = await createProduct({ variants: [{ size: "S", colorName: "Black", stock: 1 }, { size: "M", colorName: "Black", stock: 0 }] });
    vi.spyOn(outbox(), "send").mockRejectedValueOnce(new Error("smtp down"));
    expect(await runLowStock()).toEqual({ reset: 0, alerted: 0, skipped: "failed" });
    const stamps = await db.productVariant.findMany({ where: { productId: p.id }, select: { lowStockAlertedAt: true } });
    expect(stamps.every((v) => v.lowStockAlertedAt === null)).toBe(true);
    vi.restoreAllMocks();

    const runs = await Promise.all([runLowStock(), runLowStock(), runLowStock()]);
    expect(runs.map((r) => r.alerted).sort()).toEqual([0, 0, 2]);
    expect(outbox().sent).toHaveLength(1);
    expect(outbox().sent[0].subject).toBe("Low stock: 2 variants at or below 5");
  });

  it("does not stamp anything without an admin email", async () => {
    await settings({ adminNotifyEmail: null });
    const p = await createProduct({ variants: [{ size: "S", colorName: "Black", stock: 1 }] });
    expect(await runLowStock()).toEqual({ reset: 0, alerted: 0, skipped: "no-recipient" });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: p.variants[0].id } })).lowStockAlertedAt).toBeNull();
  });
});

describe("daily-summary", () => {
  it("sends once per IST day and releases the claim when sending fails", async () => {
    await settings({ adminNotifyEmail: "owner@example.test", dailySummaryEnabled: false });
    expect(await runDailySummary()).toEqual({ sent: false, reason: "disabled" });
    await settings({ dailySummaryEnabled: true });
    const u = await createUser();
    await createOrderRow(u.id, { status: "PAID", totalPaise: 59900 });
    const now = new Date();
    vi.spyOn(outbox(), "send").mockRejectedValueOnce(new Error("smtp down"));
    expect(await runDailySummary(now)).toEqual({ sent: false, reason: "failed" });
    expect(await runDailySummary(now)).toEqual({ sent: true });
    expect(outbox().sent.at(-1)?.html).toContain("₹599");
    expect(await runDailySummary(now)).toEqual({ sent: false, reason: "already-sent" });
    expect(await runDailySummary(new Date(now.getTime() + 24 * HOUR))).toEqual({ sent: true });
  });
});

describe("abandoned-cart", () => {
  async function shopperWithBag(hoursAgo: number) {
    const user = await createUser({ name: "Ravi K" });
    const p = await createProduct({ name: `Bag Tee ${hoursAgo}`, variants: [{ size: "L", colorName: "White", stock: 5 }] });
    await addItem({ userId: user.id }, p.variants[0].id, 1);
    await db.cartItem.updateMany({ where: { cart: { userId: user.id } }, data: { updatedAt: new Date(Date.now() - hoursAgo * HOUR) } });
    return user;
  }

  it("reminds signed-in carts idle for 3–48 hours, once", async () => {
    const due = await shopperWithBag(5);
    await shopperWithBag(1);
    await shopperWithBag(50);
    const ordered = await shopperWithBag(6);
    await createOrderRow(ordered.id, { status: "PAID" });
    expect(await runAbandonedCart()).toEqual({ sent: 1 });
    expect(outbox().sent.map((m) => m.to)).toEqual([due.email]);
    expect(await runAbandonedCart()).toEqual({ sent: 0 });
  });

  it("scans carts in a deterministic order, least recently updated first (M3)", async () => {
    const orig = db.cart.findMany;
    const seen: unknown[] = [];
    db.cart.findMany = ((args: unknown) => {
      seen.push(args);
      return orig.call(db.cart, args as never);
    }) as typeof db.cart.findMany;
    try {
      await shopperWithBag(5);
      await runAbandonedCart();
    } finally {
      db.cart.findMany = orig;
    }
    expect(seen[0]).toMatchObject({ orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 500 });
  });

  it("respects the setting", async () => {
    await settings({ abandonedCartEnabled: false });
    await shopperWithBag(5);
    expect(await runAbandonedCart()).toEqual({ sent: 0, reason: "disabled" });
  });
});

describe("reconcile-payments", () => {
  /** A provider whose order-payment lookup is stubbed per provider order id. */
  function stubProvider(byOrder: Record<string, ProviderPayment[] | Error>) {
    const p = new MockProvider();
    const calls: string[] = [];
    p.fetchOrderPayments = async (id: string) => {
      calls.push(id);
      const v = byOrder[id] ?? [];
      if (v instanceof Error) throw v;
      return v;
    };
    return { provider: p, calls };
  }

  async function pendingOrder(qty = 2, stock = 5) {
    const user = await createUser();
    const product = await createProduct({ variants: [{ size: "M", colorName: "Black", stock }] });
    const address = await createAddress(user.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await addItem({ userId: user.id }, product.variants[0].id, qty);
    const placed = await placeOrder(user.id, { addressId: address.id });
    return { placed, variantId: product.variants[0].id };
  }
  const stockOf = async (id: string) => (await db.productVariant.findUniqueOrThrow({ where: { id } })).stock;

  it("marks a pending order paid from a captured payment whose webhook never arrived, idempotently", async () => {
    const { placed } = await pendingOrder();
    const { provider, calls } = stubProvider({
      [placed.providerOrderId]: [
        { id: "pay_failed", amountPaise: placed.amountPaise, status: "failed" },
        { id: "pay_ok", amountPaise: placed.amountPaise, status: "captured" },
      ],
    });
    expect(await runReconcilePayments(new Date(), provider)).toEqual({ checked: 1, paid: 1, attention: 0, errors: 0 });
    expect(calls).toEqual([placed.providerOrderId]);
    const o = await db.order.findUniqueOrThrow({ where: { id: placed.orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "PAID", providerPaymentId: "pay_ok" });
    expect(o.events.filter((e) => e.type === "PAID").map((e) => e.message)).toEqual(["Payment pay_ok received (reconcile)"]);
    // Paid orders drop out of the scan; a second run is a no-op.
    expect(await runReconcilePayments(new Date(), provider)).toEqual({ checked: 0, paid: 0, attention: 0, errors: 0 });
  });

  it("re-reserves stock for an expired order that was actually paid", async () => {
    const { placed, variantId } = await pendingOrder(2, 5);
    await runExpireOrders(new Date(Date.now() + ORDER_TTL_MS + 1000));
    expect(await stockOf(variantId)).toBe(5);
    const { provider } = stubProvider({ [placed.providerOrderId]: [{ id: "pay_late", amountPaise: placed.amountPaise, status: "captured" }] });
    expect(await runReconcilePayments(new Date(), provider)).toMatchObject({ checked: 1, paid: 1 });
    expect(await stockOf(variantId)).toBe(3);
    expect((await db.order.findUniqueOrThrow({ where: { id: placed.orderId } })).status).toBe("PAID");
  });

  it("flags an amount mismatch, skips uncaptured payments, and ignores stale or provider-less orders", async () => {
    const mismatch = await pendingOrder();
    const authorizedOnly = await pendingOrder();
    const stale = await pendingOrder();
    await db.order.update({ where: { id: stale.placed.orderId }, data: { createdAt: new Date(Date.now() - 49 * HOUR) } });
    const u = await createUser();
    await createOrderRow(u.id, { status: "PENDING_PAYMENT", paidAt: null }); // never reached the provider
    const { provider, calls } = stubProvider({
      [mismatch.placed.providerOrderId]: [{ id: "pay_short", amountPaise: 100, status: "captured" }],
      [authorizedOnly.placed.providerOrderId]: [{ id: "pay_auth", amountPaise: authorizedOnly.placed.amountPaise, status: "authorized" }],
      [stale.placed.providerOrderId]: [{ id: "pay_old", amountPaise: stale.placed.amountPaise, status: "captured" }],
    });
    expect(await runReconcilePayments(new Date(), provider)).toEqual({ checked: 2, paid: 0, attention: 1, errors: 0 });
    expect(calls.sort()).toEqual([mismatch.placed.providerOrderId, authorizedOnly.placed.providerOrderId].sort());
    expect(await db.order.findUniqueOrThrow({ where: { id: mismatch.placed.orderId } })).toMatchObject({ status: "PENDING_PAYMENT", needsAttention: true });
    expect((await db.order.findUniqueOrThrow({ where: { id: authorizedOnly.placed.orderId } })).status).toBe("PENDING_PAYMENT");
    expect((await db.order.findUniqueOrThrow({ where: { id: stale.placed.orderId } })).status).toBe("PENDING_PAYMENT");
    // Running again doesn't write a second ATTENTION event.
    await runReconcilePayments(new Date(), provider);
    const events = await db.orderEvent.findMany({ where: { orderId: mismatch.placed.orderId, type: "ATTENTION" } });
    expect(events).toHaveLength(1);
  });

  it("counts a provider error on one order and still reconciles the rest", async () => {
    const broken = await pendingOrder();
    const fine = await pendingOrder();
    const { provider } = stubProvider({
      [broken.placed.providerOrderId]: new Error("provider down"),
      [fine.placed.providerOrderId]: [{ id: "pay_fine", amountPaise: fine.placed.amountPaise, status: "captured" }],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runReconcilePayments(new Date(), provider)).toEqual({ checked: 2, paid: 1, attention: 0, errors: 1 });
    expect((await db.order.findUniqueOrThrow({ where: { id: fine.placed.orderId } })).status).toBe("PAID");
    expect((await db.order.findUniqueOrThrow({ where: { id: broken.placed.orderId } })).status).toBe("PENDING_PAYMENT");
  });

  it("finds a captured payment on an order cancelled while its payment window was open (M2), once", async () => {
    const { placed } = await pendingOrder();
    await db.order.update({ where: { id: placed.orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    const { provider, calls } = stubProvider({ [placed.providerOrderId]: [{ id: "pay_lost", amountPaise: placed.amountPaise, status: "captured" }] });
    expect(await runReconcilePayments(new Date(), provider)).toEqual({ checked: 1, paid: 0, attention: 1, errors: 0 });
    expect(calls).toEqual([placed.providerOrderId]);
    expect(await db.order.findUniqueOrThrow({ where: { id: placed.orderId } })).toMatchObject({ status: "CANCELLED", providerPaymentId: "pay_lost", needsAttention: true });
    // Recorded: the order leaves the scan, so later runs don't re-check it.
    expect(await runReconcilePayments(new Date(), provider)).toEqual({ checked: 0, paid: 0, attention: 0, errors: 0 });
  });

  it("checks the newest unpaid orders first, so a backlog never starves them (M3)", async () => {
    const older = await pendingOrder();
    const newer = await pendingOrder();
    const oldest = await pendingOrder();
    await db.order.update({ where: { id: older.placed.orderId }, data: { createdAt: new Date(Date.now() - 2 * HOUR) } });
    await db.order.update({ where: { id: oldest.placed.orderId }, data: { createdAt: new Date(Date.now() - 5 * HOUR) } });
    const { provider, calls } = stubProvider({});
    await runReconcilePayments(new Date(), provider);
    expect(calls).toEqual([newer.placed.providerOrderId, older.placed.providerOrderId, oldest.placed.providerOrderId]);
  });

  it("is registered as a cron job and uses the mock provider by default (no payments)", async () => {
    expect(isJobName("reconcile-payments")).toBe(true);
    await pendingOrder();
    expect(await JOBS["reconcile-payments"](new Date())).toEqual({ checked: 1, paid: 0, attention: 0, errors: 0 });
  });
});
