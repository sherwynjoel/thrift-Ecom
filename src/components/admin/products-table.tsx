import { Heart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPaise } from "@/lib/money";
import type { AdminProductRow } from "@/server/services/admin-products";
import { StatusBadge } from "./status-badge";

export function ProductsTable({ rows }: { rows: AdminProductRow[] }) {
  if (!rows.length) return <p className="py-16 text-center text-text-muted" data-testid="products-empty">No products match.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] text-sm" data-testid="products-table">
        <thead className="bg-surface text-left text-text-muted">
          <tr><th className="p-3">Product</th><th>Status</th><th className="text-right">Variants</th><th className="text-right">Stock</th><th className="text-right">Price</th><th className="text-right"><Heart className="inline size-4" aria-hidden /> <span>Saves</span></th><th className="p-3 text-right">Updated</th></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border hover:bg-surface/60" data-testid="product-row">
              <td className="p-3">
                <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 font-medium hover:underline">
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-sm bg-surface-raised">
                    {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" />}
                  </span>
                  {p.name}
                </Link>
              </td>
              <td><StatusBadge status={p.status} /></td>
              <td className="text-right">{p.variantCount}</td>
              <td className={p.totalStock === 0 ? "text-right text-danger" : "text-right"}>{p.totalStock}</td>
              <td className="text-right">{formatPaise(p.basePricePaise)}</td>
              <td className="text-right">{p.wishlistCount}</td>
              <td className="p-3 text-right text-text-muted">{p.updatedAt.toLocaleDateString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
