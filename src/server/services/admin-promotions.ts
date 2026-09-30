import { Prisma, type Coupon } from "@prisma/client";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { PAID_STATUSES } from "@/lib/order-status";
import { couponInputSchema, offerInputSchema } from "@/lib/validation/promotions";

export { describeCoupon, describeOffer } from "@/lib/promotion-labels";

export interface CouponRow {
  id: string; code: string; type: "PERCENT" | "FLAT"; value: number; minSubtotalPaise: number; maxDiscountPaise: number | null;
  startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; perUserLimit: number | null; active: boolean; uses: number; createdAt: Date;
}
export interface OfferRow {
  id: string; label: string; type: "BUNDLE_PRICE" | "QTY_PERCENT"; minQty: number; pricePaise: number | null; percent: number | null;
  collectionId: string | null; collectionName: string | null; active: boolean; startsAt: Date | null; endsAt: Date | null; uses: number;
}

const paid = { in: [...PAID_STATUSES] };
const CODE_TAKEN = "A coupon with this code already exists";
const CODE_PENDING = "This code is on orders awaiting payment. Deactivate it instead, or try again after they expire.";
const LABEL_TAKEN = "Another offer already uses this name";

function parseCoupon(input: unknown) {
  const r = couponInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  // A cap only means something on a percent coupon; don't keep a stale one on a flat code.
  return r.data.type === "FLAT" ? { ...r.data, maxDiscountPaise: null } : r.data;
}

function parseOffer(input: unknown) {
  const r = offerInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  // Keep only the field the chosen type uses.
  return r.data.type === "BUNDLE_PRICE" ? { ...r.data, percent: null } : { ...r.data, pricePaise: null };
}

/** Real usage (paid-through-delivered orders carrying the code). Customers only ever see "This code can't be applied". */
async function couponUseCounts(codes: string[]): Promise<Map<string, number>> {
  if (!codes.length) return new Map();
  const g = await db.order.groupBy({ by: ["couponCode"], where: { couponCode: { in: codes }, status: paid }, _count: { _all: true } });
  return new Map(g.map((x) => [x.couponCode ?? "", x._count._all]));
}

const toCouponRow = (r: Coupon, uses: number): CouponRow => ({
  id: r.id, code: r.code, type: r.type, value: r.value, minSubtotalPaise: r.minSubtotalPaise, maxDiscountPaise: r.maxDiscountPaise,
  startsAt: r.startsAt, endsAt: r.endsAt, usageLimit: r.usageLimit, perUserLimit: r.perUserLimit, active: r.active, uses, createdAt: r.createdAt,
});

/**
 * Locks the coupon row (the same lock placeOrder's lockCoupon takes) and counts the orders that hold
 * its code: paid-through-delivered, and unexpired orders awaiting payment (the ones checkout's
 * checkCouponUsage counts against limits). While the lock is held no checkout can attach the code to
 * a new order, so a rename/delete decided here can't strand an order that is being placed right now.
 */
async function lockCouponHolders(tx: Prisma.TransactionClient, id: string): Promise<{ code: string; paidUses: number; pending: number }> {
  const rows = await tx.$queryRaw<{ code: string }[]>`SELECT code FROM "Coupon" WHERE id = ${id} FOR UPDATE`;
  if (!rows[0]) throw new NotFoundError("Coupon");
  const { code } = rows[0];
  const [paidUses, pending] = await Promise.all([
    tx.order.count({ where: { couponCode: code, status: paid } }),
    tx.order.count({ where: { couponCode: code, status: "PENDING_PAYMENT", expiresAt: { gt: new Date() } } }),
  ]);
  return { code, paidUses, pending };
}

export async function listCoupons(): Promise<CouponRow[]> {
  const rows = await db.coupon.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
  const uses = await couponUseCounts(rows.map((r) => r.code));
  return rows.map((r) => toCouponRow(r, uses.get(r.code) ?? 0));
}

export async function getCoupon(id: string): Promise<CouponRow> {
  const r = await db.coupon.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("Coupon");
  return toCouponRow(r, (await couponUseCounts([r.code])).get(r.code) ?? 0);
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createCoupon(input: unknown): Promise<CouponRow> {
  const data = parseCoupon(input);
  if (await db.coupon.findUnique({ where: { code: data.code }, select: { id: true } })) throw new ConflictError(CODE_TAKEN, { code: [CODE_TAKEN] });
  try {
    return toCouponRow(await db.coupon.create({ data }), 0);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(CODE_TAKEN, { code: [CODE_TAKEN] });
    throw err;
  }
}

export async function updateCoupon(id: string, input: unknown): Promise<CouponRow> {
  const data = parseCoupon(input);
  try {
    return await db.$transaction(async (tx) => {
      const held = await lockCouponHolders(tx, id);
      if (data.code !== held.code) {
        if (held.paidUses > 0) {
          const msg = "This code has been used, so it cannot be renamed. Create a new code instead.";
          throw new ConflictError(msg, { code: [msg] });
        }
        if (held.pending > 0) throw new ConflictError(CODE_PENDING, { code: [CODE_PENDING] });
        if (await tx.coupon.findUnique({ where: { code: data.code }, select: { id: true } })) throw new ConflictError(CODE_TAKEN, { code: [CODE_TAKEN] });
      }
      // Displayed uses stay paid-only.
      return toCouponRow(await tx.coupon.update({ where: { id }, data }), held.paidUses);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(CODE_TAKEN, { code: [CODE_TAKEN] });
    throw err;
  }
}

export async function deleteCoupon(id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const held = await lockCouponHolders(tx, id);
    if (held.paidUses > 0) throw new ConflictError("This code has been used. Deactivate it instead of deleting it.");
    if (held.pending > 0) throw new ConflictError(CODE_PENDING);
    await tx.coupon.delete({ where: { id } });
  });
}

async function offerRows(where: Prisma.OfferWhereInput = {}): Promise<OfferRow[]> {
  const rows = await db.offer.findMany({ where, orderBy: [{ active: "desc" }, { createdAt: "desc" }], include: { collection: { select: { name: true } } } });
  const labels = [...new Set(rows.map((r) => r.label))];
  const g = labels.length ? await db.order.groupBy({ by: ["offerLabel"], where: { offerLabel: { in: labels }, status: paid }, _count: { _all: true } }) : [];
  const uses = new Map(g.map((x) => [x.offerLabel ?? "", x._count._all]));
  return rows.map((r) => ({
    id: r.id, label: r.label, type: r.type, minQty: r.minQty, pricePaise: r.pricePaise, percent: r.percent, collectionId: r.collectionId,
    collectionName: r.collection?.name ?? null, active: r.active, startsAt: r.startsAt, endsAt: r.endsAt, uses: uses.get(r.label) ?? 0,
  }));
}

async function assertCollection(collectionId: string | null): Promise<void> {
  if (collectionId && !(await db.collection.findUnique({ where: { id: collectionId }, select: { id: true } }))) {
    throw new ValidationError({ collectionId: ["Unknown collection"] });
  }
}

export async function listOffers(): Promise<OfferRow[]> {
  return offerRows();
}

export async function getOffer(id: string): Promise<OfferRow> {
  const [row] = await offerRows({ id });
  if (!row) throw new NotFoundError("Offer");
  return row;
}

/** Offer names identify offers in reporting (orders snapshot the label), so they are unique, case-insensitively. */
async function assertLabelFree(label: string, exceptId?: string): Promise<void> {
  const clash = await db.offer.findFirst({
    where: { label: { equals: label, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ValidationError({ label: [LABEL_TAKEN] });
}

export async function createOffer(input: unknown): Promise<OfferRow> {
  const data = parseOffer(input);
  await assertLabelFree(data.label);
  await assertCollection(data.collectionId);
  const r = await db.offer.create({ data });
  return getOffer(r.id);
}

export async function updateOffer(id: string, input: unknown): Promise<OfferRow> {
  const data = parseOffer(input);
  const current = await getOffer(id);
  if (data.label !== current.label) {
    // Uses are counted by the label orders recorded, so renaming a used offer would orphan them.
    if (current.uses > 0) {
      const msg = "This offer has been used, so its name is locked. Create a new offer instead.";
      throw new ConflictError(msg, { label: [msg] });
    }
    await assertLabelFree(data.label, id);
  }
  await assertCollection(data.collectionId);
  await db.offer.update({ where: { id }, data });
  return getOffer(id);
}

export async function deleteOffer(id: string): Promise<void> {
  await getOffer(id);
  await db.offer.delete({ where: { id } });
}
