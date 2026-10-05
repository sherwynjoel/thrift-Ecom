import { Marquee } from "@/components/motion";
import { BRAND } from "@/config/brand";
import { formatPaise } from "@/lib/money";

export const DEFAULT_TICKER_ITEMS = [`Free delivery over ${formatPaise(BRAND.freeShippingThresholdPaise)}`, "240 GSM heavyweight cotton", "New drops every week", "Print your own design", "7-day exchange"];

export function Ticker({ items = DEFAULT_TICKER_ITEMS }: { items?: string[] }) {
  return (
    <div className="border-y border-border bg-brand text-brand-ink" data-testid="ticker">
      <Marquee speed={28} className="py-2 font-display text-2xl uppercase tracking-wide">
        {items.map((t, i) => (
          <span key={`${i}-${t}`} className="inline-flex items-center gap-8">{t}<span aria-hidden="true">✦</span></span>
        ))}
      </Marquee>
    </div>
  );
}
