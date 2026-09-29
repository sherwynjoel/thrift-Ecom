import { db } from "@/server/db";
import { PAID_STATUSES } from "@/lib/order-status";
import { COUPON_UNAVAILABLE, priceCart, type PriceResult, type PricingCoupon, type PricingLine, type PricingOffer } from "@/lib/pricing";
import { getSettings } from "@/server/services/settings";

/** Unknown codes get the same message as unusable ones (see COUPON_UNAVAILABLE). */
export const UNKNOWN_COUPON = COUPON_UNAVAILABLE;

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function getLiveOffers(now: Date = new Date()): Promise<PricingOffer[]> {
  const rows = await db.offer.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((o) => ({
    id: o.id, label: o.label, type: o.type, minQty: o.minQty, pricePaise: o.pricePaise, percent: o.percent,
    collectionId: o.collectionId, active: o.active, startsAt: o.startsAt, endsAt: o.endsAt,
  }));
}

export async function findCoupon(code: string): Promise<PricingCoupon | null> {
  const c = await db.coupon.findUnique({ where: { code: normalizeCouponCode(code) } });
  if (!c) return null;
  return {
    code: c.code, type: c.type, value: c.value, minSubtotalPaise: c.minSubtotalPaise, maxDiscountPaise: c.maxDiscountPaise,
    startsAt: c.startsAt, endsAt: c.endsAt, usageLimit: c.usageLimit, perUserLimit: c.perUserLimit, active: c.active,
  };
}

export async function couponUses(code: string, userId: string | null): Promise<{ total: number; byUser: number }> {
  const where = { couponCode: normalizeCouponCode(code), status: { in: [...PAID_STATUSES] } };
  const [total, byUser] = await Promise.all([
    db.order.count({ where }),
    userId ? db.order.count({ where: { ...where, userId } }) : Promise.resolve(0),
  ]);
  return { total, byUser };
}

/** Server-side price for a set of lines. Always recomputed; never trust a client total. */
export async function quote(args: { lines: PricingLine[]; couponCode?: string | null; userId: string | null; now?: Date }): Promise<PriceResult> {
  const now = args.now ?? new Date();
  const code = args.couponCode ? normalizeCouponCode(args.couponCode) : "";
  const [settings, offers, coupon] = await Promise.all([getSettings(), getLiveOffers(now), code ? findCoupon(code) : Promise.resolve(null)]);
  const uses = coupon ? await couponUses(coupon.code, args.userId) : { total: 0, byUser: 0 };
  const result = priceCart(args.lines, { offers, coupon, settings, now, couponUsesTotal: uses.total, couponUsesByUser: uses.byUser });
  return code && !coupon ? { ...result, couponError: UNKNOWN_COUPON } : result;
}
