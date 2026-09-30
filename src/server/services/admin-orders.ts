import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { getPaymentProvider, paymentProviderName, type ProviderName } from "@/server/payments";
import { notifyOrder } from "@/server/services/notifications";
import { addOrderEvent, orderWithItems, toOrderView, type OrderView } from "@/server/services/order-records";
import { cancelOrder, restockOrderItems } from "@/server/services/orders";
import type { Page } from "@/server/services/catalog";
import { carrierById, trackingUrlFor } from "@/lib/carriers";
import { toCsv } from "@/lib/csv";
import { formatDateTimeIst } from "@/lib/dates";
import { paiseToRupees } from "@/lib/money";
import { fulfilmentRank, isPaidStatus, ORDER_STATUS_LABEL, PAID_STATUSES, TO_SHIP_STATUSES, type FulfilmentStatus } from "@/lib/order-status";
import { ORDER_TABS, type OrderTab } from "@/lib/order-tabs";
import { adminNoteSchema, cancelReasonSchema, fulfilmentStatusSchema, manualRefundNoteSchema, trackingInputSchema } from "@/lib/validation/orders";

const DAY = 86_400_000;
export const BULK_LIMIT = 200;
const EXPORT_LIMIT = 5000;
export const MAX_LIST_PAGE = 1000;

export interface AdminOrderFilter { tab?: OrderTab; q?: string; attention?: boolean; page?: number; pageSize?: number }
export interface AdminOrderRow {
  id: string; number: string; createdAt: Date; paidAt: Date | null; status: OrderStatus; needsAttention: boolean;
  customerName: string; email: string; phone: string; city: string; pincode: string; itemCount: number; totalPaise: number; unshippedDays: number | null;
}
export interface OrderTabCount { id: OrderTab; label: string; count: number }
export interface AdminOrderList extends Page<AdminOrderRow> { tabs: OrderTabCount[]; attentionCount: number; activeTab: OrderTab }
export interface AdminOrderEvent { id: string; type: string; message: string; createdAt: Date; actorName: string | null }
export interface AdminOrderDetail extends OrderView {
  needsAttention: boolean; adminNote: string | null;
  customer: { id: string; name: string | null; email: string; paidOrderCount: number };
  events: AdminOrderEvent[];
  /** The provider refundOrder would call for this order right now (paid through the configured provider), or null = recorded as manual. */
  refundVia: ProviderName | null;
}

const isToShip = (s: OrderStatus) => (TO_SHIP_STATUSES as readonly OrderStatus[]).includes(s);

export function adminOrderWhere(f: AdminOrderFilter): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    const digits = q.replace(/\D/g, "");
    const or: Prisma.OrderWhereInput[] = [
      { number: { contains: q, mode: "insensitive" } },
      { shipName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
    if (digits.length >= 4) or.push({ shipPhone: { contains: digits } }, { shipPincode: { contains: digits } });
    where.OR = or;
  } else {
    const tab = ORDER_TABS.find((t) => t.id === (f.tab ?? "to-ship")) ?? ORDER_TABS[0];
    if (tab.statuses) where.status = { in: [...tab.statuses] };
  }
  if (f.attention) where.needsAttention = true;
  return where;
}

export async function listAdminOrders(f: AdminOrderFilter = {}, now: Date = new Date()): Promise<AdminOrderList> {
  const pageSize = Math.min(Math.max(f.pageSize ?? 50, 1), 200);
  const page = Math.min(Math.max(Math.floor(f.page ?? 1) || 1, 1), MAX_LIST_PAGE);
  const activeTab: OrderTab = f.q?.trim() ? "all" : f.tab ?? "to-ship";
  const where = adminOrderWhere(f);
  // "To ship" is a packing queue: oldest paid first (FIFO). Everything else reads newest first.
  const orderBy: Prisma.OrderOrderByWithRelationInput[] = activeTab === "to-ship" ? [{ paidAt: "asc" }, { createdAt: "asc" }] : [{ createdAt: "desc" }];
  const [total, rows, grouped, attentionCount] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { items: { select: { quantity: true } } } }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.count({ where: { needsAttention: true } }),
  ]);
  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const all = grouped.reduce((s, g) => s + g._count._all, 0);
  return {
    items: rows.map((o) => ({
      id: o.id, number: o.number, createdAt: o.createdAt, paidAt: o.paidAt, status: o.status, needsAttention: o.needsAttention,
      customerName: o.shipName, email: o.email, phone: o.shipPhone, city: o.shipCity, pincode: o.shipPincode,
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0), totalPaise: o.totalPaise,
      unshippedDays: isToShip(o.status) && o.paidAt ? Math.max(0, Math.floor((now.getTime() - o.paidAt.getTime()) / DAY)) : null,
    })),
    total, page, pageSize, hasMore: page * pageSize < total,
    tabs: ORDER_TABS.map((t) => ({ id: t.id, label: t.label, count: t.statuses ? t.statuses.reduce((s, st) => s + (byStatus.get(st) ?? 0), 0) : all })),
    attentionCount, activeTab,
  };
}

export async function getAdminOrder(id: string): Promise<AdminOrderDetail> {
  const o = await db.order.findUnique({
    where: { id },
    include: { ...orderWithItems, events: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] }, user: { select: { id: true, name: true, email: true } } },
  });
  if (!o) throw new NotFoundError("Order");
  const actorIds = [...new Set(o.events.map((e) => e.actorId).filter((x): x is string => Boolean(x)))];
  const [actors, paidOrderCount] = await Promise.all([
    actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    db.order.count({ where: { userId: o.userId, status: { in: [...PAID_STATUSES] } } }),
  ]);
  const names = new Map(actors.map((a) => [a.id, a.name ?? a.email]));
  return {
    ...toOrderView(o),
    needsAttention: o.needsAttention,
    adminNote: o.adminNote,
    customer: { id: o.user.id, name: o.user.name, email: o.user.email, paidOrderCount },
    refundVia: refundProviderFor(o),
    events: o.events.map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt, actorName: e.actorId ? names.get(e.actorId) ?? null : null })),
  };
}

/**
 * Moves an order forward along PAID → PROCESSING → SHIPPED → DELIVERED (skipping ahead fills the
 * skipped timestamps). The status-guarded updateMany makes a concurrent change (a second click, a
 * cancel) lose cleanly with a ConflictError. No stock is touched here.
 */
export async function advanceOrderStatus(id: string, toInput: FulfilmentStatus, actorId: string | null, opts: { notify?: boolean } = {}): Promise<void> {
  const parsedTo = fulfilmentStatusSchema.safeParse(toInput);
  if (!parsedTo.success) throw new ValidationError({ to: parsedTo.error.issues.map((i) => i.message) });
  const to: FulfilmentStatus = parsedTo.data;
  const o = await db.order.findUnique({ where: { id }, select: { status: true, processingAt: true, shippedAt: true } });
  if (!o) throw new NotFoundError("Order");
  const from = fulfilmentRank(o.status);
  const target = fulfilmentRank(to);
  // Delivered only from Shipped: the customer must get the shipped email (with tracking) first.
  if (from < 0 || target <= from || (to === "DELIVERED" && o.status !== "SHIPPED")) {
    throw new ConflictError(`A ${ORDER_STATUS_LABEL[o.status].toLowerCase()} order cannot be marked ${ORDER_STATUS_LABEL[to].toLowerCase()}`);
  }
  const now = new Date();
  const data: Prisma.OrderUpdateManyMutationInput = { status: to };
  if (target >= 1 && !o.processingAt) data.processingAt = now;
  if (target >= 2 && !o.shippedAt) data.shippedAt = now;
  if (target >= 3) data.deliveredAt = now;
  const ok = await db.$transaction(async (tx) => {
    const r = await tx.order.updateMany({ where: { id, status: o.status }, data });
    if (r.count !== 1) return false;
    await addOrderEvent(tx, id, "STATUS_CHANGED", `${ORDER_STATUS_LABEL[o.status]} → ${ORDER_STATUS_LABEL[to]}`, actorId);
    return true;
  });
  if (!ok) throw new ConflictError("This order just changed. Reload and try again.");
  if (opts.notify !== false && (to === "SHIPPED" || to === "DELIVERED")) await notifyOrder(id, to === "SHIPPED" ? "shipped" : "delivered");
}

export async function saveTracking(id: string, input: unknown, actorId: string | null, opts: { markShipped: boolean }): Promise<void> {
  const parsed = trackingInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodFieldErrors(parsed.error));
  const carrier = carrierById(parsed.data.carrier)!;
  const trackingUrl = trackingUrlFor(carrier.id, parsed.data.trackingNumber, parsed.data.trackingUrl);
  const status = await db.$transaction(async (tx) => {
    const r = await tx.order.updateMany({
      where: { id, status: { in: [...PAID_STATUSES] } },
      data: { carrier: carrier.name, trackingNumber: parsed.data.trackingNumber, trackingUrl },
    });
    if (r.count !== 1) {
      const exists = await tx.order.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundError("Order");
      throw new ConflictError("Tracking can only be added to paid orders");
    }
    await addOrderEvent(tx, id, "TRACKING_UPDATED", `${carrier.name} ${parsed.data.trackingNumber}`, actorId);
    return (await tx.order.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
  });
  if (opts.markShipped && fulfilmentRank(status) < fulfilmentRank("SHIPPED")) await advanceOrderStatus(id, "SHIPPED", actorId);
}

export async function setAdminNote(id: string, note: unknown, actorId: string | null): Promise<void> {
  const parsed = adminNoteSchema.safeParse(note);
  if (!parsed.success) throw new ValidationError({ note: parsed.error.issues.map((i) => i.message) });
  const text = parsed.data.trim();
  await db.$transaction(async (tx) => {
    const r = await tx.order.updateMany({ where: { id }, data: { adminNote: text || null } });
    if (r.count !== 1) throw new NotFoundError("Order");
    await addOrderEvent(tx, id, "NOTE", text ? `Note: ${text.slice(0, 200)}` : "Note cleared", actorId);
  });
}

export async function clearAttention(id: string, actorId: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const r = await tx.order.updateMany({ where: { id, needsAttention: true }, data: { needsAttention: false } });
    if (r.count === 1) {
      await addOrderEvent(tx, id, "NOTE", "Marked as resolved", actorId);
      return;
    }
    const exists = await tx.order.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundError("Order");
  });
}

export async function bulkMarkProcessing(ids: string[], actorId: string | null): Promise<number> {
  const paid = await db.order.findMany({ where: { id: { in: ids.slice(0, BULK_LIMIT) }, status: "PAID" }, select: { id: true } });
  let n = 0;
  for (const o of paid) {
    try {
      await advanceOrderStatus(o.id, "PROCESSING", actorId);
      n++;
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
    }
  }
  return n;
}

/** Cancel is allowed only before SHIPPED (canCancel); cancelOrder locks the order row, then restocks variants sorted by id, exactly once. */
export async function adminCancelOrder(id: string, reason: unknown, actorId: string | null): Promise<void> {
  const parsed = cancelReasonSchema.safeParse(reason ?? "");
  if (!parsed.success) throw new ValidationError({ reason: parsed.error.issues.map((i) => i.message) });
  await cancelOrder(id, { actorId, reason: parsed.data });
}

function canRefund(o: { status: OrderStatus; providerPaymentId: string | null }): boolean {
  return isPaidStatus(o.status) || (o.status === "CANCELLED" && Boolean(o.providerPaymentId));
}

function configuredProvider(): ProviderName | null {
  try {
    return paymentProviderName();
  } catch {
    return null;
  }
}

function refundProviderFor(o: { providerPaymentId: string | null; paymentProvider: string }): ProviderName | null {
  const current = configuredProvider();
  return o.providerPaymentId && current && o.paymentProvider === current ? current : null;
}

/** Transaction options for refundOrder: up to two provider calls (fetchRefunds + refund, 15 s fetch timeout each) run inside the row lock. Mutable for tests only. */
export const refundTxOptions = { maxWait: 10_000, timeout: 40_000 };

type RefundRow = { status: OrderStatus; providerPaymentId: string | null; paymentProvider: string; totalPaise: number; stockReserved: boolean };

class ProviderRefundFailed extends Error {
  constructor(readonly original: unknown) {
    super(original instanceof Error ? original.message : String(original));
  }
}

/** Flags the order and writes the ATTENTION event only when the flag flips false → true (same semantics as orders.ts flagAttentionOnce). */
async function flagAttentionOnce(id: string, message: string, actorId: string | null): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      const u = await tx.order.updateMany({ where: { id, needsAttention: false }, data: { needsAttention: true } });
      if (u.count === 1) await addOrderEvent(tx, id, "ATTENTION", message, actorId);
    });
  } catch (err) {
    console.error("[admin-orders] could not flag attention", id, err);
  }
}

const providerLabel = (p: string) => (p === "razorpay" ? "Razorpay" : p === "mock" ? "the mock provider" : p);

/**
 * Refunds a paid order (or the payment on a cancelled one). The order row is locked FOR UPDATE for
 * the whole operation, including the provider calls, so two clicks (or two admins) can never create
 * two refunds: the second waits, then sees REFUNDED and gets a ConflictError.
 *
 * Idempotent across provider timeouts: before creating a refund it asks the provider for refunds
 * that already exist for the payment; if those (pending or processed) cover the order total, the
 * order is finalised with that refund id and no new refund is created. Any provider failure leaves
 * the order untouched and flags it for attention (outside the rolled-back transaction). If the
 * provider holds a refund for the order (one just created, or one that already existed) but the order
 * update then fails, the order is flagged with that refund id.
 *
 * Stock goes back only for unshipped orders, via restockOrderItems (after the order row lock,
 * variants sorted by id, exactly-once through Order.stockReserved).
 */
export async function refundOrder(id: string, actorId: string | null): Promise<{ refundId: string | null }> {
  const currentProvider = configuredProvider();
  // Set as soon as the provider is known to hold a refund for this order, whichever branch found it:
  // from then on money has moved, so a failed order update must never be silent.
  let refundIdForFailure: { id: string; created: boolean } | null = null;
  try {
    const refundId = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<RefundRow[]>`
        SELECT status, "providerPaymentId", "paymentProvider", "totalPaise", "stockReserved" FROM "Order" WHERE id = ${id} FOR UPDATE`;
      const o = rows[0];
      if (!o) throw new NotFoundError("Order");
      if (!canRefund(o)) {
        throw new ConflictError(o.status === "REFUNDED" ? "This order is already refunded" : "Only paid orders can be refunded");
      }

      let finalId: string | null = null;
      let note = "Marked as refunded (refund made outside the store)";
      if (o.providerPaymentId && currentProvider && o.paymentProvider === currentProvider) {
        const provider = getPaymentProvider();
        try {
          const existing = (await provider.fetchRefunds(o.providerPaymentId)).filter((r) => r.status !== "failed");
          const covered = existing.reduce((sum, r) => sum + r.amountPaise, 0);
          if (existing.length > 0 && covered >= o.totalPaise) {
            finalId = existing[existing.length - 1].id;
            refundIdForFailure = { id: finalId, created: false };
            note = `Refund ${finalId} already existed with ${providerLabel(o.paymentProvider)}; recorded it (no new refund created)`;
          } else {
            finalId = (await provider.refund(o.providerPaymentId, o.totalPaise)).id;
            refundIdForFailure = { id: finalId, created: true };
            note = `Refund ${finalId} created with ${providerLabel(o.paymentProvider)}`;
          }
        } catch (err) {
          throw new ProviderRefundFailed(err);
        }
      }

      const restock = isToShip(o.status) && o.stockReserved;
      await tx.order.update({ where: { id }, data: { status: "REFUNDED", refundedAt: new Date(), needsAttention: false } });
      if (isToShip(o.status)) await restockOrderItems(tx, id);
      await addOrderEvent(tx, id, "REFUNDED", `${note}${restock ? "; stock restocked" : ""}`, actorId);
      return finalId;
    }, refundTxOptions);
    await notifyOrder(id, "refunded");
    return { refundId };
  } catch (err) {
    if (refundIdForFailure) {
      // Money moved but the order could not be updated: make sure the owner sees it. Written on every
      // such failure (not only the first flag), so a retry that fails again still leaves a fresh signal.
      const { id: refundId, created } = refundIdForFailure;
      const what = created ? `Refund ${refundId} was created` : `Refund ${refundId} already exists with the provider`;
      await db.order.updateMany({ where: { id }, data: { needsAttention: true } }).catch(() => undefined);
      await addOrderEvent(db, id, "ATTENTION", `${what} but the order could not be updated. Refund again to record it (no second refund is made).`, actorId).catch(() => undefined);
      throw new ConflictError(`${what} but the order could not be updated. Reload and refund again to record it.`);
    }
    if (err instanceof ProviderRefundFailed) {
      await flagAttentionOnce(
        id,
        `Refund attempt failed or timed out (${err.message.slice(0, 200)}). Check the payment dashboard before retrying; if it was refunded there, use "Mark refunded".`,
        actorId,
      );
      throw new ConflictError(`The refund did not go through or timed out (${err.message.slice(0, 120)}). Check the payment dashboard before retrying; the order is flagged.`);
    }
    throw err;
  }
}

/**
 * Records a refund that was made directly in the payment dashboard (e.g. after a timed-out refund
 * attempt), without calling the provider. A note is required. Restocks only unshipped orders, via
 * restockOrderItems after the order row lock.
 */
export async function markRefundedManually(id: string, note: unknown, actorId: string | null): Promise<void> {
  const parsed = manualRefundNoteSchema.safeParse(note);
  if (!parsed.success) throw new ValidationError({ note: parsed.error.issues.map((i) => i.message) });
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ status: OrderStatus; stockReserved: boolean }[]>`
      SELECT status, "stockReserved" FROM "Order" WHERE id = ${id} FOR UPDATE`;
    const o = rows[0];
    if (!o) throw new NotFoundError("Order");
    if (!isPaidStatus(o.status)) {
      throw new ConflictError(o.status === "REFUNDED" ? "This order is already refunded" : "Only paid orders can be marked refunded");
    }
    const restock = isToShip(o.status) && o.stockReserved;
    await tx.order.update({ where: { id }, data: { status: "REFUNDED", refundedAt: new Date(), needsAttention: false } });
    if (isToShip(o.status)) await restockOrderItems(tx, id);
    await addOrderEvent(tx, id, "REFUNDED", `Marked as refunded manually: ${parsed.data}${restock ? "; stock restocked" : ""}`, actorId);
  });
  await notifyOrder(id, "refunded");
}

const CSV_HEADER = [
  "Order", "Placed (IST)", "Status", "Customer", "Phone", "Email", "Address line 1", "Address line 2", "Landmark", "City", "State", "PIN",
  "Items", "SKUs", "Units", "Subtotal", "Discount", "Shipping", "Total", "Coupon / offer", "Payment ID", "Carrier", "Tracking number", "Customer note",
];

export async function exportOrdersCsv(sel: AdminOrderFilter & { ids?: string[] }): Promise<string> {
  const where: Prisma.OrderWhereInput = sel.ids?.length ? { id: { in: sel.ids.slice(0, EXPORT_LIMIT) } } : adminOrderWhere(sel);
  const rows = await db.order.findMany({ where, orderBy: { createdAt: "asc" }, take: EXPORT_LIMIT, include: orderWithItems });
  return toCsv([
    CSV_HEADER,
    ...rows.map((o) => [
      o.number, formatDateTimeIst(o.createdAt), ORDER_STATUS_LABEL[o.status], o.shipName, o.shipPhone, o.email,
      o.shipLine1, o.shipLine2, o.shipLandmark, o.shipCity, o.shipState, o.shipPincode,
      o.items.map((i) => `${i.productName} (${i.colorName}/${i.size}) x${i.quantity}`).join("; "),
      o.items.map((i) => i.sku).join("; "),
      o.items.reduce((s, i) => s + i.quantity, 0),
      paiseToRupees(o.subtotalPaise), paiseToRupees(o.discountPaise), paiseToRupees(o.shippingPaise), paiseToRupees(o.totalPaise),
      o.couponCode ?? o.offerLabel, o.providerPaymentId, o.carrier, o.trackingNumber, o.customerNote,
    ]),
  ]);
}

export async function countToShip(): Promise<number> {
  return db.order.count({ where: { status: { in: [...TO_SHIP_STATUSES] } } });
}

export async function getOrdersForPrint(ids: string[]): Promise<OrderView[]> {
  const unique = [...new Set(ids)].slice(0, 100);
  if (unique.length === 0) return [];
  const rows = await db.order.findMany({ where: { id: { in: unique } }, include: orderWithItems });
  const byId = new Map(rows.map((r) => [r.id, toOrderView(r)]));
  return unique.map((id) => byId.get(id)).filter((o): o is OrderView => Boolean(o));
}
