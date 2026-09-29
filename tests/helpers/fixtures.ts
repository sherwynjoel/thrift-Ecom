import { db } from "@/server/db";
import type { Fit, ProductStatus } from "@prisma/client";
import { slugify } from "@/lib/slug";

let counter = 0;
const next = () => ++counter;

export async function createCollection(
  over: Partial<{ name: string; slug: string; isFeatured: boolean; isActive: boolean; sortOrder: number }> = {},
) {
  const name = over.name ?? `Collection ${next()}`;
  return db.collection.create({
    data: {
      name,
      slug: over.slug ?? slugify(name),
      isFeatured: over.isFeatured ?? false,
      isActive: over.isActive ?? true,
      sortOrder: over.sortOrder ?? 0,
    },
  });
}

export interface VariantSpec {
  size: string;
  colorName: string;
  colorHex?: string;
  stock?: number;
  pricePaise?: number | null;
}

export async function createProduct(
  over: Partial<{
    name: string;
    slug: string;
    basePricePaise: number;
    compareAtPricePaise: number | null;
    fit: Fit;
    status: ProductStatus;
    isCustomizable: boolean;
    collectionIds: string[];
    variants: VariantSpec[];
    images: { url: string; alt?: string; colorName?: string }[];
    createdAt: Date;
  }> = {},
) {
  const n = next();
  const name = over.name ?? `Product ${n}`;
  const variants = over.variants ?? [{ size: "M", colorName: "Black", stock: 10 }];
  const images = over.images ?? [{ url: `/seed/p${n}.svg`, alt: name }];
  return db.product.create({
    data: {
      name,
      slug: over.slug ?? slugify(name),
      basePricePaise: over.basePricePaise ?? 59900,
      compareAtPricePaise: over.compareAtPricePaise ?? null,
      fit: over.fit ?? "OVERSIZED",
      status: over.status ?? "ACTIVE",
      isCustomizable: over.isCustomizable ?? false,
      createdAt: over.createdAt,
      images: {
        create: images.map((img, i) => ({ url: img.url, alt: img.alt ?? name, colorName: img.colorName, sortOrder: i })),
      },
      variants: {
        create: variants.map((v, i) => ({
          sku: `SKU-${n}-${v.size}-${v.colorName}`.toUpperCase().replace(/\s+/g, "-"),
          size: v.size,
          colorName: v.colorName,
          colorHex: v.colorHex ?? "#000000",
          stock: v.stock ?? 10,
          pricePaise: v.pricePaise ?? null,
          sortOrder: i,
        })),
      },
      collections: {
        create: (over.collectionIds ?? []).map((collectionId, i) => ({ collectionId, sortOrder: i })),
      },
    },
    include: { variants: true, images: true },
  });
}

export async function linkProductToCollection(collectionId: string, productId: string, sortOrder: number) {
  await db.productCollection.create({ data: { collectionId, productId, sortOrder } });
}
