import { db } from "@/server/db";

export interface SitemapData {
  products: { slug: string; updatedAt: Date; imageUrl: string | null }[];
  collections: { slug: string; updatedAt: Date }[];
  latest: Date | null;
}

export async function getSitemapData(): Promise<SitemapData> {
  const [products, collections] = await Promise.all([
    db.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 5000,
      select: { slug: true, updatedAt: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
    }),
    db.collection.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, updatedAt: true } }),
  ]);
  return {
    products: products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt, imageUrl: p.images[0]?.url ?? null })),
    collections,
    latest: products[0]?.updatedAt ?? null,
  };
}
