import { describe, expect, it } from "vitest";
import { jsonLdScript, productJsonLd } from "@/lib/json-ld";
import type { ProductDetail } from "@/server/services/catalog";

const product = {
  id: "p1", slug: "alpha-tee", name: "Alpha Tee", fit: "OVERSIZED", pricePaise: 59900, compareAtPricePaise: null,
  images: [{ url: "/api/uploads/products/p1/a.png", alt: "Alpha", colorName: null }, { url: "https://cdn.example.com/b.png", alt: "", colorName: null }],
  colors: [], lowStock: false, soldOut: false, isCustomizable: false, createdAt: new Date("2026-01-01"),
  description: "Heavy tee </script>", fabric: "100% Cotton",
  variants: [{ id: "v1", sku: "ALPHA-BLACK-M", size: "M", colorName: "Black", colorHex: "#000", pricePaise: 59900, stock: 3 }],
  collections: [],
} as ProductDetail;
const noReviews = { average: 0, count: 0, histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

describe("productJsonLd", () => {
  it("describes the offer with absolute urls and no rating when there are no reviews", () => {
    const ld = productJsonLd({ product, url: "https://shop.example.com/products/alpha-tee", brandName: "Brand", summary: noReviews, reviews: [] });
    expect(ld).toMatchObject({
      "@type": "Product", name: "Alpha Tee", sku: "ALPHA-BLACK-M", url: "https://shop.example.com/products/alpha-tee",
      image: ["https://shop.example.com/api/uploads/products/p1/a.png", "https://cdn.example.com/b.png"],
      offers: { "@type": "Offer", price: "599.00", priceCurrency: "INR", availability: "https://schema.org/InStock", url: "https://shop.example.com/products/alpha-tee" },
    });
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(jsonLdScript(ld)).not.toContain("</script>");
  });

  it("adds aggregateRating and up to five reviews", () => {
    const reviews = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, rating: 5, title: i === 0 ? "Great" : null, body: "Nice", authorName: "Asha R.", createdAt: new Date("2026-10-01T10:00:00Z") }));
    const ld = productJsonLd({ product: { ...product, soldOut: true }, url: "https://shop.example.com/products/alpha-tee", brandName: "Brand", summary: { average: 4.5, count: 12, histogram: { 1: 0, 2: 0, 3: 1, 4: 3, 5: 8 } }, reviews });
    expect(ld.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: "4.5", reviewCount: 12, bestRating: 5, worstRating: 1 });
    expect(ld.review).toHaveLength(5);
    expect((ld.review as Record<string, unknown>[])[0]).toMatchObject({ "@type": "Review", name: "Great", author: { "@type": "Person", name: "Asha R." }, datePublished: "2026-10-01" });
    expect((ld.offers as Record<string, string>).availability).toBe("https://schema.org/OutOfStock");
  });
});
