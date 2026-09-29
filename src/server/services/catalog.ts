import { Prisma, type Fit } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { SIZES } from "@/lib/sizes";
import { PRODUCT_SORTS, type ProductFilters, type ProductSort } from "@/lib/catalog-types";

export { PRODUCT_SORTS };
export type { ProductFilters, ProductSort };

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  fit: Fit;
  pricePaise: number;
  compareAtPricePaise: number | null;
  images: { url: string; alt: string }[];
  colors: { name: string; hex: string }[];
  lowStock: boolean;
  isCustomizable: boolean;
  createdAt: Date;
}

export interface ProductDetail extends Omit<ProductCard, "images"> {
  images: { url: string; alt: string; colorName: string | null }[];
  description: string;
  fabric: string;
  variants: { id: string; sku: string; size: string; colorName: string; colorHex: string; pricePaise: number; stock: number }[];
  collections: { slug: string; name: string }[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface CollectionSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  heroImageUrl: string | null;
  isFeatured: boolean;
  productCount: number;
}

export interface Facets {
  sizes: string[];
  colors: { name: string; hex: string }[];
  fits: Fit[];
  minPricePaise: number;
  maxPricePaise: number;
}

const LOW_STOCK_AT = 5;
const DEFAULT_PAGE_SIZE = 24;

const cardInclude = {
  images: { orderBy: { sortOrder: "asc" as const }, take: 2 },
  variants: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.ProductInclude;

type ProductWithCard = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

function toCard(p: ProductWithCard): ProductCard {
  const seen = new Map<string, string>();
  for (const v of p.variants) if (!seen.has(v.colorName)) seen.set(v.colorName, v.colorHex);
  const stocks = p.variants.map((v) => v.stock);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    fit: p.fit,
    pricePaise: p.basePricePaise,
    compareAtPricePaise: p.compareAtPricePaise,
    images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
    colors: [...seen].map(([name, hex]) => ({ name, hex })),
    lowStock: stocks.length > 0 && stocks.every((s) => s < LOW_STOCK_AT),
    isCustomizable: p.isCustomizable,
    createdAt: p.createdAt,
  };
}

function productWhere(collectionSlug: string | undefined, f: ProductFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { status: "ACTIVE" };
  if (collectionSlug) where.collections = { some: { collection: { slug: collectionSlug, isActive: true } } };
  if (f.fit?.length) where.fit = { in: f.fit };
  if (f.minPricePaise !== undefined || f.maxPricePaise !== undefined) {
    where.basePricePaise = { gte: f.minPricePaise, lte: f.maxPricePaise };
  }
  const variantWhere: Prisma.ProductVariantWhereInput = {};
  if (f.size?.length) variantWhere.size = { in: f.size };
  if (f.color?.length) variantWhere.colorName = { in: f.color };
  if (Object.keys(variantWhere).length) where.variants = { some: variantWhere };
  return where;
}

function productOrder(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ basePricePaise: "asc" }, { createdAt: "desc" }];
    case "price-desc":
      return [{ basePricePaise: "desc" }, { createdAt: "desc" }];
    case "newest":
    case "featured":
    default:
      return [{ createdAt: "desc" }];
  }
}

async function pageProducts(
  where: Prisma.ProductWhereInput,
  orderBy: Prisma.ProductOrderByWithRelationInput[],
  page: number,
  pageSize: number,
): Promise<Page<ProductCard>> {
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: cardInclude }),
  ]);
  return { items: rows.map(toCard), total, page, pageSize, hasMore: page * pageSize < total };
}

const collectionInclude = {
  _count: { select: { products: { where: { product: { status: "ACTIVE" as const } } } } },
} satisfies Prisma.CollectionInclude;

type CollectionWithCount = Prisma.CollectionGetPayload<{ include: typeof collectionInclude }>;

function toCollection(c: CollectionWithCount): CollectionSummary {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    heroImageUrl: c.heroImageUrl,
    isFeatured: c.isFeatured,
    productCount: c._count.products,
  };
}

export async function listCollections(opts: { featuredOnly?: boolean } = {}): Promise<CollectionSummary[]> {
  const rows = await db.collection.findMany({
    where: { isActive: true, ...(opts.featuredOnly ? { isFeatured: true } : {}) },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: collectionInclude,
  });
  return rows.map(toCollection);
}

export async function getCollectionBySlug(slug: string): Promise<CollectionSummary> {
  const c = await db.collection.findFirst({ where: { slug, isActive: true }, include: collectionInclude });
  if (!c) throw new NotFoundError("Collection");
  return toCollection(c);
}

export async function listProducts(
  args: { collectionSlug?: string; filters?: ProductFilters; sort?: ProductSort; page?: number; pageSize?: number } = {},
): Promise<Page<ProductCard>> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, args.pageSize ?? DEFAULT_PAGE_SIZE));
  const sort = args.sort ?? "featured";
  const where = productWhere(args.collectionSlug, args.filters ?? {});

  if (sort === "featured" && args.collectionSlug) {
    // Featured order inside a collection is ProductCollection.sortOrder, so page through the join table.
    const joinWhere: Prisma.ProductCollectionWhereInput = {
      collection: { slug: args.collectionSlug, isActive: true },
      product: where,
    };
    const [total, joins] = await Promise.all([
      db.productCollection.count({ where: joinWhere }),
      db.productCollection.findMany({
        where: joinWhere,
        orderBy: [{ sortOrder: "asc" }, { product: { createdAt: "desc" } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { product: { include: cardInclude } },
      }),
    ]);
    return { items: joins.map((j) => toCard(j.product)), total, page, pageSize, hasMore: page * pageSize < total };
  }
  return pageProducts(where, productOrder(sort), page, pageSize);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail> {
  const p = await db.product.findFirst({
    where: { slug, status: "ACTIVE" },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      collections: { include: { collection: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!p) throw new NotFoundError("Product");
  const card = toCard({ ...p, images: p.images.slice(0, 2) });
  return {
    ...card,
    images: p.images.map((i) => ({ url: i.url, alt: i.alt, colorName: i.colorName })),
    description: p.description,
    fabric: p.fabric,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      colorName: v.colorName,
      colorHex: v.colorHex,
      pricePaise: v.pricePaise ?? p.basePricePaise,
      stock: v.stock,
    })),
    collections: p.collections
      .filter((pc) => pc.collection.isActive)
      .map((pc) => ({ slug: pc.collection.slug, name: pc.collection.name })),
  };
}

export async function getRelatedProducts(productId: string, limit = 4): Promise<ProductCard[]> {
  const links = await db.productCollection.findMany({
    where: { productId, collection: { isActive: true } },
    select: { collectionId: true },
  });
  const ids = links.map((l) => l.collectionId);
  if (!ids.length) return [];
  const rows = await db.product.findMany({
    where: {
      status: "ACTIVE",
      id: { not: productId },
      collections: { some: { collectionId: { in: ids }, collection: { isActive: true } } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: cardInclude,
  });
  return rows.map(toCard);
}

export async function getFacets(collectionSlug?: string): Promise<Facets> {
  const where = productWhere(collectionSlug, {});
  const [variants, prices, fits] = await Promise.all([
    db.productVariant.findMany({
      where: { product: where },
      select: { size: true, colorName: true, colorHex: true },
      distinct: ["size", "colorName"],
    }),
    db.product.aggregate({ where, _min: { basePricePaise: true }, _max: { basePricePaise: true } }),
    db.product.findMany({ where, select: { fit: true }, distinct: ["fit"] }),
  ]);
  const sizeOrder = new Map<string, number>(SIZES.map((s, i) => [s, i]));
  const sizes = [...new Set(variants.map((v) => v.size))].sort(
    (a, b) => (sizeOrder.get(a) ?? 99) - (sizeOrder.get(b) ?? 99),
  );
  const colorMap = new Map<string, string>();
  for (const v of variants) if (!colorMap.has(v.colorName)) colorMap.set(v.colorName, v.colorHex);
  const colors = [...colorMap].map(([name, hex]) => ({ name, hex })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    sizes,
    colors,
    fits: fits.map((f) => f.fit),
    minPricePaise: prices._min.basePricePaise ?? 0,
    maxPricePaise: prices._max.basePricePaise ?? 0,
  };
}

export async function searchProducts(q: string, page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<Page<ProductCard>> {
  const term = q.trim();
  if (!term) return { items: [], total: 0, page, pageSize, hasMore: false };
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
    ],
  };
  return pageProducts(where, [{ createdAt: "desc" }], page, pageSize);
}
