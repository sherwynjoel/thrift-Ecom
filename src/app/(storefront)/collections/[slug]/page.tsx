import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FilterRail } from "@/components/storefront/filter-rail";
import { LoadMore } from "@/components/storefront/load-more";
import { ProductGrid } from "@/components/storefront/product-grid";
import { SortSelect } from "@/components/storefront/sort-select";
import { NotFoundError } from "@/server/errors";
import { getCollectionBySlug, getFacets, listProducts } from "@/server/services/catalog";
import { parseProductQuery } from "@/lib/validation/catalog";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(slug: string) {
  try {
    return await getCollectionBySlug(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const collection = await load(slug);
  return { title: collection.name, description: collection.description || undefined };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const collection = await load(slug);
  const { filters, sort, page } = parseProductQuery(sp);
  const [products, facets] = await Promise.all([listProducts({ collectionSlug: slug, filters, sort, page }), getFacets(slug)]);
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "page") query.set(k, v);
  const endpoint = `/api/v1/collections/${slug}/products${query.size ? `?${query}` : ""}`;

  return (
    <div className="container-x py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl md:text-7xl">{collection.name}</h1>
          <p className="mt-2 max-w-xl text-text-muted">{collection.description}</p>
          <p className="mt-1 text-sm text-text-muted" data-testid="result-count">{products.total} products</p>
        </div>
        <SortSelect />
      </header>
      <div className="flex gap-10">
        <FilterRail facets={facets} />
        <section className="min-w-0 flex-1">
          <ProductGrid products={products.items} emptyMessage="No tees match those filters." />
          <LoadMore key={endpoint} endpoint={endpoint} initialPage={products.page} hasMore={products.hasMore} />
        </section>
      </div>
    </div>
  );
}
