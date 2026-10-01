import { Heart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPaise } from "@/lib/money";
import type { AdminProductRow } from "@/server/services/admin-products";
import { StatusBadge } from "./status-badge";

// One DOM for both layouts: a two-line card per product on phones, a table-like grid from md up.
const ROW = "grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[48px_minmax(0,1fr)_110px_80px_80px_90px_70px_100px]";

export function ProductsTable({ rows }: { rows: AdminProductRow[] }) {
  if (!rows.length) return <p className="py-16 text-center text-text-muted" data-testid="products-empty">No products match.</p>;
  return (
    <div className="rounded-md border border-border" data-testid="products-table">
      <div className={`${ROW} hidden border-b border-border bg-surface px-4 py-2 text-xs uppercase tracking-wide text-text-muted md:grid`}>
        <span className="col-span-2">Product</span><span>Status</span><span className="text-right">Variants</span><span className="text-right">Stock</span><span className="text-right">Price</span>
        <span className="text-right"><Heart className="inline size-3.5" aria-hidden /> Saves</span><span className="text-right">Updated</span>
      </div>
      <ul>
        {rows.map((p) => (
          <li key={p.id} className={`${ROW} relative border-b border-border px-4 py-3 text-sm last:border-b-0 hover:bg-surface/60`} data-testid="product-row">
            <span className="relative row-span-2 size-12 overflow-hidden rounded-sm bg-surface-raised md:row-span-1">
              {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="48px" className="object-cover" />}
            </span>
            <Link href={`/admin/products/${p.id}`} className="min-w-0 truncate font-medium after:absolute after:inset-0 hover:underline">{p.name}</Link>
            <span className="justify-self-end md:justify-self-start"><StatusBadge status={p.status} /></span>
            <p className="col-span-2 col-start-2 text-xs text-text-muted md:hidden">
              {p.variantCount} variants · <span className={p.totalStock === 0 ? "text-danger" : undefined}>{p.totalStock} in stock</span> · {formatPaise(p.basePricePaise)} · {p.wishlistCount} saves
            </p>
            <span className="hidden text-right tabular-nums md:block">{p.variantCount}</span>
            <span className={`hidden text-right tabular-nums md:block ${p.totalStock === 0 ? "text-danger" : ""}`}>{p.totalStock}</span>
            <span className="hidden text-right tabular-nums md:block">{formatPaise(p.basePricePaise)}</span>
            <span className="hidden text-right tabular-nums md:block">{p.wishlistCount}</span>
            <span className="hidden text-right text-text-muted md:block">{p.updatedAt.toLocaleDateString("en-IN")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
