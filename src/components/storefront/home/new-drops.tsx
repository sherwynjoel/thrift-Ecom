import { PinnedStrip } from "@/components/motion";
import { ProductCard } from "@/components/storefront/product-card";
import { listProducts } from "@/server/services/catalog";
import { SectionHeading } from "./section-heading";

export async function NewDrops() {
  const { items } = await listProducts({ collectionSlug: "new-drops", sort: "newest", pageSize: 8 });
  if (!items.length) return null;
  return (
    <section className="border-y border-border bg-surface py-20" data-testid="new-drops">
      <div className="container-x"><SectionHeading eyebrow="Just landed" title="New drops" href="/collections/new-drops" /></div>
      <PinnedStrip className="container-x" trackClassName="items-stretch">
        {items.map((p) => (
          <div key={p.id} className="w-[70vw] shrink-0 snap-start sm:w-[40vw] lg:w-[22vw]">
            <ProductCard product={p} />
          </div>
        ))}
      </PinnedStrip>
    </section>
  );
}
