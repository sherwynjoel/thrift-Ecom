import Link from "next/link";
import { PromoStatePill, promoWindow } from "@/components/admin/promo-state-pill";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { describeCoupon, listCoupons } from "@/server/services/admin-promotions";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Coupons" };
export const dynamic = "force-dynamic";

// Phones: stacked card (code + state, then details). md+: one row, five columns.
const ROW = "grid gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_90px_100px] md:items-center";

export default async function AdminCouponsPage() {
  await requireAdminPage();
  const rows = await listCoupons();
  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl sm:text-5xl">Coupons</h1>
        <Button className="h-11 px-4" render={<Link href="/admin/coupons/new" />} nativeButton={false} data-testid="new-coupon">New coupon</Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-8 text-center text-text-muted" data-testid="coupons-empty">
          No coupons yet. Codes let you run a sale without editing prices.
        </p>
      ) : (
        <div className="rounded-md border border-border">
          <div className={`${ROW} hidden border-b border-border bg-surface px-4 py-2 text-xs uppercase tracking-wide text-text-muted md:grid`}>
            <span>Code</span><span>Discount</span><span>Runs</span><span className="text-right">Used</span><span>Status</span>
          </div>
          <ul data-testid="coupons-table">
            {rows.map((c) => (
              <li key={c.id} className={`${ROW} relative border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface/60`} data-testid="coupon-row">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/coupons/${c.id}`} className="break-all font-mono font-medium after:absolute after:inset-0 hover:underline">{c.code}</Link>
                  <span className="md:hidden"><PromoStatePill promo={c} /></span>
                </div>
                <div className="text-sm">
                  <p>{describeCoupon(c)}</p>
                  {c.minSubtotalPaise > 0 && <p className="text-xs text-text-muted">Min {formatPaise(c.minSubtotalPaise)}</p>}
                </div>
                <p className="text-sm text-text-muted">{promoWindow(c)}</p>
                <p className="text-sm tabular-nums md:text-right">
                  <span className="text-text-muted md:hidden">Used </span>{c.uses} / {c.usageLimit ?? "∞"}
                </p>
                <span className="hidden md:block"><PromoStatePill promo={c} /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
