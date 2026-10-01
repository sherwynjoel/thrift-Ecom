import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import type { OrderEventType } from "@/lib/order-status";
import { parseInvoiceSnapshot, type InvoiceSnapshot } from "@/lib/invoice-snapshot";

export type Tx = Prisma.TransactionClient;

export interface ShipAddress { name: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string }
export interface OrderItemView {
  id: string; productId: string | null; productName: string; productSlug: string; size: string; colorName: string;
  imageUrl: string | null; sku: string; unitPricePaise: number; quantity: number; lineTotalPaise: number;
  /** Custom-print lines: the design (null once it is purged) and URL snapshots that keep the order printable without it. */
  designId: string | null; designFrontPreviewUrl: string | null; designBackPreviewUrl: string | null;
  printFrontUrl: string | null; printBackUrl: string | null;
  printedAt: Date | null; heldAt: Date | null; holdNote: string | null;
}
export interface OrderView {
  id: string; number: string; status: OrderStatus; userId: string; email: string; createdAt: Date; expiresAt: Date;
  paidAt: Date | null; processingAt: Date | null; shippedAt: Date | null; deliveredAt: Date | null; cancelledAt: Date | null; refundedAt: Date | null;
  subtotalPaise: number; discountPaise: number; shippingPaise: number; totalPaise: number;
  couponCode: string | null; offerLabel: string | null;
  paymentProvider: string; providerOrderId: string | null; providerPaymentId: string | null;
  carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; customerNote: string | null;
  ship: ShipAddress; items: OrderItemView[]; itemCount: number;
  /** Seller/GST inputs frozen when the order was paid; null for orders paid before snapshots existed (see invoiceInputsFor). */
  invoiceSnapshot: InvoiceSnapshot | null;
}
/**
 * What a customer may see of an order (their pages, the /api/v1 order routes, emails): never the admin's print-hold
 * note, nor the full-resolution print files (admin-only; customers get the previews).
 */
const ADMIN_ONLY_ITEM_KEYS = ["heldAt", "holdNote", "printFrontUrl", "printBackUrl"] as const;
export type CustomerOrderItemView = Omit<OrderItemView, (typeof ADMIN_ONLY_ITEM_KEYS)[number]>;
export type CustomerOrderView = Omit<OrderView, "items"> & { items: CustomerOrderItemView[] };

export function toCustomerOrderView(o: OrderView): CustomerOrderView {
  return {
    ...o,
    items: o.items.map((i) => {
      const item: CustomerOrderItemView & Partial<OrderItemView> = { ...i };
      for (const k of ADMIN_ONLY_ITEM_KEYS) delete item[k];
      return item;
    }),
  };
}
export interface OrderSummary {
  id: string; number: string; status: OrderStatus; createdAt: Date; paidAt: Date | null; totalPaise: number;
  itemCount: number; firstItemName: string; firstImageUrl: string | null;
}

export const orderWithItems = { items: { orderBy: { id: "asc" as const } } } satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderWithItems }>;

export function toOrderView(o: OrderRow): OrderView {
  return {
    id: o.id, number: o.number, status: o.status, userId: o.userId, email: o.email, createdAt: o.createdAt, expiresAt: o.expiresAt,
    paidAt: o.paidAt, processingAt: o.processingAt, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt, cancelledAt: o.cancelledAt, refundedAt: o.refundedAt,
    subtotalPaise: o.subtotalPaise, discountPaise: o.discountPaise, shippingPaise: o.shippingPaise, totalPaise: o.totalPaise,
    couponCode: o.couponCode, offerLabel: o.offerLabel,
    paymentProvider: o.paymentProvider, providerOrderId: o.providerOrderId, providerPaymentId: o.providerPaymentId,
    carrier: o.carrier, trackingNumber: o.trackingNumber, trackingUrl: o.trackingUrl, customerNote: o.customerNote,
    ship: { name: o.shipName, phone: o.shipPhone, line1: o.shipLine1, line2: o.shipLine2, landmark: o.shipLandmark, city: o.shipCity, state: o.shipState, pincode: o.shipPincode },
    items: o.items.map((i) => ({
      id: i.id, productId: i.productId, productName: i.productName, productSlug: i.productSlug, size: i.size, colorName: i.colorName,
      imageUrl: i.imageUrl, sku: i.sku, unitPricePaise: i.unitPricePaise, quantity: i.quantity, lineTotalPaise: i.lineTotalPaise,
      designId: i.designId, designFrontPreviewUrl: i.designFrontPreviewUrl, designBackPreviewUrl: i.designBackPreviewUrl,
      printFrontUrl: i.printFrontUrl, printBackUrl: i.printBackUrl, printedAt: i.printedAt, heldAt: i.heldAt, holdNote: i.holdNote,
    })),
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    invoiceSnapshot: parseInvoiceSnapshot(o.invoiceSnapshot),
  };
}

export function toOrderSummary(o: OrderRow): OrderSummary {
  return {
    id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, paidAt: o.paidAt, totalPaise: o.totalPaise,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    firstItemName: o.items[0]?.productName ?? "",
    firstImageUrl: o.items.find((i) => i.imageUrl)?.imageUrl ?? null,
  };
}

export function orderDiscountLabel(o: { couponCode: string | null; offerLabel: string | null }): string | null {
  if (o.couponCode) return `Code ${o.couponCode}`;
  if (o.offerLabel) return `Offer: ${o.offerLabel}`;
  return null;
}

export async function addOrderEvent(tx: Tx, orderId: string, type: OrderEventType, message: string, actorId?: string | null): Promise<void> {
  await tx.orderEvent.create({ data: { orderId, type, message: message.slice(0, 1000), actorId: actorId ?? null } });
}

/**
 * Flags an order for attention exactly once: the update only takes effect while `needsAttention` is
 * still false, so concurrent callers (a webhook and a client verify racing, a webhook retry, two
 * failed refund attempts) can't both write an ATTENTION event. Runs inside `tx` when given, else in
 * its own transaction. Returns whether this call was the one that flagged it.
 */
export async function flagAttentionOnce(orderId: string, message: string, opts: { tx?: Tx; actorId?: string | null } = {}): Promise<boolean> {
  const run = async (tx: Tx) => {
    const u = await tx.order.updateMany({ where: { id: orderId, needsAttention: false }, data: { needsAttention: true } });
    if (u.count !== 1) return false;
    await addOrderEvent(tx, orderId, "ATTENTION", message, opts.actorId);
    return true;
  };
  return opts.tx ? run(opts.tx) : db.$transaction(run);
}

export async function getOrderById(id: string): Promise<OrderView> {
  const o = await db.order.findUnique({ where: { id }, include: orderWithItems });
  if (!o) throw new NotFoundError("Order");
  return toOrderView(o);
}
