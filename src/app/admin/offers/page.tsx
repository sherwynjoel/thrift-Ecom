import Link from "next/link";
import { PromoStatePill, promoWindow } from "@/components/admin/promo-state-pill";
import { Button } from "@/components/ui/button";
import { describeOffer, listOffers } from "@/server/services/admin-promotions";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Offers" };
export const dynamic = "force-dynamic";

// Phones: stacked card. md+: one row, five columns.
const ROW = "grid gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.4fr)_70px_100px] md:items-center";

export default async function AdminOffersPage() {
  await requireAdminPage();
  const rows = await listOffers();
  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl sm:text-5xl">Offers</h1>
        <Button className="h-11 px-4" render={<Link href="/admin/offers/new" />} nativeButton={false} data-testid="new-offer">New offer</Button>
      </div>
      <p className="text-sm text-text-muted">Customers get the better of the best offer or their coupon, never both.</p>
      {rows.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-8 text-center text-text-muted" data-testid="offers-empty">
          No offers yet. Bundle deals like “Any 3 for ₹999” apply automatically at checkout.
        </p>
      ) : (
        <div className="rounded-md border border-border">
          <div className={`${ROW} hidden border-b border-border bg-surface px-4 py-2 text-xs uppercase tracking-wide text-text-muted md:grid`}>
            <span>Offer</span><span>Applies to</span><span>Runs</span><span className="text-right">Used</span><span>Status</span>
          </div>
          <ul data-testid="offers-table">
            {rows.map((o) => (
              <li key={o.id} className={`${ROW} relative border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface/60`} data-testid="offer-row">
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/offers/${o.id}`} className="break-words font-medium after:absolute after:inset-0 hover:underline">{o.label}</Link>
                    <span className="md:hidden"><PromoStatePill promo={o} /></span>
                  </div>
                  <p className="text-xs text-text-muted">{describeOffer(o)}</p>
                </div>
                <p className="text-sm">{o.collectionName ?? "All products"}</p>
                <p className="text-sm text-text-muted">{promoWindow(o)}</p>
                <p className="text-sm tabular-nums md:text-right"><span className="text-text-muted md:hidden">Used </span>{o.uses}</p>
                <span className="hidden md:block"><PromoStatePill promo={o} /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
