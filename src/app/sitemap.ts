import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";
import { listPageSlugs } from "@/server/content";
import { getSitemapData } from "@/server/services/seo";

// Reads the database: must not be prerendered at build time (the Docker build has no database).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ products, collections, latest }, pages] = await Promise.all([getSitemapData(), listPageSlugs()]);
  return [
    { url: absoluteUrl("/"), lastModified: latest ?? undefined, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/collections"), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/customize"), changeFrequency: "weekly", priority: 0.6 },
    ...collections.map((c) => ({ url: absoluteUrl(`/collections/${c.slug}`), lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({
      url: absoluteUrl(`/products/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.7,
      ...(p.imageUrl ? { images: [absoluteUrl(p.imageUrl)] } : {}),
    })),
    ...pages.map((slug) => ({ url: absoluteUrl(`/pages/${slug}`), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
