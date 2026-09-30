import { Prisma, type OrderStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, PaymentError, StockChangedError, ValidationError, type StockIssue } from "@/server/errors";
import { getPaymentProvider, type PaymentProvider, type ProviderName } from "@/server/payments";
import { quote } from "@/server/services/promotions";
import { addOrderEvent, orderWithItems, toOrderSummary, toOrderView, type OrderSummary, type OrderView, type Tx } from "@/server/services/order-records";
import { notifyOrder } from "@/server/services/notifications";
import type { Page } from "@/server/services/catalog";
import { canCancel, isPaidStatus, ORDER_STATUS_LABEL, PAID_STATUSES, TO_SHIP_STATUSES, type OrderEventType } from "@/lib/order-status";
import { formatPaise } from "@/lib/money";
import { variantImageUrl } from "@/lib/variant-image";
import { COUPON_UNAVAILABLE, type PricingLine } from "@/lib/pricing";

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

/**
 * Units of each variant held by `userId`'s own unexpired PENDING_PAYMENT orders that still reserve
 * stock. That stock is effectively the user's: a new checkout supersedes those orders and releases it.
 */
async function ownPendingHolds(userId: string, variantIds: string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();
  const held = await db.orderItem.groupBy({
    by: ["variantId"],
    where: {
      variantId: { in: variantIds },
      order: { userId, status: "PENDING_PAYMENT", stockReserved: true, expiresAt: { gt: new Date() } },
    },
    _sum: { quantity: true },
  });
  return new Map(held.flatMap((h) => (h.variantId ? [[h.variantId, h._sum.quantity ?? 0] as const] : [])));
}

/**
 * Trims cart lines to what is in stock. With `userId`, quantities reserved by that user's own open
 * pending orders count as available to them, so returning to checkout after dismissing the payment
 * window does not strip the bag of the very units their unpaid order is holding.
 */
export async function reconcileCartStock(rows: CheckoutLineRow[], userId?: string): Promise<{ rows: CheckoutLineRow[]; issues: StockIssue[] }> {
  const kept: CheckoutLineRow[] = [];
  const issues: StockIssue[] = [];
  const holds = userId ? await ownPendingHolds(userId, rows.map((l) => l.variantId)) : new Map<string, number>();
  for (const l of rows) {
    const available = l.variant.product.status === "ACTIVE" ? Math.max(0, l.variant.stock) + (holds.get(l.variantId) ?? 0) : 0;
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

/** Stable lock/decrement order for any list of {variantId}: avoids 40P01 deadlocks between two transactions touching the same variants in opposite orders. */
function byVariantId<T extends { variantId: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.variantId ?? "").localeCompare(b.variantId ?? ""));
}

/** Serializes concurrent `placeOrder` calls for the same user (double submit, two tabs) behind one row lock. */
async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

/**
 * True when an open order IS this checkout attempt: same items (variantId + quantity), same coupon,
 * same total, same delivery address and note, under the same provider. A retry (double-click Pay,
 * two tabs, a client retry after a dropped response) that still matches its still-open order should
 * hand back that same order rather than superseding it — superseding a payable order is itself the
 * bug this replaces (see N1). The address/note check matters: without it, picking a different
 * address after dismissing payment and paying again would ship to the *old* address (see I-A).
 */
function sameOpenOrder(
  o: {
    totalPaise: number; couponCode: string | null; paymentProvider: string; customerNote: string | null;
    shipName: string; shipPhone: string; shipLine1: string; shipLine2: string | null; shipLandmark: string | null;
    shipCity: string; shipState: string; shipPincode: string;
    items: { variantId: string | null; quantity: number }[];
  },
  rows: CheckoutLineRow[], couponCode: string | null, totalPaise: number, providerName: string,
  address: { fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string },
  customerNote: string | null,
): boolean {
  if (o.paymentProvider !== providerName || o.totalPaise !== totalPaise) return false;
  if ((o.couponCode ?? null) !== couponCode) return false;
  if ((o.customerNote ?? null) !== customerNote) return false;
  if (o.shipName !== address.fullName || o.shipPhone !== address.phone) return false;
  if (o.shipLine1 !== address.line1 || (o.shipLine2 ?? null) !== (address.line2 ?? null)) return false;
  if ((o.shipLandmark ?? null) !== (address.landmark ?? null)) return false;
  if (o.shipCity !== address.city || o.shipState !== address.state || o.shipPincode !== address.pincode) return false;
  const want = new Map(rows.map((r) => [r.variantId, r.quantity]));
  const have = o.items.filter((i) => i.variantId !== null);
  if (have.length !== want.size) return false;
  return have.every((it) => want.get(it.variantId!) === it.quantity);
}

/**
 * How long a PENDING_PAYMENT order may sit without a `providerOrderId` before it counts as abandoned
 * (its creator died). Must stay comfortably above the payment provider's request timeout (Razorpay:
 * 15 s, `payments/razorpay.ts`), or a creator that is merely slow gets superseded while its
 * `createOrder` call is still in flight (I-1). The `providerOrderId` write is guarded as well.
 */
export const STALE_PROVIDER_ORDER_MS = 30_000;
const REUSE_MIN_REMAINING_MS = 5 * 60 * 1000;

/**
 * Whether an open order is even eligible to be reused, independent of whether it matches this cart:
 * - `stockReserved` must be true (M-2; every path that flips it false also moves status off
 *   PENDING_PAYMENT in the same transaction today, so this is a defensive backstop, not load-bearing).
 * - a `providerOrderId` still null more than a few seconds after creation means the request that
 *   created it likely died before finishing (crash, timeout) — reusing it would poll and eventually
 *   fail every retry until it expires (I-B). Supersede it instead.
 * - less than a few minutes of `expiresAt` left is too little runway to hand back safely — supersede
 *   for a fresh 30-minute window instead of reusing something that might expire mid-payment (M-3).
 */
function canReuseOrder(o: { providerOrderId: string | null; createdAt: Date; expiresAt: Date; stockReserved: boolean }, now: Date): boolean {
  if (!o.stockReserved) return false;
  if (o.providerOrderId === null && now.getTime() - o.createdAt.getTime() > STALE_PROVIDER_ORDER_MS) return false;
  if (o.expiresAt.getTime() - now.getTime() <= REUSE_MIN_REMAINING_MS) return false;
  return true;
}

/** Locks the given variant rows in one globally-sorted pass, up front, before any restock or decrement touches them (see I-C). */
async function lockVariants(tx: Tx, variantIds: Iterable<string>): Promise<void> {
  const ids = [...new Set(variantIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "ProductVariant" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

/**
 * Builds the checkout payload for a reused order, waiting briefly for `providerOrderId` if a
 * sibling `placeOrder` call (the one that actually created the order, see `sameOpenOrder` above) is
 * still in the short window between its transaction committing and its own `provider.createOrder`
 * call finishing. That call is deliberately outside any transaction (it is a network round trip to
 * the payment provider), so this is the only way to hand back the *same* provider order rather than
 * creating a second one.
 */
async function waitForCheckoutPayload(orderId: string, provider: PaymentProvider, timeoutMs = 3000): Promise<CheckoutPayload> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const o = await db.order.findUnique({ where: { id: orderId }, select: { status: true, number: true, totalPaise: true, providerOrderId: true, shipName: true, shipPhone: true, email: true } });
    if (!o) throw new NotFoundError("Order");
    // Only ever hand back a payload for an order that is still payable, checked before looking at
    // `providerOrderId` (m2): a different attempt may have superseded it after this call chose to
    // reuse it. A CANCELLED order here is its creator failing to start payment and releasing it
    // (M-1) — stop polling at once instead of waiting out the timeout to say something misleading.
    if (o.status !== "PENDING_PAYMENT") {
      throw new PaymentError(o.status === "EXPIRED" ? CHECKOUT_REPLACED : "Could not start the payment for this order. Please try again.");
    }
    if (o.providerOrderId) {
      return {
        orderId, number: o.number, amountPaise: o.totalPaise, currency: "INR", provider: provider.name,
        providerOrderId: o.providerOrderId, keyId: provider.publicKey, prefill: { name: o.shipName, email: o.email, contact: o.shipPhone },
      };
    }
    if (Date.now() >= deadline) throw new ConflictError("This order is still being set up. Please try again in a moment.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const CHECKOUT_REPLACED = "This checkout was replaced — please try again.";

/**
 * Locks the user's open (unexpired PENDING_PAYMENT) order rows, in id order. Taken before
 * `lockVariants` so placeOrder acquires Order rows before ProductVariant rows — the same order every
 * release path uses (`releaseOrderTx` updates the order row, then restocks its variants). Locking
 * variants first and the order row second deadlocked against a concurrent `releaseOrder` of the
 * order being superseded (m1).
 */
async function lockOpenOrders(tx: Tx, userId: string, now: Date): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "Order"
    WHERE "userId" = ${userId} AND status = 'PENDING_PAYMENT' AND "expiresAt" > ${now}
    ORDER BY id FOR UPDATE
  `;
}

/** Locks the coupon row so concurrent checkouts using the same code are serialized. */
async function lockCoupon(tx: Tx, code: string): Promise<{ usageLimit: number | null; perUserLimit: number | null } | null> {
  const rows = await tx.$queryRaw<{ usageLimit: number | null; perUserLimit: number | null }[]>`
    SELECT "usageLimit", "perUserLimit" FROM "Coupon" WHERE code = ${code} FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Re-checks a coupon's usage limits against live data while still holding `lockCoupon`'s row lock.
 * `quote()`'s check (above) only reflects the state at the time the page loaded a quote; without
 * this, N concurrent checkouts can all pass that check and all use a `usageLimit: 1` coupon. Counts
 * paid-like orders plus other unexpired PENDING_PAYMENT orders already holding the code, so two
 * carts racing for the same single-use coupon can't both win. Must run after any same-user orders
 * using this code have already been superseded in this transaction (placeOrder does this), or a
 * user's own about-to-be-replaced order would count against their own retry.
 */
async function checkCouponUsage(tx: Tx, code: string, userId: string, now: Date, coupon: { usageLimit: number | null; perUserLimit: number | null }): Promise<void> {
  if (coupon.usageLimit === null && coupon.perUserLimit === null) return;
  const paidWhere = { couponCode: code, status: { in: [...PAID_STATUSES] } } satisfies Prisma.OrderWhereInput;
  const pendingWhere = { couponCode: code, status: "PENDING_PAYMENT" as const, expiresAt: { gt: now } } satisfies Prisma.OrderWhereInput;
  if (coupon.usageLimit !== null) {
    const [paid, pending] = await Promise.all([tx.order.count({ where: paidWhere }), tx.order.count({ where: pendingWhere })]);
    if (paid + pending >= coupon.usageLimit) throw new ValidationError({ couponCode: [COUPON_UNAVAILABLE] });
  }
  if (coupon.perUserLimit !== null) {
    const [paid, pending] = await Promise.all([
      tx.order.count({ where: { ...paidWhere, userId } }),
      tx.order.count({ where: { ...pendingWhere, userId } }),
    ]);
    if (paid + pending >= coupon.perUserLimit) throw new ValidationError({ couponCode: [COUPON_UNAVAILABLE] });
  }
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
  // The user's own unexpired PENDING_PAYMENT orders haven't been touched yet at this point (superseding
  // now happens inside the transaction below, so a failed attempt never destroys a still-payable order,
  // see N1) — pass userId so their own reservation still counts as available to them (see N2).
  const { rows, issues } = await reconcileCartStock(loaded, userId);
  if (issues.length) throw new StockChangedError(issues);

  const now = new Date();
  const price = await quote({ lines: toPricingLines(rows), couponCode, userId, now });
  if (couponCode?.trim() && price.couponError) throw new ValidationError({ couponCode: [price.couponError] });
  if (price.totalPaise < MIN_ORDER_PAISE) throw new ValidationError({ couponCode: ["Order total must be at least ₹1"] });

  const provider = getPaymentProvider();
  const wantCouponCode = price.applied === "coupon" && price.coupon ? price.coupon.code : null;
  const wantNote = customerNote?.trim() || null;

  const outcome = await db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    await lockOpenOrders(tx, userId, now);

    // Re-read the user's open orders now that we hold their lock: a sibling placeOrder call may have
    // just committed one. Reuse it if it is this exact attempt (N1); otherwise supersede it below,
    // inside this same transaction, so a failure anywhere after this point (a coupon that just lost
    // its race, a stock miss) rolls the supersede back too and leaves it payable.
    const openOrders = await tx.order.findMany({
      where: { userId, status: "PENDING_PAYMENT", expiresAt: { gt: now } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    const reusable = openOrders.find((o) => canReuseOrder(o, now) && sameOpenOrder(o, rows, wantCouponCode, price.totalPaise, provider.name, address, wantNote));
    if (reusable) return { kind: "reuse" as const, orderId: reusable.id };

    const couponLimits = price.applied === "coupon" && price.coupon ? await lockCoupon(tx, price.coupon.code) : null;

    // Lock every variant this transaction will touch — the superseded orders' items and the new
    // cart's — in one globally-sorted pass before restocking or decrementing anything (I-C). Without
    // this, restocking (sorted within the old orders) and decrementing (sorted within the new cart)
    // are two independently-sorted passes that can lock the same two variants in opposite order
    // across two concurrent checkouts and deadlock.
    const oldVariantIds = openOrders.flatMap((o) => o.items.flatMap((i) => (i.variantId ? [i.variantId] : [])));
    await lockVariants(tx, [...oldVariantIds, ...rows.map((l) => l.variantId)]);

    for (const o of openOrders) {
      await releaseOrderTx(tx, o.id, ["PENDING_PAYMENT"], "EXPIRED", "EXPIRED", "Superseded by a new checkout");
    }

    if (couponLimits && price.coupon) {
      await checkCouponUsage(tx, price.coupon.code, userId, now, couponLimits);
    }

    for (const l of byVariantId(rows)) {
      const r = await tx.productVariant.updateMany({ where: { id: l.variantId, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
      if (r.count !== 1) {
        const fresh = await tx.productVariant.findUnique({ where: { id: l.variantId }, select: { stock: true } });
        throw new StockChangedError([{ variantId: l.variantId, name: lineName(l), requested: l.quantity, available: fresh?.stock ?? 0 }]);
      }
    }
    const number = await nextOrderNumber(tx);
    const created = await tx.order.create({
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
    return { kind: "created" as const, order: created };
  });

  if (outcome.kind === "reuse") {
    return waitForCheckoutPayload(outcome.orderId, provider);
  }

  const order = outcome.order;
  let providerOrderId: string;
  try {
    providerOrderId = (await provider.createOrder({ amountPaise: order.totalPaise, receipt: order.number, notes: { orderId: order.id, number: order.number } })).id;
  } catch (err) {
    console.error("[orders] provider createOrder failed", order.number, err);
    await releaseOrder(order.id, ["PENDING_PAYMENT"], "CANCELLED", "PAYMENT_FAILED", "Could not start the payment; order cancelled and stock released");
    throw err instanceof PaymentError ? err : new PaymentError("Could not start the payment. Please try again.");
  }
  // Guarded (I-1): if this call was slow enough for a later attempt to supersede the order while
  // `createOrder` was in flight, the order is EXPIRED and its stock released — never hand back a live
  // payment for it. The orphaned provider order is harmless: nothing was paid against it.
  const recorded = await db.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: { providerOrderId } });
  if (recorded.count !== 1) {
    console.warn("[orders] order superseded while its payment was being started", order.number);
    throw new PaymentError(CHECKOUT_REPLACED);
  }

  return {
    orderId: order.id, number: order.number, amountPaise: order.totalPaise, currency: "INR", provider: provider.name,
    providerOrderId, keyId: provider.publicKey, prefill: { name: address.fullName, email: user.email, contact: address.phone },
  };
}

/**
 * Restocks every item of an order whose variant still exists — but only when the order still
 * actually holds that stock. `Order.stockReserved` (flipped to false here, and by the "paid after
 * expiry, could not re-reserve" path in `markOrderPaid`) makes this exactly-once and prevents
 * phantom stock: an order that was marked PAID without ever re-taking its stock must not hand stock
 * back on a later cancel/refund, and an order already restocked once must not be restocked again.
 * Shared by `releaseOrder` (cancel/expire, below) and Task 9's `refundOrder` — the only two places
 * stock is ever put back.
 */
export async function restockOrderItems(tx: Tx, orderId: string): Promise<void> {
  const flip = await tx.order.updateMany({ where: { id: orderId, stockReserved: true }, data: { stockReserved: false } });
  if (flip.count !== 1) return;
  const items = await tx.orderItem.findMany({ where: { orderId, variantId: { not: null } }, select: { variantId: true, quantity: true } });
  for (const it of byVariantId(items)) {
    await tx.productVariant.updateMany({ where: { id: it.variantId! }, data: { stock: { increment: it.quantity } } });
  }
}

async function releaseOrderTx(
  tx: Tx, orderId: string, from: OrderStatus[], to: "CANCELLED" | "EXPIRED", eventType: OrderEventType, message: string, actorId?: string | null,
): Promise<boolean> {
  const r = await tx.order.updateMany({ where: { id: orderId, status: { in: from } }, data: { status: to, ...(to === "CANCELLED" ? { cancelledAt: new Date() } : {}) } });
  if (r.count !== 1) return false;
  await restockOrderItems(tx, orderId);
  await addOrderEvent(tx, orderId, eventType, message, actorId);
  return true;
}

export async function releaseOrder(
  orderId: string, from: OrderStatus[], to: "CANCELLED" | "EXPIRED", eventType: OrderEventType, message: string, actorId?: string | null,
): Promise<boolean> {
  return db.$transaction((tx) => releaseOrderTx(tx, orderId, from, to, eventType, message, actorId));
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
  await notifyOrder(orderId, "cancelled");
}

class ReReserveFailed extends Error {}

/**
 * Flags an order for attention exactly once: the update only takes effect while `needsAttention`
 * is still false, so two concurrent callers (a webhook and a client verify racing, or a repeated
 * webhook retry) can't both write an ATTENTION event. Returns whether this call was the one that
 * flagged it.
 */
async function flagAttentionOnce(orderId: string, message: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const u = await tx.order.updateMany({ where: { id: orderId, needsAttention: false }, data: { needsAttention: true } });
    if (u.count !== 1) return false;
    await addOrderEvent(tx, orderId, "ATTENTION", message);
    return true;
  });
}

/**
 * Records a payment id against an order (money arrived that the order can no longer account for in
 * stock) and flags it for attention — each independently exactly-once, so:
 * - a `providerPaymentId` already on record (e.g. the order's original successful payment, before
 *   it was cancelled) is never overwritten by a different id that arrives afterwards;
 * - an order already flagged for something else (e.g. an earlier amount mismatch, which never had a
 *   payment id) still gets its first real payment id stored, with correct wording — not the old
 *   "it still flags an earlier payment" text when there wasn't one;
 * - a different id arriving on an already-flagged, already-identified order is noted once (deduped
 *   per payment id), not on every webhook retry.
 */
async function recordAttentionPayment(orderId: string, paymentId: string, statusLabel: string): Promise<void> {
  const result = await db.$transaction(async (tx) => {
    const idWrite = await tx.order.updateMany({ where: { id: orderId, providerPaymentId: null }, data: { providerPaymentId: paymentId } });
    const flagWrite = await tx.order.updateMany({ where: { id: orderId, needsAttention: false }, data: { needsAttention: true } });
    const current = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { providerPaymentId: true } });
    return { stored: idWrite.count === 1, flagged: flagWrite.count === 1, recordedId: current.providerPaymentId };
  });

  const recordedId = result.recordedId ?? paymentId;
  const isRecordedPayment = recordedId === paymentId;

  if (result.flagged) {
    const message = isRecordedPayment
      ? `Payment ${paymentId} arrived for a ${statusLabel} order. Refund it from the order page.`
      : `Payment ${paymentId} arrived for a ${statusLabel} order, which is already on record for payment ${recordedId}. Refund ${recordedId} from the order page.`;
    await addOrderEvent(db, orderId, "ATTENTION", message);
    return;
  }
  if (result.stored) {
    await addOrderEvent(db, orderId, "NOTE", `Payment ${paymentId} recorded for this ${statusLabel} order. Refund it from the order page.`);
    return;
  }
  if (!isRecordedPayment) {
    const already = await db.orderEvent.findFirst({ where: { orderId, type: "NOTE", message: { contains: paymentId } } });
    if (!already) {
      await addOrderEvent(db, orderId, "NOTE", `Another payment ${paymentId} also arrived for this ${statusLabel} order; it still flags ${recordedId} for refund.`);
    }
  }
}

async function afterPaid(orderId: string, userId: string, items: { variantId: string | null }[]): Promise<void> {
  const variantIds = items.map((i) => i.variantId).filter((v): v is string => v !== null);
  try {
    await db.cartItem.deleteMany({ where: { cart: { userId }, variantId: { in: variantIds } } });
    await db.cart.updateMany({ where: { userId }, data: { remindedAt: null } });
  } catch (err) {
    console.error("[orders] cart cleanup failed", orderId, err);
  }
  await notifyOrder(orderId, "paid");
}

export type PaymentSource = "client" | "webhook" | "mock" | "reconcile";
export type MarkPaidOutcome = "paid" | "already_paid" | "attention" | "amount_mismatch";

export async function markOrderPaid(
  orderId: string, paymentId: string, source: PaymentSource, opts: { amountPaise?: number | null } = {},
): Promise<{ outcome: MarkPaidOutcome; number: string }> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new NotFoundError("Order");
  const number = order.number;
  if (isPaidStatus(order.status) || order.status === "REFUNDED") return { outcome: "already_paid", number };

  // `null` = the source reported a payment but no amount (never trusted as a match).
  if (opts.amountPaise !== undefined && opts.amountPaise !== order.totalPaise) {
    const what = opts.amountPaise === null ? "arrived without an amount" : `was for ${formatPaise(opts.amountPaise)}`;
    await flagAttentionOnce(order.id, `Payment ${paymentId} ${what} but the order total is ${formatPaise(order.totalPaise)}. Check it in the payment dashboard.`);
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
        const u = await tx.order.updateMany({ where: { id: order.id, status: "EXPIRED" }, data: { ...paid, stockReserved: true } });
        if (u.count !== 1) return "changed" as const;
        for (const it of byVariantId(order.items)) {
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
        await addOrderEvent(tx, order.id, "ATTENTION", "Paid after expiry but some items are no longer in stock. Stock was short — refund or restock manually.");
        return true;
      });
      if (!won) return markOrderPaid(orderId, paymentId, source, opts);
      await afterPaid(order.id, order.userId, order.items);
      return { outcome: "attention", number };
    }
    await afterPaid(order.id, order.userId, order.items);
    return { outcome: "paid", number };
  }

  // CANCELLED (or otherwise terminal, non-paid): money arrived for an order that no longer holds
  // stock. Records the payment id and flags it — see recordAttentionPayment for exactly what that
  // guarantees (never overwrites an id already on record; still captures the first real id even if
  // already flagged for something else; dedupes a repeated different id).
  await recordAttentionPayment(order.id, paymentId, ORDER_STATUS_LABEL[order.status].toLowerCase());
  return { outcome: "attention", number };
}

/**
 * Notes a failed or rejected payment attempt on the order timeline — only while the order is still
 * awaiting payment (a late or redelivered failure must not clutter a paid/cancelled order), and at
 * most once per payment id. The order row lock serializes concurrent webhook redeliveries, so the
 * "already recorded?" check and the insert can't interleave. `reason` should mention `paymentId`.
 * Returns whether an event was written.
 */
export async function recordPaymentFailure(orderId: string, reason: string, paymentId?: string | null): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ status: OrderStatus }[]>`SELECT status FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    if (rows[0]?.status !== "PENDING_PAYMENT") return false;
    if (paymentId) {
      const seen = await tx.orderEvent.findFirst({ where: { orderId, type: "PAYMENT_FAILED", message: { contains: paymentId } }, select: { id: true } });
      if (seen) return false;
    }
    await addOrderEvent(tx, orderId, "PAYMENT_FAILED", reason.slice(0, 300));
    return true;
  });
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
