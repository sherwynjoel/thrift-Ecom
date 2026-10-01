import type { OrderItem, OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { getStorage } from "@/server/adapters/storage";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { uploadKeyFromUrl } from "@/server/uploads";
import { addOrderEvent, flagAttentionOnce, type Tx } from "@/server/services/order-records";
import { ORDER_STATUS_LABEL, TO_SHIP_STATUSES } from "@/lib/order-status";
import type { DesignSide } from "@/lib/studio/constants";

/** The print queue works on exactly the orders still waiting to ship (ruling P4). */
export const PRINT_QUEUE_STATUSES = TO_SHIP_STATUSES;
export const holdNoteSchema = z.string().trim().min(3, "Say why this item is on hold").max(300, "Keep the note under 300 characters");

const PRINT_KEY_PREFIX = "designs/print/";
const CUSTOM_ITEM: Prisma.OrderItemWhereInput = { OR: [{ printFrontUrl: { not: null } }, { printBackUrl: { not: null } }] };
const QUEUE_WHERE: Prisma.OrderItemWhereInput = { ...CUSTOM_ITEM, printedAt: null, order: { status: { in: [...PRINT_QUEUE_STATUSES] } } };
const inQueue = (s: OrderStatus) => (PRINT_QUEUE_STATUSES as readonly OrderStatus[]).includes(s);

export interface PrintQueueItem {
  itemId: string; orderId: string; orderNumber: string; orderStatus: OrderStatus; paidAt: Date | null;
  productName: string; colorName: string; size: string; sku: string; quantity: number;
  frontPreviewUrl: string | null; backPreviewUrl: string | null; hasFrontPrint: boolean; hasBackPrint: boolean;
  heldAt: Date | null; holdNote: string | null; customerName: string; customerPhone: string;
}

export async function listPrintQueue(): Promise<PrintQueueItem[]> {
  const rows = await db.orderItem.findMany({
    where: QUEUE_WHERE,
    orderBy: [{ order: { paidAt: "asc" } }, { order: { createdAt: "asc" } }, { id: "asc" }],
    take: 500,
    include: { order: { select: { id: true, number: true, status: true, paidAt: true, shipName: true, shipPhone: true } } },
  });
  return rows.map((i) => ({
    itemId: i.id, orderId: i.order.id, orderNumber: i.order.number, orderStatus: i.order.status, paidAt: i.order.paidAt,
    productName: i.productName, colorName: i.colorName, size: i.size, sku: i.sku, quantity: i.quantity,
    frontPreviewUrl: i.designFrontPreviewUrl, backPreviewUrl: i.designBackPreviewUrl,
    hasFrontPrint: i.printFrontUrl !== null, hasBackPrint: i.printBackUrl !== null,
    heldAt: i.heldAt, holdNote: i.holdNote, customerName: i.order.shipName, customerPhone: i.order.shipPhone,
  }));
}

export async function countPrintQueue(): Promise<number> {
  return db.orderItem.count({ where: QUEUE_WHERE });
}

const itemLabel = (i: { productName: string; colorName: string; size: string; quantity: number }) => `${i.productName} (${i.colorName} / ${i.size}) × ${i.quantity}`;

/**
 * Runs `fn` with the item's order row locked (`FOR UPDATE`) and the item re-read under that lock, so
 * two "Mark printed" clicks on sibling items of one order serialize: without it, each transaction
 * would still see the other's item as unprinted and neither would move the order to Processing.
 * Hold / release / mark printed of one item can't interleave either. Refuses items outside the queue.
 */
async function withQueuedItem<T>(itemId: string, fn: (tx: Tx, item: OrderItem) => Promise<T>): Promise<T> {
  const found = await db.orderItem.findFirst({ where: { id: itemId, ...CUSTOM_ITEM }, select: { orderId: true } });
  if (!found) throw new NotFoundError("Custom item");
  return db.$transaction(async (tx) => {
    const [order] = await tx.$queryRaw<{ status: OrderStatus }[]>`SELECT status FROM "Order" WHERE id = ${found.orderId} FOR UPDATE`;
    const item = await tx.orderItem.findUniqueOrThrow({ where: { id: itemId } });
    if (!inQueue(order.status)) throw new ConflictError(`A ${ORDER_STATUS_LABEL[order.status].toLowerCase()} order is not in the print queue`);
    return fn(tx, item);
  });
}

export async function markItemPrinted(itemId: string, actorId: string | null): Promise<{ orderMovedToProcessing: boolean }> {
  const moved = await withQueuedItem(itemId, async (tx, item) => {
    if (item.printedAt) throw new ConflictError("This item is already printed");
    if (item.heldAt) throw new ConflictError("Release the hold before marking this item printed");
    await tx.orderItem.update({ where: { id: itemId }, data: { printedAt: new Date() } });
    await addOrderEvent(tx, item.orderId, "PRINTED", `Printed ${itemLabel(item)}`, actorId);
    const remaining = await tx.orderItem.count({ where: { orderId: item.orderId, printedAt: null, ...CUSTOM_ITEM } });
    if (remaining > 0) return false;
    // Only PAID moves on: a PROCESSING order is already there (conditional, like every status move in orders.ts).
    const u = await tx.order.updateMany({ where: { id: item.orderId, status: "PAID" }, data: { status: "PROCESSING", processingAt: new Date() } });
    if (u.count !== 1) return false;
    await addOrderEvent(tx, item.orderId, "STATUS_CHANGED", `${ORDER_STATUS_LABEL.PAID} → ${ORDER_STATUS_LABEL.PROCESSING} (all custom prints done)`, actorId);
    return true;
  });
  return { orderMovedToProcessing: moved };
}

export async function holdItem(itemId: string, note: unknown, actorId: string | null): Promise<void> {
  const parsed = holdNoteSchema.safeParse(note);
  if (!parsed.success) throw new ValidationError({ note: zodFieldErrors(parsed.error).form ?? ["Say why this item is on hold"] });
  await withQueuedItem(itemId, async (tx, item) => {
    if (item.printedAt) throw new ConflictError("This item is already printed");
    await tx.orderItem.update({ where: { id: itemId }, data: { heldAt: new Date(), holdNote: parsed.data } });
    const message = `Custom print on hold, ${itemLabel(item)}: ${parsed.data}`;
    // Already flagged for something else: keep that flag and record the hold as a note.
    if (!(await flagAttentionOnce(item.orderId, message, { tx, actorId }))) await addOrderEvent(tx, item.orderId, "NOTE", message, actorId);
  });
}

export async function releaseHold(itemId: string, actorId: string | null): Promise<void> {
  await withQueuedItem(itemId, async (tx, item) => {
    if (!item.heldAt) throw new ConflictError("This item is not on hold");
    await tx.orderItem.update({ where: { id: itemId }, data: { heldAt: null, holdNote: null } });
    await addOrderEvent(tx, item.orderId, "NOTE", `Hold released on ${itemLabel(item)}`, actorId);
  });
}

/** The 300 DPI print PNG of one side, read from storage. Only keys under designs/print/ are ever served. */
export async function getPrintFile(itemId: string, side: DesignSide): Promise<{ bytes: Uint8Array; filename: string }> {
  const item = await db.orderItem.findUnique({ where: { id: itemId }, select: { sku: true, printFrontUrl: true, printBackUrl: true, order: { select: { number: true } } } });
  const url = item ? (side === "front" ? item.printFrontUrl : item.printBackUrl) : null;
  const key = url ? uploadKeyFromUrl(url) : null;
  const bytes = key?.startsWith(PRINT_KEY_PREFIX) ? await getStorage().get(key) : null;
  if (!item || !bytes) throw new NotFoundError("Print file");
  const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "-");
  return { bytes, filename: `${safe(item.order.number)}-${safe(item.sku)}-${side}.png` };
}
