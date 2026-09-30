import { db } from "@/server/db";
import type { Fit, OrderStatus, ProductStatus } from "@prisma/client";
import { slugify } from "@/lib/slug";

let counter = 0;
const next = () => ++counter;

export async function createUser(
  over: Partial<{ email: string; name: string; role: "CUSTOMER" | "ADMIN" }> = {},
) {
  const n = next();
  return db.user.create({
    data: {
      email: over.email ?? `user${n}-${Date.now()}@example.test`,
      name: over.name ?? `User ${n}`,
      role: over.role ?? "CUSTOMER",
    },
  });
}

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

export async function createOrderRow(
  userId: string,
  over: Partial<{ status: OrderStatus; couponCode: string | null; offerLabel: string | null; totalPaise: number; paidAt: Date | null; createdAt: Date; number: string; shipName: string; shipPhone: string; shipPincode: string; needsAttention: boolean }> = {},
) {
  const n = next();
  const total = over.totalPaise ?? 59900;
  return db.order.create({
    data: {
      number: over.number ?? `TEST-${n}-${Date.now()}`,
      userId,
      email: `buyer${n}@example.test`,
      status: over.status ?? "PAID",
      needsAttention: over.needsAttention ?? false,
      shipName: over.shipName ?? "Asha Rao",
      shipPhone: over.shipPhone ?? "9876543210",
      shipLine1: "12 MG Road",
      shipCity: "Bengaluru",
      shipState: "Karnataka",
      shipPincode: over.shipPincode ?? "560001",
      subtotalPaise: total,
      totalPaise: total,
      couponCode: over.couponCode ?? null,
      offerLabel: over.offerLabel ?? null,
      paymentProvider: "mock",
      paidAt: over.paidAt === undefined ? new Date() : over.paidAt,
      createdAt: over.createdAt,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
}

export async function createDesignRow(
  over: { productId: string } & Partial<{
    userId: string | null; cartToken: string | null; colorName: string;
    frontPreviewKey: string | null; frontPrintKey: string | null; backPreviewKey: string | null; backPrintKey: string | null;
    assetKeys: string[]; createdAt: Date;
  }>,
) {
  const pick = <T,>(v: T | undefined, d: T) => (v === undefined ? d : v);
  return db.design.create({
    data: {
      productId: over.productId,
      userId: pick(over.userId, null),
      cartToken: pick(over.cartToken, null),
      colorName: over.colorName ?? "Black",
      frontJson: { version: "6.0.0", objects: [{ type: "Textbox", text: "HELLO", data: { kind: "text", fontId: "anton" } }] },
      frontPreviewKey: pick(over.frontPreviewKey, "designs/previews/f.png"),
      frontPrintKey: pick(over.frontPrintKey, "designs/print/f.png"),
      backPreviewKey: pick(over.backPreviewKey, null),
      backPrintKey: pick(over.backPrintKey, null),
      assetKeys: over.assetKeys ?? [],
      rightsConfirmed: true,
      createdAt: over.createdAt,
    },
  });
}

export async function createOrderItemRow(
  orderId: string,
  over: Partial<{
    productName: string; size: string; colorName: string; sku: string; quantity: number; designId: string | null;
    printFrontUrl: string | null; printBackUrl: string | null; designFrontPreviewUrl: string | null; designBackPreviewUrl: string | null; printedAt: Date | null;
  }> = {},
) {
  const n = next();
  const pick = <T,>(v: T | undefined, d: T) => (v === undefined ? d : v);
  const quantity = over.quantity ?? 1;
  return db.orderItem.create({
    data: {
      orderId,
      productName: over.productName ?? `Blank Tee ${n}`,
      productSlug: `blank-tee-${n}`,
      size: over.size ?? "M",
      colorName: over.colorName ?? "Black",
      sku: over.sku ?? `SKU-${n}`,
      unitPricePaise: 59900,
      quantity,
      lineTotalPaise: 59900 * quantity,
      designId: pick(over.designId, null),
      printFrontUrl: pick(over.printFrontUrl, "/api/uploads/designs/print/f.png"),
      printBackUrl: pick(over.printBackUrl, null),
      designFrontPreviewUrl: pick(over.designFrontPreviewUrl, "/api/uploads/designs/previews/f.png"),
      designBackPreviewUrl: pick(over.designBackPreviewUrl, null),
      printedAt: pick(over.printedAt, null),
    },
  });
}
