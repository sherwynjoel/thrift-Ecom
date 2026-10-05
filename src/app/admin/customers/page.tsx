import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateIst } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { listCustomers } from "@/server/services/admin-customers";
import { countSubscribers } from "@/server/services/subscribers";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const MAX_PAGE = 1000;

function href(p: { q?: string; page?: number }): string {
  const params = new URLSearchParams();
  if (p.q) params.set("q", p.q);
  if (p.page && p.page > 1) params.set("page", String(p.page));
  const qs = params.toString();
  return `/admin/customers${qs ? `?${qs}` : ""}`;
}

// Phones: name/email on top, stats in a row beneath. md+: one row, five columns.
const ROW = "grid grid-cols-3 gap-x-3 gap-y-1 md:grid-cols-[minmax(0,2fr)_110px_90px_110px_110px] md:items-center";

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = first(sp.q)?.trim().slice(0, 100) || undefined;
  const page = Math.min(Math.max(1, Math.floor(Number(first(sp.page))) || 1), MAX_PAGE);
  const [list, subscribers] = await Promise.all([listCustomers({ q, page }), countSubscribers()]);
  const from = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl sm:text-5xl">Customers</h1>
        {subscribers > 0 && (
          <a href="/admin/subscribers-export" download className="inline-flex min-h-11 items-center text-sm text-text-muted underline-offset-4 hover:text-text hover:underline" data-testid="subscribers-export">
            {subscribers} email {subscribers === 1 ? "signup" : "signups"} · Download CSV
          </a>
        )}
      </div>

      <form method="get" role="search" className="flex w-full min-w-0 gap-2 sm:max-w-md">
        <Label htmlFor="customer-q" className="sr-only">Search customers</Label>
        <Input id="customer-q" name="q" type="search" defaultValue={q ?? ""} className="h-11 min-w-0 flex-1" placeholder="Name, email or phone" enterKeyHint="search" autoComplete="off" />
        <Button type="submit" variant="secondary" className="h-11 px-4">Search</Button>
      </form>
      {q && <Link href={href({})} className="inline-flex min-h-11 items-center text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">Clear search</Link>}

      {list.items.length === 0 ? (
        <p className="py-16 text-center text-text-muted" data-testid="customers-empty">{q ? "No customers match" : "No customers yet."}</p>
      ) : (
        <div className="rounded-md border border-border">
          <div className={`${ROW} hidden border-b border-border bg-surface px-4 py-2 text-xs uppercase tracking-wide text-text-muted md:grid`}>
            <span>Customer</span><span>Joined</span><span className="text-right">Paid orders</span><span className="text-right">Spent</span><span className="text-right">Last order</span>
          </div>
          <ul data-testid="customers-table">
            {list.items.map((c) => (
              <li key={c.id} className={`${ROW} relative border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface/60`} data-testid="customer-row">
                <div className="col-span-3 min-w-0 md:col-span-1">
                  <Link href={`/admin/customers/${c.id}`} className="font-medium after:absolute after:inset-0 hover:underline">{c.name || c.email}</Link>
                  {c.name && <p className="truncate text-xs text-text-muted">{c.email}</p>}
                </div>
                <p className="text-xs text-text-muted md:text-sm"><span className="md:hidden">Joined </span>{formatDateIst(c.createdAt)}</p>
                <p className="text-xs tabular-nums md:text-right md:text-sm">{c.orderCount}<span className="text-text-muted md:hidden"> paid {c.orderCount === 1 ? "order" : "orders"}</span></p>
                <p className="text-right text-xs font-medium tabular-nums md:text-sm">{formatPaise(c.totalSpentPaise)}</p>
                <p className="hidden text-right text-sm text-text-muted md:block">{c.lastOrderAt ? formatDateIst(c.lastOrderAt) : "—"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {list.total > 0 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          {list.page > 1 ? <Link href={href({ q, page: list.page - 1 })} className="inline-flex min-h-11 items-center px-2 hover:underline">← Newer</Link> : <span />}
          <span className="text-text-muted" data-testid="customers-range">Showing {from}–{to} of {list.total}</span>
          {list.hasMore && list.page < MAX_PAGE ? <Link href={href({ q, page: list.page + 1 })} className="inline-flex min-h-11 items-center px-2 hover:underline">Older →</Link> : <span />}
        </div>
      )}
    </div>
  );
}
