import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listAdminCollections } from "@/server/services/admin-collections";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Collections" };

// Phones: name + a muted summary line. md+: table-like columns.
const ROW = "grid gap-y-1 md:grid-cols-[minmax(0,1fr)_90px_90px_90px_70px] md:items-center md:gap-x-3";

export default async function AdminCollectionsPage() {
  await requireAdminPage();
  const rows = await listAdminCollections();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-5xl">Collections</h1>
        <Button render={<Link href="/admin/collections/new" />} nativeButton={false} className="h-11 px-4" data-testid="new-collection">New collection</Button>
      </div>
      <div className="rounded-md border border-border" data-testid="collections-table">
        <div className={`${ROW} hidden border-b border-border bg-surface px-4 py-2 text-xs uppercase tracking-wide text-text-muted md:grid`}>
          <span>Name</span><span>Visible</span><span>Featured</span><span className="text-right">Products</span><span className="text-right">Order</span>
        </div>
        <ul>
          {rows.map((c) => (
            <li key={c.id} className={`${ROW} relative border-b border-border px-4 py-3 text-sm last:border-b-0 hover:bg-surface/60`} data-testid="collection-row">
              <div className="min-w-0">
                <Link href={`/admin/collections/${c.id}`} className="font-medium after:absolute after:inset-0 hover:underline">{c.name}</Link>
                <p className="truncate text-xs text-text-muted">/collections/{c.slug}</p>
              </div>
              <p className="text-xs text-text-muted md:hidden">
                {c.productCount} products · {c.isActive ? "Visible" : "Hidden"}{c.isFeatured ? " · Featured" : ""} · #{c.sortOrder}
              </p>
              <span className="hidden md:block">{c.isActive ? "Yes" : "No"}</span>
              <span className="hidden md:block">{c.isFeatured ? "Yes" : "No"}</span>
              <span className="hidden text-right tabular-nums md:block">{c.productCount}</span>
              <span className="hidden text-right tabular-nums md:block">{c.sortOrder}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
