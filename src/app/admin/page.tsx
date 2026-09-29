import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/admin/stat-tile";
import { getDashboardStats } from "@/server/services/admin-dashboard";
import { requireAdminPage } from "./guard";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  await requireAdminPage();
  const s = await getDashboardStats();
  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-5xl">Dashboard</h1>
        <Button render={<Link href="/admin/products/new" />} nativeButton={false}>New product</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Live products" value={s.activeProducts} href="/admin/products?status=ACTIVE" />
        <StatTile label="Drafts" value={s.draftProducts} href="/admin/products?status=DRAFT" />
        <StatTile label="Archived" value={s.archivedProducts} href="/admin/products?status=ARCHIVED" />
        <StatTile label="Low-stock variants" value={s.lowStockVariants} tone="warn" />
        <StatTile label="Customers" value={s.customers} />
      </div>
      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="mb-4 text-2xl">Running low</h2>
        {s.lowStock.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="low-stock-empty">Every live variant has 5 or more in stock.</p>
        ) : (
          <table className="w-full text-sm" data-testid="low-stock-table">
            <thead><tr className="text-left text-text-muted"><th className="py-2">Product</th><th>Variant</th><th className="text-right">Stock</th></tr></thead>
            <tbody>
              {s.lowStock.map((v) => (
                <tr key={`${v.productId}-${v.size}-${v.colorName}`} className="border-t border-border">
                  <td className="py-2"><Link href={`/admin/products/${v.productId}`} className="hover:underline">{v.productName}</Link></td>
                  <td>{v.colorName} / {v.size}</td>
                  <td className={v.stock === 0 ? "text-right text-danger" : "text-right"}>{v.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
