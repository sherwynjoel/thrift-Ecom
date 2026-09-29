"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProductCard as Card } from "@/server/services/catalog";
import { ProductCard } from "./product-card";

type PageJson = { data: { items: Card[]; hasMore: boolean } } | { error: { message: string } };

export function LoadMore({ endpoint, initialPage, hasMore }: { endpoint: string; initialPage: number; hasMore: boolean }) {
  const [items, setItems] = useState<Card[]>([]);
  const [page, setPage] = useState(initialPage);
  const [more, setMore] = useState(hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const sep = endpoint.includes("?") ? "&" : "?";
      const res = await fetch(`${endpoint}${sep}page=${page + 1}`);
      const json = (await res.json()) as PageJson;
      if ("error" in json) throw new Error(json.error.message);
      setItems((prev) => [...prev, ...json.data.items]);
      setMore(json.data.hasMore);
      setPage((p) => p + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 space-y-8">
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
      {error && <p className="text-center text-sm text-danger">{error}</p>}
      {more && (
        <div className="text-center">
          <Button variant="secondary" size="lg" onClick={load} disabled={loading} data-testid="load-more">{loading ? "Loading…" : "Load more"}</Button>
        </div>
      )}
    </div>
  );
}
