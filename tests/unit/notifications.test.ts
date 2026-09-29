import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { getEmail, type ConsoleEmail } from "@/server/adapters/email";
import { notifyOrder, sendToAdmin } from "@/server/services/notifications";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { markOrderPaid, placeOrder } from "@/server/services/orders";

const outbox = () => getEmail() as ConsoleEmail;
const setAdminEmail = (adminNotifyEmail: string | null) =>
  db.storeSetting.upsert({ where: { id: 1 }, update: { adminNotifyEmail }, create: { id: 1, adminNotifyEmail } });

describe("notifications", () => {
  beforeEach(async () => {
    await resetDb();
    outbox().sent.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it("emails the customer and the admin and records both", async () => {
    const u = await createUser();
    const o = await createOrderRow(u.id, { status: "PAID" });
    await setAdminEmail("owner@example.test");
    await notifyOrder(o.id, "paid");
    expect(outbox().sent.map((m) => m.to)).toEqual([o.email, "owner@example.test"]);
    expect(outbox().sent[0].subject).toMatch(/confirmed/);
    const events = await db.orderEvent.findMany({ where: { orderId: o.id } });
    expect(events.filter((e) => e.type === "EMAIL_SENT")).toHaveLength(2);
  });

  it("records EMAIL_FAILED and never throws", async () => {
    const u = await createUser();
    const o = await createOrderRow(u.id, { status: "SHIPPED" });
    vi.spyOn(outbox(), "send").mockRejectedValue(new Error("smtp down"));
    await expect(notifyOrder(o.id, "shipped")).resolves.toBeUndefined();
    expect((await db.orderEvent.findMany({ where: { orderId: o.id } })).map((e) => e.type)).toEqual(["EMAIL_FAILED"]);
    await expect(notifyOrder("missing-order", "paid")).resolves.toBeUndefined();
  });

  it("reports whether an admin email could be sent", async () => {
    await setAdminEmail(null);
    expect(await sendToAdmin({ subject: "s", html: "<p>h</p>", text: "h" })).toBe("no-recipient");
    await setAdminEmail("owner@example.test");
    expect(await sendToAdmin({ subject: "s", html: "<p>h</p>", text: "h" })).toBe("sent");
  });

  it("sends the confirmation when an order is paid", async () => {
    const user = await createUser();
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 3 }] });
    const address = await createAddress(user.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await addItem({ userId: user.id }, p.variants[0].id, 1);
    const placed = await placeOrder(user.id, { addressId: address.id });
    await markOrderPaid(placed.orderId, "pay_1", "client");
    expect(outbox().sent.some((m) => m.to === user.email && m.subject === `Order ${placed.number} confirmed`)).toBe(true);
  });
});
