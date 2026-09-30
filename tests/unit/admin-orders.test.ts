import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { markOrderPaid, placeOrder } from "@/server/services/orders";
import { getEmail, type ConsoleEmail } from "@/server/adapters/email";
import { getPaymentProvider } from "@/server/payments";
import {
  adminCancelOrder, advanceOrderStatus, bulkMarkProcessing, clearAttention, countToShip, exportOrdersCsv, getAdminOrder, listAdminOrders, refundOrder, saveTracking, setAdminNote,
} from "@/server/services/admin-orders";
import { ConflictError, ValidationError } from "@/server/errors";

const DAY = 86_400_000;

async function paidOrder(qty = 1) {
  const user = await createUser({ name: "Asha Rao" });
  const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
  const address = await createAddress(user.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
  await addItem({ userId: user.id }, p.variants[0].id, qty);
  const placed = await placeOrder(user.id, { addressId: address.id });
  await markOrderPaid(placed.orderId, "mock_pay_1", "client");
  return { user, variantId: p.variants[0].id, orderId: placed.orderId, number: placed.number };
}
const stockOf = async (id: string) => (await db.productVariant.findUniqueOrThrow({ where: { id } })).stock;

describe("admin orders list", () => {
  beforeEach(resetDb);

  it("defaults to To ship, oldest paid first, with tab counts and age", async () => {
    const u = await createUser();
    const now = new Date();
    const old = await createOrderRow(u.id, { status: "PAID", paidAt: new Date(now.getTime() - 3 * DAY) });
    const fresh = await createOrderRow(u.id, { status: "PROCESSING", paidAt: now });
    await createOrderRow(u.id, { status: "SHIPPED" });
    await createOrderRow(u.id, { status: "PENDING_PAYMENT", paidAt: null });
    await createOrderRow(u.id, { status: "EXPIRED", paidAt: null, needsAttention: true });
    const list = await listAdminOrders({}, now);
    expect(list.activeTab).toBe("to-ship");
    expect(list.items.map((r) => r.id)).toEqual([old.id, fresh.id]);
    expect(list.items[0].unshippedDays).toBe(3);
    expect(Object.fromEntries(list.tabs.map((t) => [t.id, t.count]))).toEqual({ "to-ship": 2, pending: 1, shipped: 1, delivered: 0, closed: 1, all: 5 });
    expect(list.attentionCount).toBe(1);
    expect((await listAdminOrders({ attention: true, tab: "all" })).items).toHaveLength(1);
  });

  it("searches across all statuses by number, name, email, phone and pincode", async () => {
    const u = await createUser();
    const a = await createOrderRow(u.id, { status: "SHIPPED", number: "ORD-2001", shipName: "Meera Iyer", shipPhone: "9123456780", shipPincode: "600002" });
    await createOrderRow(u.id, { status: "PAID", number: "ORD-2002" });
    for (const q of ["ord-2001", "meera", "91234", "600002"]) {
      const r = await listAdminOrders({ q });
      expect(r.activeTab).toBe("all");
      expect(r.items.map((x) => x.id)).toEqual([a.id]);
    }
  });
});

describe("admin order actions", () => {
  beforeEach(async () => {
    await resetDb();
    (getEmail() as ConsoleEmail).sent.length = 0;
  });

  it("moves forward only, fills timestamps and emails on shipped", async () => {
    const { orderId } = await paidOrder();
    await advanceOrderStatus(orderId, "PROCESSING", null);
    await expect(advanceOrderStatus(orderId, "PROCESSING", null)).rejects.toBeInstanceOf(ConflictError);
    await advanceOrderStatus(orderId, "DELIVERED", null);
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("DELIVERED");
    expect(o.processingAt && o.shippedAt && o.deliveredAt).toBeTruthy();
    expect((getEmail() as ConsoleEmail).sent.map((m) => m.subject)).toEqual(expect.arrayContaining([expect.stringMatching(/was delivered/)]));
    const u = await createUser();
    const pending = await createOrderRow(u.id, { status: "PENDING_PAYMENT", paidAt: null });
    await expect(advanceOrderStatus(pending.id, "SHIPPED", null)).rejects.toBeInstanceOf(ConflictError);
  });

  it("saves tracking, builds the URL and marks shipped", async () => {
    const { orderId, number } = await paidOrder();
    await expect(saveTracking(orderId, { carrier: "delhivery", trackingNumber: "x" }, null, { markShipped: true })).rejects.toBeInstanceOf(ValidationError);
    await saveTracking(orderId, { carrier: "delhivery", trackingNumber: "AWB123456", trackingUrl: "" }, "admin-1", { markShipped: true });
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "SHIPPED", carrier: "Delhivery", trackingNumber: "AWB123456", trackingUrl: "https://www.delhivery.com/track/package/AWB123456" });
    expect(o.events.map((e) => e.type)).toEqual(expect.arrayContaining(["TRACKING_UPDATED", "STATUS_CHANGED", "EMAIL_SENT"]));
    expect((getEmail() as ConsoleEmail).sent.some((m) => m.subject === `Order ${number} has shipped`)).toBe(true);
  });

  it("refuses tracking on unpaid or cancelled orders", async () => {
    const u = await createUser();
    const pending = await createOrderRow(u.id, { status: "PENDING_PAYMENT", paidAt: null });
    const cancelled = await createOrderRow(u.id, { status: "CANCELLED" });
    for (const o of [pending, cancelled]) {
      await expect(saveTracking(o.id, { carrier: "dtdc", trackingNumber: "D1234567" }, null, { markShipped: false })).rejects.toBeInstanceOf(ConflictError);
    }
    expect((await db.order.findUniqueOrThrow({ where: { id: cancelled.id } })).trackingNumber).toBeNull();
  });

  it("records notes, clears attention and shows actor names on the timeline", async () => {
    const admin = await createUser({ name: "Owner", role: "ADMIN" });
    const { orderId } = await paidOrder();
    await db.order.update({ where: { id: orderId }, data: { needsAttention: true } });
    await setAdminNote(orderId, "Customer wants XL instead", admin.id);
    await clearAttention(orderId, admin.id);
    const d = await getAdminOrder(orderId);
    expect(d).toMatchObject({ adminNote: "Customer wants XL instead", needsAttention: false, customer: { name: "Asha Rao", paidOrderCount: 1 } });
    expect(d.events[0].actorName).toBe("Owner");
  });

  it("bulk-marks only paid orders as processing", async () => {
    const a = await paidOrder();
    const u = await createUser();
    const shipped = await createOrderRow(u.id, { status: "SHIPPED" });
    expect(await bulkMarkProcessing([a.orderId, shipped.id, "missing"], null)).toBe(1);
    expect(await countToShip()).toBe(1);
  });

  it("cancels before shipping with restock, and refuses once shipped", async () => {
    const a = await paidOrder(2);
    await adminCancelOrder(a.orderId, "Customer asked", null);
    expect(await stockOf(a.variantId)).toBe(5);
    const o = await db.order.findUniqueOrThrow({ where: { id: a.orderId }, include: { events: true } });
    expect(o.status).toBe("CANCELLED");
    expect(o.events.some((e) => e.message.includes("Customer asked"))).toBe(true);
    await expect(adminCancelOrder(a.orderId, "", null)).rejects.toBeInstanceOf(ConflictError);
    const b = await paidOrder(1);
    await advanceOrderStatus(b.orderId, "SHIPPED", null);
    await expect(adminCancelOrder(b.orderId, "", null)).rejects.toBeInstanceOf(ConflictError);
    await expect(adminCancelOrder(b.orderId, "x".repeat(201), null)).rejects.toBeInstanceOf(ValidationError);
  });

  it("refunds through the provider and restocks unshipped orders only", async () => {
    const a = await paidOrder(2);
    expect(await stockOf(a.variantId)).toBe(3);
    const r = await refundOrder(a.orderId, null);
    expect(r.refundId).toMatch(/^mock_refund_/);
    expect(await stockOf(a.variantId)).toBe(5);
    const o = await db.order.findUniqueOrThrow({ where: { id: a.orderId }, include: { events: true } });
    expect(o.status).toBe("REFUNDED");
    expect(o.events.find((e) => e.type === "REFUNDED")?.message).toContain(r.refundId!);
    const b = await paidOrder(1);
    await advanceOrderStatus(b.orderId, "SHIPPED", null);
    await refundOrder(b.orderId, null);
    expect(await stockOf(b.variantId)).toBe(4);
    await expect(refundOrder(b.orderId, null)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refunds a cancelled order's payment without restocking it a second time", async () => {
    const a = await paidOrder(2);
    await adminCancelOrder(a.orderId, "", null);
    expect(await stockOf(a.variantId)).toBe(5);
    const r = await refundOrder(a.orderId, null);
    expect(r.refundId).toMatch(/^mock_refund_/);
    expect(await stockOf(a.variantId)).toBe(5);
    const u = await createUser();
    const unpaidCancel = await createOrderRow(u.id, { status: "CANCELLED", paidAt: null });
    await expect(refundOrder(unpaidCancel.id, null)).rejects.toBeInstanceOf(ConflictError);
  });

  it("records a manual refund when the order was paid through another provider", async () => {
    const a = await paidOrder(1);
    await db.order.update({ where: { id: a.orderId }, data: { paymentProvider: "razorpay" } });
    const r = await refundOrder(a.orderId, null);
    expect(r.refundId).toBeNull();
    const ev = await db.orderEvent.findFirstOrThrow({ where: { orderId: a.orderId, type: "REFUNDED" } });
    expect(ev.message).toMatch(/outside the store/);
    expect(await stockOf(a.variantId)).toBe(5);
  });

  it("leaves the order untouched when the provider refund fails", async () => {
    const a = await paidOrder(1);
    const provider = getPaymentProvider();
    const original = provider.refund;
    provider.refund = async () => {
      throw new Error("provider down");
    };
    try {
      await expect(refundOrder(a.orderId, null)).rejects.toThrow("provider down");
    } finally {
      provider.refund = original;
    }
    expect((await db.order.findUniqueOrThrow({ where: { id: a.orderId } })).status).toBe("PAID");
    expect(await stockOf(a.variantId)).toBe(4);
  });

  it("refunds exactly once when two refunds race", async () => {
    const a = await paidOrder(2);
    const provider = getPaymentProvider();
    const original = provider.refund;
    let calls = 0;
    provider.refund = async (paymentId: string, amountPaise: number) => {
      calls++;
      return original.call(provider, paymentId, amountPaise);
    };
    let results: PromiseSettledResult<{ refundId: string | null }>[];
    try {
      results = await Promise.allSettled([refundOrder(a.orderId, null), refundOrder(a.orderId, null)]);
    } finally {
      provider.refund = original;
    }
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictError);
    expect(calls).toBe(1);
    expect(await stockOf(a.variantId)).toBe(5);
    expect(await db.orderEvent.count({ where: { orderId: a.orderId, type: "REFUNDED" } })).toBe(1);
  });

  it("exports CSV with rupee amounts and safe cells", async () => {
    const u = await createUser();
    const o = await createOrderRow(u.id, { status: "PAID", number: "ORD-3001", shipName: "=HYPERLINK(\"x\")", totalPaise: 54950 });
    const csv = await exportOrdersCsv({ ids: [o.id] });
    const [header, row] = csv.trim().split("\r\n");
    expect(header.startsWith("Order,Placed (IST),Status,Customer,Phone")).toBe(true);
    expect(row).toContain("ORD-3001");
    expect(row).toContain("549.50");
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("exports all orders matching a filter when no ids are given", async () => {
    const u = await createUser();
    await createOrderRow(u.id, { status: "PAID", number: "ORD-4001" });
    await createOrderRow(u.id, { status: "SHIPPED", number: "ORD-4002" });
    const csv = await exportOrdersCsv({ tab: "to-ship" });
    expect(csv).toContain("ORD-4001");
    expect(csv).not.toContain("ORD-4002");
  });
});
