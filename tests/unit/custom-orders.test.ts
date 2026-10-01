import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SlipDocument } from "@/components/print/slip-document";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDesignRow, createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { getOrderById } from "@/server/services/order-records";
import { markOrderPaid, placeOrder } from "@/server/services/orders";
import { checkoutFormKey, getCheckoutView, previewCartPricing } from "@/server/services/checkout";
import { getSettings } from "@/server/services/settings";
import { StockChangedError } from "@/server/errors";
import { absoluteUrl, orderConfirmationEmail, siteUrl } from "@/server/emails/templates";
import { invoiceFromOrder } from "@/lib/gst";

const ADDRESS = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };

async function setup(stock = 5) {
  await getSettings();
  await db.storeSetting.update({ where: { id: 1 }, data: { customFrontFeePaise: 0, customBackFeePaise: 14900 } });
  const user = await createUser();
  const product = await createProduct({ slug: "blank-tee", basePricePaise: 54900, isCustomizable: true, variants: [{ size: "M", colorName: "Black", stock }] });
  const variant = product.variants[0];
  const address = await createAddress(user.id, ADDRESS);
  const design = await createDesignRow({ productId: product.id, userId: user.id, backPrintKey: "designs/print/b.png", backPreviewKey: "designs/previews/b.png" });
  return { user, product, variant, address, design };
}

describe("custom lines in checkout and orders", () => {
  beforeEach(resetDb);

  it("snapshots price with fees, previews and print files", async () => {
    const { user, variant, address, design } = await setup();
    await addItem({ userId: user.id }, variant.id, 1);
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    const view = await getCheckoutView(user.id);
    expect(view.lines.map((l) => [l.unitPricePaise, l.customLabel])).toEqual([[54900, null], [69800, "Custom print: front + back"]]);
    const pay = await placeOrder(user.id, { addressId: address.id });
    const order = await getOrderById(pay.orderId);
    expect(order.subtotalPaise).toBe(124700);
    expect(order.items.find((i) => i.designId === design.id)).toMatchObject({
      unitPricePaise: 69800,
      imageUrl: "/api/uploads/designs/previews/f.png",
      designFrontPreviewUrl: "/api/uploads/designs/previews/f.png",
      designBackPreviewUrl: "/api/uploads/designs/previews/b.png",
      printFrontUrl: "/api/uploads/designs/print/f.png",
      printBackUrl: "/api/uploads/designs/print/b.png",
      printedAt: null,
      heldAt: null,
    });
    expect(order.items.find((i) => i.designId === null)).toMatchObject({ unitPricePaise: 54900, printFrontUrl: null, printBackUrl: null });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(3);
  });

  it("leaves custom lines out of offers unless the offer includes them", async () => {
    const { user, variant, design } = await setup();
    await db.offer.create({ data: { label: "Any 2 for ₹999", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900 } });
    await addItem({ userId: user.id }, variant.id, 1);
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    expect((await getCheckoutView(user.id)).price).toMatchObject({ offer: null, discountPaise: 0, subtotalPaise: 124700 });
    await db.offer.updateMany({ data: { includeCustom: true } });
    expect((await getCheckoutView(user.id)).price).toMatchObject({ applied: "offer", discountPaise: 124700 - 99900 });
  });

  it("clears only the ordered lines when the order is paid", async () => {
    const { user, product, variant, address, design } = await setup();
    await addItem({ userId: user.id }, variant.id, 1);
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    const pay = await placeOrder(user.id, { addressId: address.id });
    const later = await createDesignRow({ productId: product.id, userId: user.id });
    await addItem({ userId: user.id }, variant.id, 1, { designId: later.id });
    await markOrderPaid(pay.orderId, "pay_custom_1", "mock");
    const left = await db.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(left.map((i) => i.designId)).toEqual([later.id]);
  });

  it("reconciles stock across plain and custom lines of one variant", async () => {
    const { user, variant, address, design } = await setup(2);
    await addItem({ userId: user.id }, variant.id, 1);
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 1 } });
    await expect(placeOrder(user.id, { addressId: address.id })).rejects.toBeInstanceOf(StockChangedError);
    const left = await db.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(left.map((i) => [i.designId, i.quantity])).toEqual([[null, 1]]);
  });

  it("shows the design in the confirmation email and marks it on the invoice", async () => {
    const { user, variant, address, design } = await setup();
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    const order = await getOrderById((await placeOrder(user.id, { addressId: address.id })).orderId);
    const mail = orderConfirmationEmail(order);
    expect(mail.html).toContain(`src="${siteUrl()}/api/uploads/designs/previews/f.png"`);
    expect(mail.html).toContain("Custom print: front + back");
    expect(mail.text).toContain("Custom print: front + back");
    expect(absoluteUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    const invoice = invoiceFromOrder(order, await getSettings());
    expect(invoice.lines[0].description).toContain("custom print");
    const slip = renderToStaticMarkup(createElement(SlipDocument, { order, settings: await getSettings(), last: true }));
    expect(slip).toContain('src="/api/uploads/designs/previews/f.png"');
    expect(slip).toContain('src="/api/uploads/designs/previews/b.png"');
  });

  it("reuses the open order for an identical retry and supersedes it when the design line changes", async () => {
    const { user, product, variant, address, design } = await setup();
    await addItem({ userId: user.id }, variant.id, 1);
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    const first = await placeOrder(user.id, { addressId: address.id });
    const again = await placeOrder(user.id, { addressId: address.id });
    expect(again.orderId).toBe(first.orderId);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(3);

    // Same variant, same quantities, same total — but a different design: a new order, not the old one.
    await db.cartItem.deleteMany({ where: { designId: design.id } });
    const other = await createDesignRow({ productId: product.id, userId: user.id, backPrintKey: "designs/print/b2.png", backPreviewKey: "designs/previews/b2.png" });
    await addItem({ userId: user.id }, variant.id, 1, { designId: other.id });
    const third = await placeOrder(user.id, { addressId: address.id });
    expect(third.orderId).not.toBe(first.orderId);
    expect((await db.order.findUniqueOrThrow({ where: { id: first.orderId } })).status).toBe("EXPIRED");
    expect((await getOrderById(third.orderId)).items.map((i) => i.designId).sort()).toEqual([null, other.id].sort());
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(3);
  });

  it("counts the user's own pending hold once across the plain and custom lines of a variant", async () => {
    const { user, variant, address, design } = await setup(2);
    await addItem({ userId: user.id }, variant.id, 1);
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    await placeOrder(user.id, { addressId: address.id }); // holds both units: stock is now 0
    const view = await getCheckoutView(user.id);
    expect(view.stockIssues).toEqual([]);
    expect(view.lines.map((l) => [l.designId, l.quantity])).toEqual([[null, 1], [design.id, 1]]);
  });

  it("charges print fees in the cart pricing preview", async () => {
    const { product, variant } = await setup();
    const guestDesign = await createDesignRow({ productId: product.id, cartToken: "guest-custom", backPrintKey: "designs/print/b.png" });
    await addItem({ guestToken: "guest-custom" }, variant.id, 1, { designId: guestDesign.id });
    expect(await previewCartPricing({ guestToken: "guest-custom" })).toMatchObject({ discountedSubtotalPaise: 69800 });
  });

  it("keeps a plain line added later when the ordered custom item's design row is gone", async () => {
    const { user, variant, address, design } = await setup();
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    const pay = await placeOrder(user.id, { addressId: address.id });
    await db.design.delete({ where: { id: design.id } }); // cascades its bag line; the order item keeps its snapshots
    await addItem({ userId: user.id }, variant.id, 1);
    const order = await getOrderById(pay.orderId);
    expect(order.items[0]).toMatchObject({ designId: null, printFrontUrl: "/api/uploads/designs/print/f.png" });
    await markOrderPaid(pay.orderId, "pay_custom_2", "mock");
    const left = await db.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(left.map((i) => [i.designId, i.quantity])).toEqual([[null, 1]]);
  });

  it("keys checkout lines by variant and design", () => {
    const line = { variantId: "v1", productId: "p1", productName: "T", productSlug: "t", imageUrl: null, size: "M", colorName: "Black", unitPricePaise: 54900, quantity: 1, lineTotalPaise: 54900, designId: null, customLabel: null };
    expect(checkoutFormKey({ lines: [line, { ...line, designId: "d1" }] })).not.toBe(checkoutFormKey({ lines: [line, { ...line, designId: "d2" }] }));
  });
});
