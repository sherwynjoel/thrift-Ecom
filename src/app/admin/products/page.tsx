import Link from "next/link";
import type { ProductStatus } from "@prisma/client";
import { ProductsTable } from "@/components/admin/products-table";
import { Button } from "@/components/ui/button";
import { listAdminProducts } from "@/server/services/admin-products";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Products" };

const STATUSES: ProductStatus[] = ["ACTIVE", "DRAFT", "ARCHIVED"];

type Props = { searchParams: Promise<{ q?: string | string[]; status?: string; page?: string }> };

export default async function AdminProductsPage({ searchParams }: Props) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const status = STATUSES.find((s) => s === sp.status);
  const page = Math.max(1, Number(sp.page) || 1);
  const result = await listAdminProducts({ q, status, page });
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (p > 1) params.set("page", String(p));
    return `/admin/products${params.size ? `?${params}` : ""}`;
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl">Products</h1>
          <p className="text-sm text-text-muted" data-testid="products-count">{result.total} products</p>
        </div>
        <Button render={<Link href="/admin/products/new" />} nativeButton={false} data-testid="new-product">New product</Button>
      </div>
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q ?? ""} placeholder="Search name or slug" aria-label="Search products" className="h-9 w-64 rounded-md border border-border bg-surface px-3 text-sm" />
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className="h-9 rounded-md border border-border bg-surface px-3 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <ProductsTable rows={result.items} />
      <div className="flex items-center justify-between text-sm">
        {page > 1 ? <Link href={link(page - 1)} className="hover:underline">← Previous</Link> : <span />}
        <span className="text-text-muted">Page {page}</span>
        {result.hasMore ? <Link href={link(page + 1)} className="hover:underline">Next →</Link> : <span />}
      </div>
    </div>
  );
}
