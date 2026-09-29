import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listAdminCollections } from "@/server/services/admin-collections";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Collections" };

export default async function AdminCollectionsPage() {
  await requireAdminPage();
  const rows = await listAdminCollections();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-5xl">Collections</h1>
        <Button render={<Link href="/admin/collections/new" />} nativeButton={false} data-testid="new-collection">New collection</Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[560px] text-sm" data-testid="collections-table">
          <thead className="bg-surface text-left text-text-muted"><tr><th className="p-3">Name</th><th>Visible</th><th>Featured</th><th className="text-right">Products</th><th className="p-3 text-right">Order</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-border" data-testid="collection-row">
                <td className="p-3"><Link href={`/admin/collections/${c.id}`} className="font-medium hover:underline">{c.name}</Link><p className="text-xs text-text-muted">/collections/{c.slug}</p></td>
                <td>{c.isActive ? "Yes" : "No"}</td>
                <td>{c.isFeatured ? "Yes" : "No"}</td>
                <td className="text-right">{c.productCount}</td>
                <td className="p-3 text-right">{c.sortOrder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
