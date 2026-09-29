import type { ProductCard as Card } from "@/server/services/catalog";
import { ProductCard } from "./product-card";

export function ProductGrid({ products, emptyMessage = "Nothing here yet." }: { products: Card[]; emptyMessage?: string }) {
  if (!products.length) {
    return <p className="py-20 text-center text-text-muted" data-testid="empty-grid">{emptyMessage}</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4" data-testid="product-grid">
      {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
    </div>
  );
}
