import type { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, PaymentError, StockChangedError, ValidationError, type StockIssue } from "@/server/errors";
import { getPaymentProvider, type ProviderName } from "@/server/payments";
import { quote } from "@/server/services/promotions";
import { addOrderEvent, orderWithItems, toOrderSummary, toOrderView, type OrderSummary, type OrderView, type Tx } from "@/server/services/order-records";
import type { Page } from "@/server/services/catalog";
import { canCancel, isPaidStatus, ORDER_STATUS_LABEL, TO_SHIP_STATUSES, type OrderEventType } from "@/lib/order-status";
import { formatPaise } from "@/lib/money";
import { variantImageUrl } from "@/lib/variant-image";
import type { PricingLine } from "@/lib/pricing";

export { variantImageUrl };

export const ORDER_TTL_MS = 30 * 60 * 1000;
export const MIN_ORDER_PAISE = 100;

export const placeOrderSchema = z.object({
  addressId: z.string().min(1, "Choose a delivery address"),
  couponCode: z.string().trim().max(40).nullish(),
  customerNote: z.string().trim().max(300, "Keep the note under 300 characters").nullish(),
});
export type PlaceOrderInput = z.input<typeof placeOrderSchema>;

export interface CheckoutPayload {
  orderId: string; number: string; amountPaise: number; currency: "INR"; provider: ProviderName;
  providerOrderId: string; keyId: string | null; prefill: { name: string; email: string; contact: string };
}

const checkoutLineInclude = {
  variant: {
    include: {
      product: { include: { images: { orderBy: { sortOrder: "asc" as const } }, collections: { select: { collectionId: true } } } },
    },
  },
} satisfies Prisma.CartItemInclude;
export type CheckoutLineRow = Prisma.CartItemGetPayload<{ include: typeof checkoutLineInclude }>;

export async function loadCheckoutLines(userId: string): Promise<CheckoutLineRow[]> {
  return db.cartItem.findMany({ where: { cart: { userId } }, orderBy: { createdAt: "asc" }, include: checkoutLineInclude });
}

export function unitPriceOf(l: CheckoutLineRow): number {
  return l.variant.pricePaise ?? l.variant.product.basePricePaise;
}

export function lineName(l: CheckoutLineRow): string {
  return `${l.variant.product.name} (${l.variant.colorName} / ${l.variant.size})`;
}

export function toPricingLines(rows: CheckoutLineRow[]): PricingLine[] {
  return rows.map((l) => ({ unitPricePaise: unitPriceOf(l), quantity: l.quantity, collectionIds: l.variant.product.collections.map((c) => c.collectionId) }));
}

export async function reconcileCartStock(rows: CheckoutLineRow[]): Promise<{ rows: CheckoutLineRow[]; issues: StockIssue[] }> {
  const kept: CheckoutLineRow[] = [];
  const issues: StockIssue[] = [];
  for (const l of rows) {
    const available = l.variant.product.status === "ACTIVE" ? Math.max(0, l.variant.stock) : 0;
    if (l.quantity <= available) {
      kept.push(l);
      continue;
    }
    issues.push({ variantId: l.variantId, name: lineName(l), requested: l.quantity, available });
    if (available === 0) {
      await db.cartItem.delete({ where: { id: l.id } });
    } else {
      await db.cartItem.update({ where: { id: l.id }, data: { quantity: available } });
      kept.push({ ...l, quantity: available });
    }
  }
  return { rows: kept, issues };
}

async function nextOrderNumber(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
  return `ORD-${rows[0].n.toString()}`;
}

function snapshot(l: CheckoutLineRow) {
  const p = l.variant.product;
  const unit = unitPriceOf(l);
  return {
    productId: p.id, variantId: l.variantId, productName: p.name, productSlug: p.slug, size: l.variant.size,
    colorName: l.variant.colorName, imageUrl: variantImageUrl(p.images, l.variant.colorName), sku: l.variant.sku,
    unitPricePaise: unit, quantity: l.quantity, lineTotalPaise: unit * l.quantity,
  };
}

export async function placeOrder(userId: string, input: unknown): Promise<CheckoutPayload> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodFieldErrors(parsed.error));
  const { addressId, couponCode, customerNote } = parsed.data;

  await expireStaleOrders().catch((err) => console.error("[orders] opportunistic expiry failed", err));

  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new NotFoundError("User");
  const address = await db.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new ValidationError({ addressId: ["Choose a delivery address"] });

  const loaded = await loadCheckoutLines(userId);
  if (loaded.length === 0) throw new ValidationError({ cart: ["Your bag is empty"] });
  const { rows, issues } = await reconcileCartStock(loaded);
  if (issues.length) throw new StockChangedError(issues);

  const now = new Date();
  const price = await quote({ lines: toPricingLines(rows), couponCode, userId, now });
  if (couponCode?.trim() && price.couponError) throw new ValidationError({ couponCode: [price.couponError] });
  if (price.totalPaise < MIN_ORDER_PAISE) throw new ValidationError({ couponCode: ["Order total must be at least ₹1"] });

  const provider = getPaymentProvider();

  const order = await db.$transaction(async (tx) => {
    for (const l of rows) {
      const r = await tx.productVariant.updateMany({ where: { id: l.variantId, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
      if (r.count !== 1) {
        const fresh = await tx.productVariant.findUnique({ where: { id: l.variantId }, select: { stock: true } });
        throw new StockChangedError([{ variantId: l.variantId, name: lineName(l), requested: l.quantity, available: fresh?.stock ?? 0 }]);
      }
    }
    const number = await nextOrderNumber(tx);
    return tx.order.create({
      data: {
        number, userId, email: user.email, status: "PENDING_PAYMENT",
        shipName: address.fullName, shipPhone: address.phone, shipLine1: address.line1, shipLine2: address.line2,
        shipLandmark: address.landmark, shipCity: address.city, shipState: address.state, shipPincode: address.pincode,
        subtotalPaise: price.subtotalPaise, discountPaise: price.discountPaise, shippingPaise: price.shippingPaise, totalPaise: price.totalPaise,
        couponCode: price.applied === "coupon" && price.coupon ? price.coupon.code : null,
        offerLabel: price.applied === "offer" && price.offer ? price.offer.label : null,
        paymentProvider: provider.name,
        customerNote: customerNote?.trim() || null,
        expiresAt: new Date(now.getTime() + ORDER_TTL_MS),
        items: { create: rows.map(snapshot) },
        events: { create: { type: "CREATED", message: `Order placed for ${formatPaise(price.totalPaise)}` } },
      },
    });
  });

  let providerOrderId: string;
  try {
    providerOrderId = (await provider.createOrder({ amountPaise: order.totalPaise, receipt: order.number, notes: { orderId: order.id, number: order.number } })).id;
  } catch (err) {
    console.error("[orders] provider createOrder failed", order.number, err);
    await releaseOrder(order.id, ["PENDING_PAYMENT"], "CANCELLED", "PAYMENT_FAILED", "Could not start the payment; order cancelled and stock released");
    throw err instanceof PaymentError ? err : new PaymentError("Could not start the payment. Please try again.");
  }
  await db.order.update({ where: { id: order.id }, data: { providerOrderId } });

  return {
    orderId: order.id, number: order.number, amountPaise: order.totalPaise, currency: "INR", provider: provider.name,
    providerOrderId, keyId: provider.publicKey, prefill: { name: address.fullName, email: user.email, contact: address.phone },
  };
}

/**
 * Restocks every item of an order whose variant still exists. Shared by `releaseOrder` (cancel /
 * expire, below) and Task 9's `refundOrder` — the only two places stock is ever put back.
 */
export async function restockOrderItems(tx: Tx, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({ where: { orderId, variantId: { not: null } }, select: { variantId: true, quantity: true } });
  for (const it of items) {
    await tx.productVariant.updateMany({ where: { id: it.variantId! }, data: { stock: { increment: it.quantity } } });
  }
}

export async function releaseOrder(
  orderId: string, from: OrderStatus[], to: "CANCELLED" | "EXPIRED", eventType: OrderEventType, message: string, actorId?: string | null,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const r = await tx.order.updateMany({ where: { id: orderId, status: { in: from } }, data: { status: to, ...(to === "CANCELLED" ? { cancelledAt: new Date() } : {}) } });
    if (r.count !== 1) return false;
    await restockOrderItems(tx, orderId);
    await addOrderEvent(tx, orderId, eventType, message, actorId);
    return true;
  });
}

export async function expireStaleOrders(now: Date = new Date()): Promise<number> {
  const due = await db.order.findMany({ where: { status: "PENDING_PAYMENT", expiresAt: { lt: now } }, select: { id: true }, orderBy: { expiresAt: "asc" }, take: 200 });
  let expired = 0;
  for (const o of due) {
    if (await releaseOrder(o.id, ["PENDING_PAYMENT"], "EXPIRED", "EXPIRED", "Payment not received within 30 minutes; stock released")) expired++;
  }
  return expired;
}

export async function cancelOrder(orderId: string, opts: { actorId?: string | null; reason?: string } = {}): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) throw new NotFoundError("Order");
  if (!canCancel(order.status)) throw new ConflictError(`A ${ORDER_STATUS_LABEL[order.status].toLowerCase()} order cannot be cancelled`);
  const reason = opts.reason?.trim();
  const ok = await releaseOrder(orderId, ["PENDING_PAYMENT", ...TO_SHIP_STATUSES], "CANCELLED", "STATUS_CHANGED", `Cancelled${reason ? `: ${reason}` : ""}; stock restocked`, opts.actorId);
  if (!ok) throw new ConflictError("This order just changed. Reload and try again.");
  // Task 6 adds: await notifyOrder(orderId, "cancelled");
}

class ReReserveFailed extends Error {}

async function flagAttention(orderId: string, message: string, extra: { providerPaymentId?: string } = {}): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { needsAttention: true, ...extra } });
    await addOrderEvent(tx, orderId, "ATTENTION", message);
  });
}

async function afterPaid(orderId: string, userId: string, items: { variantId: string | null }[]): Promise<void> {
  const variantIds = items.map((i) => i.variantId).filter((v): v is string => v !== null);
  try {
    await db.cartItem.deleteMany({ where: { cart: { userId }, variantId: { in: variantIds } } });
    await db.cart.updateMany({ where: { userId }, data: { remindedAt: null } });
  } catch (err) {
    console.error("[orders] cart cleanup failed", orderId, err);
  }
  // Task 6 adds: await notifyOrder(orderId, "paid");
}

export type PaymentSource = "client" | "webhook" | "mock";
export type MarkPaidOutcome = "paid" | "already_paid" | "attention" | "amount_mismatch";

export async function markOrderPaid(
  orderId: string, paymentId: string, source: PaymentSource, opts: { amountPaise?: number } = {},
): Promise<{ outcome: MarkPaidOutcome; number: string }> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new NotFoundError("Order");
  const number = order.number;
  if (isPaidStatus(order.status) || order.status === "REFUNDED") return { outcome: "already_paid", number };

  if (opts.amountPaise !== undefined && opts.amountPaise !== order.totalPaise) {
    await flagAttention(order.id, `Payment ${paymentId} was for ${formatPaise(opts.amountPaise)} but the order total is ${formatPaise(order.totalPaise)}. Check it in the payment dashboard.`);
    return { outcome: "amount_mismatch", number };
  }

  const paid = { status: "PAID" as const, paidAt: new Date(), providerPaymentId: paymentId };

  if (order.status === "PENDING_PAYMENT") {
    const won = await db.$transaction(async (tx) => {
      const u = await tx.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: paid });
      if (u.count !== 1) return false;
      await addOrderEvent(tx, order.id, "PAID", `Payment ${paymentId} received (${source})`);
      return true;
    });
    if (!won) return markOrderPaid(orderId, paymentId, source, opts);
    await afterPaid(order.id, order.userId, order.items);
    return { outcome: "paid", number };
  }

  if (order.status === "EXPIRED") {
    const result = await db
      .$transaction(async (tx) => {
        const u = await tx.order.updateMany({ where: { id: order.id, status: "EXPIRED" }, data: paid });
        if (u.count !== 1) return "changed" as const;
        for (const it of order.items) {
          if (!it.variantId) throw new ReReserveFailed();
          const r = await tx.productVariant.updateMany({ where: { id: it.variantId, stock: { gte: it.quantity } }, data: { stock: { decrement: it.quantity } } });
          if (r.count !== 1) throw new ReReserveFailed();
        }
        await addOrderEvent(tx, order.id, "PAID", `Payment ${paymentId} received after the order expired (${source}); stock re-reserved`);
        return "reserved" as const;
      })
      .catch((err: unknown) => {
        if (err instanceof ReReserveFailed) return "short" as const;
        throw err;
      });
    if (result === "changed") return markOrderPaid(orderId, paymentId, source, opts);
    if (result === "short") {
      const won = await db.$transaction(async (tx) => {
        const u = await tx.order.updateMany({ where: { id: order.id, status: "EXPIRED" }, data: { ...paid, needsAttention: true } });
        if (u.count !== 1) return false;
        await addOrderEvent(tx, order.id, "PAID", `Payment ${paymentId} received after the order expired (${source})`);
        await addOrderEvent(tx, order.id, "ATTENTION", "Paid after expiry but some items are no longer in stock. Restock them, or cancel and refund.");
        return true;
      });
      if (!won) return markOrderPaid(orderId, paymentId, source, opts);
      await afterPaid(order.id, order.userId, order.items);
      return { outcome: "attention", number };
    }
    await afterPaid(order.id, order.userId, order.items);
    return { outcome: "paid", number };
  }

  // CANCELLED: money arrived for an order that no longer holds stock. Record it once; the admin refunds.
  if (!(order.needsAttention && order.providerPaymentId === paymentId)) {
    await flagAttention(order.id, `Payment ${paymentId} arrived for a ${ORDER_STATUS_LABEL[order.status].toLowerCase()} order. Refund it from the order page.`, { providerPaymentId: paymentId });
  }
  return { outcome: "attention", number };
}

export async function recordPaymentFailure(orderId: string, reason: string): Promise<void> {
  await addOrderEvent(db, orderId, "PAYMENT_FAILED", reason.slice(0, 300));
}

export async function findOrderByProviderOrderId(providerOrderId: string) {
  return db.order.findUnique({ where: { providerOrderId }, select: { id: true, userId: true, number: true, status: true, totalPaise: true } });
}

export async function getOrderForUser(userId: string, number: string): Promise<OrderView> {
  const o = await db.order.findFirst({ where: { number, userId }, include: orderWithItems });
  if (!o) throw new NotFoundError("Order");
  return toOrderView(o);
}

export async function listOrdersForUser(userId: string, opts: { page?: number; pageSize?: number } = {}): Promise<Page<OrderSummary>> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 10, 1), 50);
  const page = Math.max(opts.page ?? 1, 1);
  const where = { userId };
  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: orderWithItems }),
  ]);
  return { items: rows.map(toOrderSummary), total, page, pageSize, hasMore: page * pageSize < total };
}

export async function getRetryPayload(userId: string, number: string): Promise<CheckoutPayload> {
  const o = await db.order.findFirst({ where: { number, userId } });
  if (!o) throw new NotFoundError("Order");
  const provider = getPaymentProvider();
  if (o.status !== "PENDING_PAYMENT" || o.expiresAt <= new Date() || !o.providerOrderId || o.paymentProvider !== provider.name) {
    throw new ConflictError("This order can no longer be paid. Place a new order from your bag.");
  }
  return {
    orderId: o.id, number: o.number, amountPaise: o.totalPaise, currency: "INR", provider: provider.name,
    providerOrderId: o.providerOrderId, keyId: provider.publicKey, prefill: { name: o.shipName, email: o.email, contact: o.shipPhone },
  };
}
