import { formatDateIst } from "@/lib/dates";
import { promoState, type PromoState } from "@/lib/promotion-labels";
import { cn } from "@/lib/utils";

const TONE: Record<PromoState, string> = {
  Active: "bg-brand text-brand-ink",
  Scheduled: "border border-brand text-brand",
  Ended: "border border-border text-text-muted",
  Inactive: "border border-border text-text-muted",
};

export function PromoStatePill({ promo }: { promo: { active: boolean; startsAt: Date | null; endsAt: Date | null } }) {
  const s = promoState(promo);
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide", TONE[s])} data-testid="promo-state">
      {s}
    </span>
  );
}

export function promoWindow(p: { startsAt: Date | null; endsAt: Date | null }): string {
  if (p.startsAt && p.endsAt) return `${formatDateIst(p.startsAt)} – ${formatDateIst(p.endsAt)}`;
  if (p.startsAt) return `From ${formatDateIst(p.startsAt)}`;
  if (p.endsAt) return `Until ${formatDateIst(p.endsAt)}`;
  return "Always";
}
