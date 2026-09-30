import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { expireStaleOrders, getOrderForUser, markOrderPaid, ORDER_TTL_MS, placeOrder } from "@/server/services/orders";
import { getSettings } from "@/server/services/settings";
import { invoiceFromOrder } from "@/lib/gst";
import { invoiceInputsFor, invoiceSnapshotFrom, parseInvoiceSnapshot } from "@/lib/invoice-snapshot";
import { InvoiceDocument } from "@/components/print/invoice-document";

const ADDRESS = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };
const SELLER = { sellerName: "Thread Co", sellerAddress: "1 Mill Road, Bengaluru", sellerState: "Karnataka", gstin: null, gstRateLowPct: 5, gstRateHighPct: 18, gstThresholdPaise: 250000 };

async function placed(price = 59900) {
  const user = await createUser();
  const product = await createProduct({ basePricePaise: price, variants: [{ size: "M", colorName: "Black", stock: 5 }] });
  const address = await createAddress(user.id, ADDRESS);
  await addItem({ userId: user.id }, product.variants[0].id, 1);
  const p = await placeOrder(user.id, { addressId: address.id });
  return { user, p };
}

const render = (order: Awaited<ReturnType<typeof getOrderForUser>>, settings: Awaited<ReturnType<typeof getSettings>>) =>
  renderToStaticMarkup(createElement(InvoiceDocument, { order, settings, last: true }));

describe("invoice snapshot (I3)", () => {
  beforeEach(async () => {
    await resetDb();
    await getSettings();
    await db.storeSetting.update({ where: { id: 1 }, data: SELLER });
  });

  it("freezes seller and GST inputs at payment, so later settings changes never alter the issued invoice", async () => {
    const { user, p } = await placed();
    await markOrderPaid(p.orderId, "pay_1", "client");
    const before = await getOrderForUser(user.id, p.number);
    expect(before.invoiceSnapshot).toMatchObject({ ...SELLER, v: 1, invoiceDate: before.paidAt!.toISOString() });
    const beforeHtml = render(before, await getSettings());
    const beforeInvoice = invoiceFromOrder(before, invoiceInputsFor(before, await getSettings()));
    expect(beforeInvoice.intraState).toBe(true);
    expect(beforeInvoice.lines[0].ratePct).toBe(5);

    // The owner registers for GST, moves state and changes the slab afterwards.
    await db.storeSetting.update({
      where: { id: 1 },
      data: { sellerName: "New Name Pvt Ltd", sellerState: "Maharashtra", gstin: "27ABCDE1234F1Z5", gstRateLowPct: 12, gstThresholdPaise: 10000 },
    });
    const after = await getOrderForUser(user.id, p.number);
    const now = await getSettings();
    expect(invoiceFromOrder(after, invoiceInputsFor(after, now))).toEqual(beforeInvoice);
    const afterHtml = render(after, now);
    expect(afterHtml).toBe(beforeHtml);
    expect(afterHtml).toContain("Thread Co");
    expect(afterHtml).not.toContain("27ABCDE1234F1Z5");
    expect(afterHtml).not.toContain("Tax Invoice");
  });

  it("also snapshots when a late payment lands on an expired order", async () => {
    const { user, p } = await placed();
    await expireStaleOrders(new Date(Date.now() + ORDER_TTL_MS + 1000));
    expect((await markOrderPaid(p.orderId, "pay_late", "webhook")).outcome).toBe("paid");
    expect((await getOrderForUser(user.id, p.number)).invoiceSnapshot).toMatchObject({ sellerName: "Thread Co", gstRateLowPct: 5 });
  });

  it("falls back to the current settings for orders paid before snapshots existed", async () => {
    const { user, p } = await placed();
    await markOrderPaid(p.orderId, "pay_1", "client");
    await db.$executeRaw`UPDATE "Order" SET "invoiceSnapshot" = NULL WHERE id = ${p.orderId}`;
    await db.storeSetting.update({ where: { id: 1 }, data: { gstin: "29ABCDE1234F1Z5" } });
    const order = await getOrderForUser(user.id, p.number);
    expect(order.invoiceSnapshot).toBeNull();
    const html = render(order, await getSettings());
    expect(html).toContain("Tax Invoice");
    expect(html).toContain("29ABCDE1234F1Z5");
  });

  it("marks a refunded order's invoice REFUNDED with the refund date (M13)", async () => {
    const { user, p } = await placed();
    await markOrderPaid(p.orderId, "pay_1", "client");
    const paid = render(await getOrderForUser(user.id, p.number), await getSettings());
    expect(paid).not.toContain("REFUNDED");
    await db.order.update({ where: { id: p.orderId }, data: { status: "REFUNDED", refundedAt: new Date("2026-10-02T06:00:00Z") } });
    const html = render(await getOrderForUser(user.id, p.number), await getSettings());
    expect(html).toContain('data-testid="invoice-refunded"');
    expect(html).toMatch(/Refunded on 2 Oct 2026/);
  });
});

describe("parseInvoiceSnapshot", () => {
  it("round-trips a snapshot and rejects malformed JSON", () => {
    const snap = invoiceSnapshotFrom({ ...SELLER, gstin: "" }, new Date("2026-10-01T00:00:00Z"));
    expect(snap.gstin).toBeNull();
    expect(parseInvoiceSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    for (const bad of [null, 1, "x", [], { ...snap, v: 2 }, { ...snap, gstRateLowPct: "5" }, { ...snap, invoiceDate: "nope" }]) {
      expect(parseInvoiceSnapshot(bad)).toBeNull();
    }
  });
});
