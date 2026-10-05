"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReviewView } from "@/server/services/reviews";
import { ReviewList } from "./review-list";

type ReviewJson = Omit<ReviewView, "createdAt"> & { createdAt: string };
type PageJson = { data: { items: ReviewJson[]; hasMore: boolean } } | { error: { message: string } };

export function MoreReviews({ slug, initialPage, hasMore }: { slug: string; initialPage: number; hasMore: boolean }) {
  const [items, setItems] = useState<ReviewView[]>([]);
  const [page, setPage] = useState(initialPage);
  const [more, setMore] = useState(hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/products/${encodeURIComponent(slug)}/reviews?page=${page + 1}`);
      const json = (await res.json()) as PageJson;
      if ("error" in json) throw new Error(json.error.message);
      // JSON dates arrive as strings.
      setItems((prev) => [...prev, ...json.data.items.map((r) => ({ ...r, createdAt: new Date(r.createdAt) }))]);
      setMore(json.data.hasMore);
      setPage((p) => p + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more reviews");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ReviewList reviews={items} />
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      {more && (
        <Button variant="secondary" onClick={load} disabled={loading} className="mt-4 h-11 w-full sm:w-auto" data-testid="more-reviews">
          {loading ? "Loading…" : "Show more reviews"}
        </Button>
      )}
    </>
  );
}
