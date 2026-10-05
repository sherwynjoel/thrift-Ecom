import type { ProductDetail } from "@/server/services/catalog";
import type { RatingSummary, ReviewView } from "@/server/services/reviews";

/** Serialise structured data for a <script type="application/ld+json"> without allowing </script> breakout. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export function productJsonLd(args: { product: ProductDetail; url: string; brandName: string; summary: RatingSummary; reviews: ReviewView[] }): Record<string, unknown> {
  const { product: p, url, summary } = args;
  const abs = (u: string) => new URL(u, url).toString();
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    url,
    image: p.images.map((i) => abs(i.url)),
    description: p.description,
    sku: p.variants[0]?.sku,
    brand: { "@type": "Brand", name: args.brandName },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: (p.pricePaise / 100).toFixed(2),
      availability: p.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  if (summary.count > 0) {
    ld.aggregateRating = { "@type": "AggregateRating", ratingValue: summary.average.toFixed(1), reviewCount: summary.count, bestRating: 5, worstRating: 1 };
    ld.review = args.reviews.slice(0, 5).map((r) => ({
      "@type": "Review",
      ...(r.title ? { name: r.title } : {}),
      reviewBody: r.body,
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      author: { "@type": "Person", name: r.authorName },
      datePublished: r.createdAt.toISOString().slice(0, 10),
    }));
  }
  return ld;
}
