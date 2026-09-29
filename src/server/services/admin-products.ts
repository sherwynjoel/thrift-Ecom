import { Prisma, type Fit, type ProductStatus } from "@prisma/client";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { zodFieldErrors } from "@/server/action-result";
import { productInputSchema, type ProductInput } from "@/lib/validation/admin";
import { slugify, uniqueSlug } from "@/lib/slug";
import type { Page } from "@/server/services/catalog";

export interface AdminProductRow { id: string; slug: string; name: string; status: ProductStatus; imageUrl: string | null; variantCount: number; totalStock: number; basePricePaise: number; updatedAt: Date }
export interface AdminVariant { id: string; sku: string; size: string; colorName: string; colorHex: string; pricePaise: number | null; stock: number; inCarts: number }
export interface AdminImage { id: string; url: string; alt: string; colorName: string | null; sortOrder: number }
export interface AdminProductDetail {
  id: string; slug: string; name: string; description: string; fit: Fit; fabric: string;
  basePricePaise: number; compareAtPricePaise: number | null; status: ProductStatus; isCustomizable: boolean;
  collectionIds: string[]; images: AdminImage[]; variants: AdminVariant[];
}

type Tx = Prisma.TransactionClient;

function parse(input: unknown): ProductInput {
  const r = productInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  return r.data;
}

async function productSlug(tx: Tx, desired: string, name: string, selfId?: string): Promise<string> {
  const base = desired || slugify(name);
  return uniqueSlug(base, async (s) => {
    const hit = await tx.product.findUnique({ where: { slug: s }, select: { id: true } });
    return Boolean(hit && hit.id !== selfId);
  });
}

async function freeSku(tx: Tx, slug: string, colorName: string, size: string): Promise<string> {
  const root = `${slug}-${slugify(colorName)}-${size}`.toUpperCase();
  let candidate = root;
  for (let i = 2; await tx.productVariant.findUnique({ where: { sku: candidate }, select: { id: true } }); i++) {
    candidate = `${root}-${i}`;
  }
  return candidate;
}

async function assertCollections(tx: Tx, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const found = await tx.collection.count({ where: { id: { in: ids } } });
  if (found !== new Set(ids).size) throw new ValidationError({ collectionIds: ["Unknown collection"] });
}

async function syncCollections(tx: Tx, productId: string, ids: string[]): Promise<void> {
  const wanted = [...new Set(ids)];
  await tx.productCollection.deleteMany({ where: { productId, collectionId: { notIn: wanted } } });
  const existing = new Set((await tx.productCollection.findMany({ where: { productId }, select: { collectionId: true } })).map((l) => l.collectionId));
  for (const collectionId of wanted) {
    if (existing.has(collectionId)) continue;
    const max = await tx.productCollection.aggregate({ where: { collectionId }, _max: { sortOrder: true } });
    await tx.productCollection.create({ data: { productId, collectionId, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  }
}

async function syncVariants(tx: Tx, productId: string, slug: string, variants: ProductInput["variants"]): Promise<void> {
  const current = await tx.productVariant.findMany({ where: { productId }, include: { _count: { select: { cartItems: true } } } });
  const currentIds = new Set(current.map((v) => v.id));
  const keepIds = new Set(variants.filter((v) => v.id).map((v) => v.id!));
  for (const id of keepIds) if (!currentIds.has(id)) throw new ValidationError({ variants: ["Unknown variant"] });

  const removed = current.filter((v) => !keepIds.has(v.id));
  const blocked = removed.filter((v) => v._count.cartItems > 0);
  if (blocked.length) {
    const names = blocked.map((v) => `${v.size} / ${v.colorName}`).join(", ");
    throw new ConflictError(`${names} is in a customer's bag; set its stock to 0 instead of removing it`);
  }
  if (removed.length) await tx.productVariant.deleteMany({ where: { id: { in: removed.map((v) => v.id) } } });

  for (const [i, v] of variants.entries()) {
    const data = { size: v.size, colorName: v.colorName.trim(), colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock, sortOrder: i };
    if (v.id) {
      await tx.productVariant.update({ where: { id: v.id }, data });
    } else {
      await tx.productVariant.create({ data: { ...data, productId, sku: await freeSku(tx, slug, v.colorName, v.size) } });
    }
  }
}

function mapConflicts(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ConflictError("Two variants ended up with the same size and color, or a slug is taken. Check the variant list.");
  }
  throw err;
}

export async function createProduct(input: unknown): Promise<{ id: string; slug: string }> {
  const data = parse(input);
  try {
    return await db.$transaction(async (tx) => {
      await assertCollections(tx, data.collectionIds);
      const slug = await productSlug(tx, data.slug, data.name);
      const product = await tx.product.create({
        data: {
          slug, name: data.name, description: data.description, fit: data.fit, fabric: data.fabric,
          basePricePaise: data.basePricePaise, compareAtPricePaise: data.compareAtPricePaise,
          status: data.status, isCustomizable: data.isCustomizable,
        },
      });
      const newVariants = data.variants.map((v) => ({
        size: v.size, colorName: v.colorName, colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock,
      }));
      await syncVariants(tx, product.id, slug, newVariants);
      await syncCollections(tx, product.id, data.collectionIds);
      return { id: product.id, slug };
    });
  } catch (err) {
    mapConflicts(err);
  }
}

export async function updateProduct(id: string, input: unknown): Promise<{ id: string; slug: string }> {
  const data = parse(input);
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError("Product");
      await assertCollections(tx, data.collectionIds);
      const slug = await productSlug(tx, data.slug, data.name, id);
      await tx.product.update({
        where: { id },
        data: {
          slug, name: data.name, description: data.description, fit: data.fit, fabric: data.fabric,
          basePricePaise: data.basePricePaise, compareAtPricePaise: data.compareAtPricePaise,
          status: data.status, isCustomizable: data.isCustomizable,
        },
      });
      await syncVariants(tx, id, slug, data.variants);
      await syncCollections(tx, id, data.collectionIds);
      return { id, slug };
    });
  } catch (err) {
    mapConflicts(err);
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const p = await db.product.findUnique({ where: { id }, select: { status: true } });
  if (!p) throw new NotFoundError("Product");
  if (p.status === "ACTIVE") throw new ConflictError("Archive the product before deleting it");
  await db.product.delete({ where: { id } });
}

export async function getAdminProduct(id: string): Promise<AdminProductDetail> {
  const p = await db.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { cartItems: true } } } },
      collections: { select: { collectionId: true } },
    },
  });
  if (!p) throw new NotFoundError("Product");
  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description, fit: p.fit, fabric: p.fabric,
    basePricePaise: p.basePricePaise, compareAtPricePaise: p.compareAtPricePaise, status: p.status, isCustomizable: p.isCustomizable,
    collectionIds: p.collections.map((c) => c.collectionId),
    images: p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, colorName: i.colorName, sortOrder: i.sortOrder })),
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, size: v.size, colorName: v.colorName, colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock, inCarts: v._count.cartItems })),
  };
}

export async function listAdminProducts(args: { q?: string; status?: ProductStatus; page?: number; pageSize?: number } = {}): Promise<Page<AdminProductRow>> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 25));
  const q = args.q?.trim();
  const where: Prisma.ProductWhereInput = {
    ...(args.status ? { status: args.status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, variants: { select: { stock: true } } },
    }),
  ]);
  return {
    items: rows.map((p) => ({
      id: p.id, slug: p.slug, name: p.name, status: p.status, imageUrl: p.images[0]?.url ?? null,
      variantCount: p.variants.length, totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
      basePricePaise: p.basePricePaise, updatedAt: p.updatedAt,
    })),
    total, page, pageSize, hasMore: page * pageSize < total,
  };
}
