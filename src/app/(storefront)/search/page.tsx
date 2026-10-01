import type { Metadata } from "next";
import { Search } from "lucide-react";
import { LoadMore } from "@/components/storefront/load-more";
import { ProductGrid } from "@/components/storefront/product-grid";
import { searchProducts } from "@/server/services/catalog";

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Search: ${q}` : "Search", robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", page } = await searchParams;
  const term = q.trim();
  const results = term ? await searchProducts(term, Math.max(1, Number(page) || 1)) : null;
  return (
    <div className="container-x py-10">
      <form action="/search" role="search" className="mb-8 flex max-w-xl items-center gap-2 rounded-full border border-border bg-surface px-4 py-2">
        <Search className="size-5 text-text-muted" />
        <input name="q" defaultValue={term} placeholder="Search tees" autoFocus className="flex-1 bg-transparent outline-none placeholder:text-text-muted" aria-label="Search products" data-testid="search-input" />
      </form>
      {results ? (
        <>
          <h1 className="mb-2 text-4xl md:text-6xl">Results for “{term}”</h1>
          <p className="mb-8 text-sm text-text-muted" data-testid="result-count">{results.total} products</p>
          <ProductGrid products={results.items} emptyMessage="No tees match that search. Try a color, a fit, or a word from the print." />
          <LoadMore key={term} endpoint={`/api/v1/search?q=${encodeURIComponent(term)}`} initialPage={results.page} hasMore={results.hasMore} />
        </>
      ) : (
        <p className="text-text-muted">Type something to search the catalog.</p>
      )}
    </div>
  );
}
