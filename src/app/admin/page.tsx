import Link from "next/link";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import { RevenueBars } from "@/components/admin/revenue-bars";
import { StatTile } from "@/components/admin/stat-tile";
import { Button } from "@/components/ui/button";
import { formatDateIst } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { getDashboardStats } from "@/server/services/admin-dashboard";
import { requireAdminPage } from "./guard";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const CARD = "rounded-md border border-border bg-surface p-4 sm:p-5";

export default async function AdminDashboard() {
  await requireAdminPage();
  const s = await getDashboardStats();
  return (
    <div className="space-y-8 pb-24 lg:pb-0" data-testid="admin-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl sm:text-5xl">Dashboard</h1>
        <Button className="h-11 px-4" render={<Link href="/admin/products/new" />} nativeButton={false}>New product</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="revenue-tiles">
        <StatTile label="Revenue today" value={formatPaise(s.revenue.todayPaise)} hint={`${s.paidToday} ${s.paidToday === 1 ? "order" : "orders"}`} />
        <StatTile label="Last 7 days" value={formatPaise(s.revenue.last7Paise)} />
        <StatTile label="Last 30 days" value={formatPaise(s.revenue.last30Paise)} />
        <StatTile label="To ship" value={s.toShip} href="/admin/orders" tone="warn" />
        <StatTile label="Needs attention" value={s.needsAttention} href="/admin/orders?tab=all&attention=1" tone="warn" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className={CARD} aria-labelledby="bars-heading">
          <h2 id="bars-heading" className="mb-3 text-2xl">Revenue, 14 days</h2>
          <RevenueBars days={s.revenueByDay} />
        </section>
        <section className={CARD} aria-labelledby="top-heading">
          <h2 id="top-heading" className="mb-3 text-2xl">Top products (30 days)</h2>
          <p className="-mt-2 mb-3 text-xs text-text-muted">Gross sales, before discounts and shipping.</p>
          {s.topProducts.length === 0 ? (
            <p className="text-sm text-text-muted" data-testid="top-products-empty">No paid orders in the last 30 days.</p>
          ) : (
            <ol className="space-y-2" data-testid="top-products">
              {s.topProducts.map((p, i) => (
                <li key={p.productName} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-2 text-sm">
                  <span className="text-text-muted tabular-nums">{i + 1}.</span>
                  <span className="min-w-0">
                    <span className="block truncate">{p.productName}</span>
                    <span className="text-xs text-text-muted">{p.units} sold</span>
                  </span>
                  <span className="font-medium tabular-nums" title="Gross sales before discounts">{formatPaise(p.grossSalesPaise)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className={CARD} aria-labelledby="recent-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="recent-heading" className="text-2xl">Recent orders</h2>
          <Link href="/admin/orders?tab=all" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">All orders →</Link>
        </div>
        {s.recentOrders.length === 0 ? (
          <p className="text-sm text-text-muted">No orders yet.</p>
        ) : (
          <ul data-testid="recent-orders">
            {s.recentOrders.map((o) => (
              <li key={o.id} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-border py-2 first:border-t-0 sm:grid-cols-[120px_minmax(0,1fr)_110px_auto_90px]">
                <Link href={`/admin/orders/${o.id}`} className="inline-flex min-h-11 items-center font-medium after:absolute after:inset-0 hover:underline sm:min-h-0">{o.number}</Link>
                <span className="justify-self-end sm:hidden"><OrderStatusBadge status={o.status} /></span>
                <span className="min-w-0 truncate text-sm">{o.customerName}<span className="text-text-muted sm:hidden"> · {formatDateIst(o.createdAt)}</span></span>
                <span className="hidden text-sm text-text-muted sm:block">{formatDateIst(o.createdAt)}</span>
                <span className="hidden sm:block"><OrderStatusBadge status={o.status} /></span>
                <span className="text-right text-sm font-medium tabular-nums">{formatPaise(o.totalPaise)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={CARD} aria-labelledby="low-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="low-heading" className="text-2xl">Running low{s.lowStockVariants > 0 ? ` (${s.lowStockVariants})` : ""}</h2>
          <Link href="/admin/inventory?low=1" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">Inventory →</Link>
        </div>
        {s.lowStock.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="low-stock-empty">Every live variant has more than {s.lowStockThreshold} in stock.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-text-muted">Live variants with {s.lowStockThreshold} or fewer.</p>
            <ul data-testid="low-stock-table">
              {s.lowStock.map((v) => (
                <li key={`${v.productId}-${v.size}-${v.colorName}`} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-border py-2 text-sm first:border-t-0 sm:grid-cols-[minmax(0,1fr)_160px_60px]">
                  <Link href={`/admin/products/${v.productId}`} className="inline-flex min-h-11 min-w-0 items-center truncate after:absolute after:inset-0 hover:underline sm:min-h-0">
                    {v.productName}<span className="ml-1 text-text-muted sm:hidden">· {v.colorName} / {v.size}</span>
                  </Link>
                  <span className="hidden text-text-muted sm:block">{v.colorName} / {v.size}</span>
                  <span className={v.stock === 0 ? "text-right text-danger tabular-nums" : "text-right tabular-nums"}>{v.stock}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="catalog-tiles">
        <StatTile size="sm" label="Live products" value={s.activeProducts} href="/admin/products?status=ACTIVE" />
        <StatTile size="sm" label="Drafts" value={s.draftProducts} href="/admin/products?status=DRAFT" />
        <StatTile size="sm" label="Archived" value={s.archivedProducts} href="/admin/products?status=ARCHIVED" />
        <StatTile size="sm" label="Customers" value={s.customers} href="/admin/customers" />
      </div>
    </div>
  );
}
