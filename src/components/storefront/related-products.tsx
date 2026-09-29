import type { ProductCard as Card } from "@/server/services/catalog";
import { ProductCard } from "./product-card";

export function RelatedProducts({ products }: { products: Card[] }) {
  if (!products.length) return null;
  return (
    <section className="mt-20" data-testid="related-products">
      <h2 className="mb-6 text-4xl">You may also like</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
