import { afterEach, describe, expect, it, vi } from "vitest";
import { collectionMetadata, DEFAULT_OG_IMAGE, metaDescription, productMetadata, websiteJsonLd } from "@/lib/seo";
import robots from "@/app/robots";

afterEach(() => vi.unstubAllEnvs());

describe("seo helpers", () => {
  it("builds plain, bounded descriptions", () => {
    expect(metaDescription("**Heavy** cotton [tee](https://x.test) with `print`.", "fallback")).toBe("Heavy cotton tee with print.");
    expect(metaDescription("   ", "Alpha Tee by Brand")).toBe("Alpha Tee by Brand");
    const long = metaDescription("word ".repeat(80), "x");
    expect(long.length).toBeLessThanOrEqual(155);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });

  it("gives products a canonical url and their first image", () => {
    const m = productMetadata({ slug: "alpha-tee", name: "Alpha Tee", description: "", images: [{ url: "/api/uploads/a.png", alt: "" }] }, "Brand");
    expect(m).toMatchObject({
      title: "Alpha Tee", description: "Alpha Tee by Brand", alternates: { canonical: "/products/alpha-tee" },
      openGraph: { url: "/products/alpha-tee", siteName: "Brand", images: [{ url: "/api/uploads/a.png", alt: "Alpha Tee" }] },
      twitter: { card: "summary_large_image" },
    });
    const bare = productMetadata({ slug: "b", name: "B", description: "d", images: [] }, "Brand");
    expect((bare.openGraph as { images: unknown[] }).images).toEqual([{ ...DEFAULT_OG_IMAGE, alt: "Brand" }]);
  });

  it("canonicalises collections without query strings", () => {
    const m = collectionMetadata({ slug: "new-drops", name: "New Drops", description: "Fresh", heroImageUrl: null }, "Brand");
    expect(m.alternates).toEqual({ canonical: "/collections/new-drops" });
  });

  it("describes the site for search engines", () => {
    const [site, org] = websiteJsonLd({ name: "Brand", url: "https://shop.example.com", sameAs: ["https://instagram.com/x"] });
    expect(site).toMatchObject({ "@type": "WebSite", potentialAction: { "@type": "SearchAction", target: "https://shop.example.com/search?q={search_term_string}" } });
    expect(org).toMatchObject({ "@type": "Organization", url: "https://shop.example.com", sameAs: ["https://instagram.com/x"] });
  });

  it("blocks private areas in production and everything elsewhere", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example.com");
    const prod = robots();
    expect(prod.sitemap).toBe("https://shop.example.com/sitemap.xml");
    const rule = Array.isArray(prod.rules) ? prod.rules[0] : prod.rules;
    expect(rule.allow).toEqual(["/", "/api/uploads/"]);
    expect(rule.disallow).toEqual(expect.arrayContaining(["/admin", "/account", "/checkout", "/api/"]));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");
    const local = robots();
    expect((Array.isArray(local.rules) ? local.rules[0] : local.rules).disallow).toBe("/");
  });
});
