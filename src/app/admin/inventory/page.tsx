import Link from "next/link";
import { InventoryTable } from "@/components/admin/inventory-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { listInventory } from "@/server/services/admin-inventory";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const MAX_PAGE = 1000;

function href(p: { q?: string; low?: boolean; page?: number }): string {
  const params = new URLSearchParams();
  if (p.low) params.set("low", "1");
  if (p.q) params.set("q", p.q);
  if (p.page && p.page > 1) params.set("page", String(p.page));
  const qs = params.toString();
  return `/admin/inventory${qs ? `?${qs}` : ""}`;
}

const PILL = "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm";

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = first(sp.q)?.trim().slice(0, 100) || undefined;
  const low = first(sp.low) === "1";
  const page = Math.min(Math.max(1, Math.floor(Number(first(sp.page))) || 1), MAX_PAGE);
  const inv = await listInventory({ q, lowOnly: low, page });
  const from = inv.total === 0 ? 0 : (inv.page - 1) * inv.pageSize + 1;
  const to = Math.min(inv.page * inv.pageSize, inv.total);

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <h1 className="text-4xl sm:text-5xl">Inventory</h1>

      <nav aria-label="Stock filter">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link href={href({ q })} aria-current={!low ? "page" : undefined} className={cn(PILL, !low ? "border-brand bg-brand text-brand-ink" : "border-border text-text-muted hover:text-text")}>All</Link>
          </li>
          <li>
            <Link
              href={href({ q, low: true })}
              aria-current={low ? "page" : undefined}
              data-testid="low-filter"
              className={cn(PILL, low ? "border-brand bg-brand text-brand-ink" : inv.lowCount > 0 ? "border-amber-500/40 text-amber-300 hover:bg-amber-500/10" : "border-border text-text-muted hover:text-text")}
            >
              Low stock ({inv.lowCount})
            </Link>
          </li>
        </ul>
      </nav>

      <form method="get" role="search" className="flex w-full min-w-0 gap-2 sm:max-w-md">
        <Label htmlFor="inv-q" className="sr-only">Search inventory</Label>
        <Input id="inv-q" name="q" type="search" defaultValue={q ?? ""} className="h-11 min-w-0 flex-1" placeholder="SKU, product or colour" enterKeyHint="search" autoComplete="off" />
        {low && <input type="hidden" name="low" value="1" />}
        <Button type="submit" variant="secondary" className="h-11 px-4">Search</Button>
      </form>

      <p className="text-sm text-text-muted">
        Low = {inv.threshold} or fewer. Change the threshold in <Link href="/admin/settings" className="underline underline-offset-4 hover:text-text">Settings</Link>.
      </p>

      {inv.items.length === 0 ? (
        <p className="py-16 text-center text-text-muted" data-testid="inventory-empty">
          {q ? "Nothing matches that search." : low ? "Nothing is running low." : "No variants yet. Add a product first."}
        </p>
      ) : (
        <InventoryTable rows={inv.items} threshold={inv.threshold} />
      )}

      {inv.total > 0 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          {inv.page > 1 ? <Link href={href({ q, low, page: inv.page - 1 })} className="inline-flex min-h-11 items-center px-2 hover:underline">← Previous</Link> : <span />}
          <span className="text-text-muted">Showing {from}–{to} of {inv.total}</span>
          {inv.hasMore && inv.page < MAX_PAGE ? <Link href={href({ q, low, page: inv.page + 1 })} className="inline-flex min-h-11 items-center px-2 hover:underline">Next →</Link> : <span />}
        </div>
      )}
    </div>
  );
}
