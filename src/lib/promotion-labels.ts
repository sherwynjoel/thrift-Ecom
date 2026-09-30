import { formatPaise } from "@/lib/money";

// Pure (no server imports) so client forms can show the same wording as the admin lists.

export function describeCoupon(c: { type: "PERCENT" | "FLAT"; value: number; maxDiscountPaise: number | null }): string {
  if (c.type === "FLAT") return `${formatPaise(c.value)} off`;
  return `${c.value}% off${c.maxDiscountPaise ? ` (max ${formatPaise(c.maxDiscountPaise)})` : ""}`;
}

export function describeOffer(o: { type: "BUNDLE_PRICE" | "QTY_PERCENT"; minQty: number; pricePaise: number | null; percent: number | null }): string {
  return o.type === "BUNDLE_PRICE" ? `Any ${o.minQty} for ${formatPaise(o.pricePaise ?? 0)}` : `${o.percent ?? 0}% off ${o.minQty} or more`;
}

export type PromoState = "Active" | "Inactive" | "Scheduled" | "Ended";

/** What a coupon/offer is doing right now: switched off, waiting for its start, past its end, or live. */
export function promoState(p: { active: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date = new Date()): PromoState {
  if (!p.active) return "Inactive";
  if (p.endsAt && p.endsAt <= now) return "Ended";
  if (p.startsAt && p.startsAt > now) return "Scheduled";
  return "Active";
}
