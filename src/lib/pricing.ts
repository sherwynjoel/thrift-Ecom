import { formatPaise } from "@/lib/money";

export type OfferKind = "BUNDLE_PRICE" | "QTY_PERCENT";
export type CouponKind = "PERCENT" | "FLAT";

export interface PricingLine { unitPricePaise: number; quantity: number; collectionIds: string[]; custom?: boolean }
export interface PricingOffer {
  id: string; label: string; type: OfferKind; minQty: number; pricePaise: number | null; percent: number | null;
  collectionId: string | null; active: boolean; startsAt: Date | null; endsAt: Date | null;
  /** Custom-print lines count towards the offer only when true. */
  includeCustom?: boolean;
}
export interface PricingCoupon {
  code: string; type: CouponKind; value: number; minSubtotalPaise: number; maxDiscountPaise: number | null;
  startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; perUserLimit: number | null; active: boolean;
}
export interface PricingSettings { shippingFeePaise: number; freeShippingThresholdPaise: number }
export interface PricingContext {
  offers: PricingOffer[]; coupon: PricingCoupon | null; settings: PricingSettings; now: Date;
  couponUsesTotal?: number; couponUsesByUser?: number;
}
export interface PriceResult {
  subtotalPaise: number;
  offer: { label: string; discountPaise: number } | null;
  coupon: { code: string; discountPaise: number } | null;
  couponError?: string;
  applied: "offer" | "coupon" | null;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
}

function live(x: { active: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
  if (!x.active) return false;
  if (x.startsAt && now < x.startsAt) return false;
  if (x.endsAt && now > x.endsAt) return false;
  return true;
}

export function offerDiscount(offer: PricingOffer, lines: PricingLine[]): number {
  const units: number[] = [];
  for (const l of lines) {
    if (l.custom && !offer.includeCustom) continue;
    if (offer.collectionId && !l.collectionIds.includes(offer.collectionId)) continue;
    for (let i = 0; i < l.quantity; i++) units.push(l.unitPricePaise);
  }
  if (offer.minQty < 1 || units.length < offer.minQty) return 0;
  if (offer.type === "QTY_PERCENT") {
    const eligible = units.reduce((s, u) => s + u, 0);
    return Math.floor((eligible * (offer.percent ?? 0)) / 100);
  }
  if (offer.pricePaise === null) return 0;
  units.sort((a, b) => a - b);
  const groups = Math.floor(units.length / offer.minQty);
  let discount = 0;
  for (let g = 0; g < groups; g++) {
    const normal = units.slice(g * offer.minQty, (g + 1) * offer.minQty).reduce((s, u) => s + u, 0);
    discount += normal - Math.min(offer.pricePaise, normal);
  }
  return discount;
}

export function couponDiscount(coupon: PricingCoupon, subtotalPaise: number): number {
  const raw = coupon.type === "PERCENT" ? Math.floor((subtotalPaise * coupon.value) / 100) : coupon.value;
  const capped = coupon.maxDiscountPaise !== null ? Math.min(raw, coupon.maxDiscountPaise) : raw;
  return Math.max(0, Math.min(capped, subtotalPaise));
}

/**
 * One message for every reason a code can't be used except the minimum-subtotal hint: distinct
 * messages (unknown vs inactive vs expired vs used up) would let anyone probe which codes exist.
 */
export const COUPON_UNAVAILABLE = "This code can't be applied";

export function couponProblem(
  coupon: PricingCoupon,
  subtotalPaise: number,
  ctx: Pick<PricingContext, "now" | "couponUsesTotal" | "couponUsesByUser">,
): string | null {
  if (!coupon.active) return COUPON_UNAVAILABLE;
  if (coupon.startsAt && ctx.now < coupon.startsAt) return COUPON_UNAVAILABLE;
  if (coupon.endsAt && ctx.now > coupon.endsAt) return COUPON_UNAVAILABLE;
  if (coupon.usageLimit !== null && (ctx.couponUsesTotal ?? 0) >= coupon.usageLimit) return COUPON_UNAVAILABLE;
  if (coupon.perUserLimit !== null && (ctx.couponUsesByUser ?? 0) >= coupon.perUserLimit) return COUPON_UNAVAILABLE;
  if (subtotalPaise < coupon.minSubtotalPaise) return `Add ${formatPaise(coupon.minSubtotalPaise - subtotalPaise)} more to use this code`;
  return null;
}

export function priceCart(lines: PricingLine[], ctx: PricingContext): PriceResult {
  const subtotalPaise = lines.reduce((s, l) => s + l.unitPricePaise * l.quantity, 0);

  let offer: PriceResult["offer"] = null;
  for (const o of ctx.offers) {
    if (!live(o, ctx.now)) continue;
    const d = Math.min(offerDiscount(o, lines), subtotalPaise);
    if (d > 0 && (!offer || d > offer.discountPaise)) offer = { label: o.label, discountPaise: d };
  }

  let coupon: PriceResult["coupon"] = null;
  let couponError: string | undefined;
  if (ctx.coupon) {
    const problem = couponProblem(ctx.coupon, subtotalPaise, ctx);
    if (problem) couponError = problem;
    else coupon = { code: ctx.coupon.code, discountPaise: couponDiscount(ctx.coupon, subtotalPaise) };
  }

  let applied: PriceResult["applied"] = null;
  let discountPaise = 0;
  if (offer && offer.discountPaise >= (coupon?.discountPaise ?? 0)) {
    applied = "offer";
    discountPaise = offer.discountPaise;
  } else if (coupon && coupon.discountPaise > 0) {
    applied = "coupon";
    discountPaise = coupon.discountPaise;
  }

  const discounted = subtotalPaise - discountPaise;
  const shippingPaise = subtotalPaise === 0 || discounted >= ctx.settings.freeShippingThresholdPaise ? 0 : ctx.settings.shippingFeePaise;
  const totalPaise = Math.max(0, discounted + shippingPaise);
  return { subtotalPaise, offer, coupon, ...(couponError ? { couponError } : {}), applied, discountPaise, shippingPaise, totalPaise };
}

export function discountLabel(r: PriceResult): string | null {
  if (r.applied === "offer" && r.offer) return `Offer: ${r.offer.label}`;
  if (r.applied === "coupon" && r.coupon) return `Code ${r.coupon.code}`;
  return null;
}

/**
 * Pay-time guard (M7): the order total the server charges can differ from the total the checkout
 * showed (an offer started or ended, shipping settings changed). Then the shopper must see the new
 * total and tap Pay again; `acknowledgedPaise` is the server total they were already shown.
 */
export function payTotalChanged(serverPaise: number, shownPaise: number, acknowledgedPaise: number | null): boolean {
  return serverPaise !== shownPaise && serverPaise !== acknowledgedPaise;
}
