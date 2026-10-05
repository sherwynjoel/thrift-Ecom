import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/storefront/account/account-nav";
import { OrderCard } from "@/components/storefront/account/order-card";
import { NO_INDEX } from "@/lib/seo";
import { auth } from "@/server/auth";
import { listOrdersForUser } from "@/server/services/orders";

export const metadata: Metadata = { title: "Orders", robots: NO_INDEX };

function pageParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export default async function AccountOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=%2Faccount%2Forders");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const orders = await listOrdersForUser(session.user.id, { page, pageSize: 10 });

  return (
    <div className="container-x space-y-6 py-10">
      <h1 className="text-5xl md:text-7xl">Orders</h1>
      <AccountNav />
      {orders.items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface p-8" data-testid="orders-empty">
          <p className="font-display text-2xl">No orders yet</p>
          <Link href="/collections/new-drops" className="mt-4 inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline">Browse new drops</Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {orders.items.map((order) => <li key={order.id}><OrderCard order={order} /></li>)}
          </ul>
          {(page > 1 || orders.hasMore) && (
            <nav className="flex items-center justify-between gap-4" aria-label="Order pagination">
              {page > 1 ? (
                <Link href={`/account/orders?page=${page - 1}`} className="inline-flex min-h-11 items-center px-3 text-sm underline-offset-4 hover:underline">← Newer</Link>
              ) : <span />}
              {orders.hasMore && (
                <Link href={`/account/orders?page=${page + 1}`} className="inline-flex min-h-11 items-center px-3 text-sm underline-offset-4 hover:underline">Older →</Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
