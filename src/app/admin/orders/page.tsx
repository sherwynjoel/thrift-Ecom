import Link from "next/link";
import { OrdersTable } from "@/components/admin/orders/orders-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseOrderTab, type OrderTab } from "@/lib/order-tabs";
import { cn } from "@/lib/utils";
import { listAdminOrders } from "@/server/services/admin-orders";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function query(p: { tab?: OrderTab; q?: string; attention?: boolean; page?: number }): string {
  const params = new URLSearchParams();
  if (p.q) params.set("q", p.q);
  else if (p.tab && p.tab !== "to-ship") params.set("tab", p.tab);
  if (p.attention) params.set("attention", "1");
  if (p.page && p.page > 1) params.set("page", String(p.page));
  return params.toString();
}
const href = (qs: string) => `/admin/orders${qs ? `?${qs}` : ""}`;

const EMPTY: Record<OrderTab, string> = {
  "to-ship": "Nothing to ship. Nice.",
  pending: "No orders are waiting for payment.",
  shipped: "Nothing in transit.",
  delivered: "No delivered orders yet.",
  closed: "No cancelled or refunded orders.",
  all: "No orders yet.",
};

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = first(sp.q)?.trim().slice(0, 100) || undefined;
  const tab = parseOrderTab(first(sp.tab));
  const attention = first(sp.attention) === "1";
  const page = Math.max(1, Math.floor(Number(first(sp.page))) || 1);
  const list = await listAdminOrders({ tab, q, attention, page });

  // What the header export and the bulk bar's "Export all matching" use: the current search (or tab) and attention filter, no page.
  const exportParams = new URLSearchParams(q ? { q } : { tab });
  if (attention) exportParams.set("attention", "1");
  const exportQuery = exportParams.toString();
  const from = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-5xl">Orders</h1>
        <Button variant="secondary" className="h-11 px-4" render={<a href={`/admin/orders/export?${exportQuery}`} />} nativeButton={false} data-testid="export-csv">
          Export CSV
        </Button>
      </div>

      <nav aria-label="Order status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 whitespace-nowrap pb-1">
          {list.tabs.map((t) => {
            const active = t.id === list.activeTab;
            return (
              <li key={t.id}>
                <Link
                  href={href(query({ tab: t.id, attention }))}
                  aria-current={active ? "page" : undefined}
                  data-testid={`tab-${t.id}`}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm",
                    active ? "border-brand bg-brand text-brand-ink" : "border-border text-text-muted hover:text-text",
                  )}
                >
                  {t.label}
                  <span className={cn("tabular-nums", active ? "font-semibold" : "text-text")}>{t.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <form method="get" role="search" className="flex w-full min-w-0 gap-2 sm:w-auto sm:max-w-md sm:flex-1">
          <Label htmlFor="order-q" className="sr-only">Search orders</Label>
          <Input id="order-q" name="q" type="search" defaultValue={q ?? ""} className="h-11 min-w-0 flex-1" placeholder="Order #, name, email, phone, PIN" enterKeyHint="search" autoComplete="off" />
          {!q && tab !== "to-ship" && <input type="hidden" name="tab" value={tab} />}
          {attention && <input type="hidden" name="attention" value="1" />}
          <Button type="submit" variant="secondary" className="h-11 px-4">Search</Button>
        </form>
        <Link
          href={href(query({ tab, q, attention: !attention }))}
          aria-pressed={attention}
          data-testid="attention-filter"
          className={cn(
            "inline-flex min-h-11 items-center rounded-md border px-3 text-sm",
            attention
              ? "border-amber-400 bg-amber-500/20 text-amber-200"
              : list.attentionCount > 0
                ? "border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                : "border-border text-text-muted hover:text-text",
          )}
        >
          Needs attention ({list.attentionCount})
        </Link>
        {q && (
          <Link href={href(query({ attention }))} className="inline-flex min-h-11 items-center px-2 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
            Clear search
          </Link>
        )}
      </div>

      {list.items.length === 0 ? (
        <p className="py-16 text-center text-text-muted" data-testid="orders-empty">
          {q || attention ? "No orders match" : EMPTY[list.activeTab]}
        </p>
      ) : (
        <OrdersTable key={`${list.activeTab}|${q ?? ""}|${attention}|${list.page}`} rows={list.items} exportQuery={exportQuery} />
      )}

      {list.total > 0 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          {list.page > 1 ? (
            <Link href={href(query({ tab, q, attention, page: list.page - 1 }))} className="inline-flex min-h-11 items-center px-2 hover:underline">
              ← {list.activeTab === "to-ship" ? "Older" : "Newer"}
            </Link>
          ) : <span />}
          <span className="text-text-muted" data-testid="orders-range">Showing {from}–{to} of {list.total}</span>
          {list.hasMore ? (
            <Link href={href(query({ tab, q, attention, page: list.page + 1 }))} className="inline-flex min-h-11 items-center px-2 hover:underline">
              {list.activeTab === "to-ship" ? "Newer" : "Older"} →
            </Link>
          ) : <span />}
        </div>
      )}
    </div>
  );
}
