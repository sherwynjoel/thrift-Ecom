import { Prisma, type ProductStatus } from "@prisma/client";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { zodFieldErrors } from "@/server/action-result";
import { getStorage } from "@/server/adapters/storage";
import { storeImage, uploadKeyFromUrl } from "@/server/uploads";
import { collectionInputSchema, type CollectionInput } from "@/lib/validation/admin";
import { slugify, uniqueSlug } from "@/lib/slug";

export interface AdminCollectionRow { id: string; slug: string; name: string; isActive: boolean; isFeatured: boolean; sortOrder: number; productCount: number }
export interface AdminCollectionDetail extends AdminCollectionRow {
  description: string; heroImageUrl: string | null;
  products: { id: string; name: string; slug: string; status: ProductStatus; imageUrl: string | null }[];
}

function parse(input: unknown): CollectionInput {
  const r = collectionInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  return r.data;
}

async function collectionSlug(desired: string, name: string, selfId?: string): Promise<string> {
  return uniqueSlug(desired || slugify(name), async (s) => {
    const hit = await db.collection.findUnique({ where: { slug: s }, select: { id: true } });
    return Boolean(hit && hit.id !== selfId);
  });
}

export async function listAdminCollections(): Promise<AdminCollectionRow[]> {
  const rows = await db.collection.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });
  return rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, isActive: c.isActive, isFeatured: c.isFeatured, sortOrder: c.sortOrder, productCount: c._count.products }));
}

export async function listCollectionOptions(): Promise<{ id: string; name: string }[]> {
  return db.collection.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

export async function getAdminCollection(id: string): Promise<AdminCollectionDetail> {
  const c = await db.collection.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } },
      products: { orderBy: { sortOrder: "asc" }, include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } } },
    },
  });
  if (!c) throw new NotFoundError("Collection");
  return {
    id: c.id, slug: c.slug, name: c.name, isActive: c.isActive, isFeatured: c.isFeatured, sortOrder: c.sortOrder, productCount: c._count.products,
    description: c.description, heroImageUrl: c.heroImageUrl,
    products: c.products.map((l) => ({ id: l.product.id, name: l.product.name, slug: l.product.slug, status: l.product.status, imageUrl: l.product.images[0]?.url ?? null })),
  };
}

/** `collectionSlug` already picks a slug it believes is free, but two concurrent saves can both land on
 * the same one (e.g. two tabs creating "Summer Drop" at once); the DB's unique constraint is the real
 * guard, so map its P2002 to a ConflictError with a field error on slug instead of a 500. */
function mapSlugConflict(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ConflictError("That slug was just taken by another save. Choose a different one.", { slug: ["That slug is already in use"] });
  }
  throw err;
}

export async function createCollection(input: unknown): Promise<{ id: string; slug: string }> {
  const data = parse(input);
  const slug = await collectionSlug(data.slug, data.name);
  try {
    const c = await db.collection.create({ data: { slug, name: data.name, description: data.description, isFeatured: data.isFeatured, isActive: data.isActive, sortOrder: data.sortOrder } });
    return { id: c.id, slug };
  } catch (err) {
    mapSlugConflict(err);
  }
}

export async function updateCollection(id: string, input: unknown): Promise<{ id: string; slug: string }> {
  const data = parse(input);
  const exists = await db.collection.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError("Collection");
  const slug = await collectionSlug(data.slug, data.name, id);
  try {
    await db.collection.update({ where: { id }, data: { slug, name: data.name, description: data.description, isFeatured: data.isFeatured, isActive: data.isActive, sortOrder: data.sortOrder } });
    return { id, slug };
  } catch (err) {
    mapSlugConflict(err);
  }
}

export async function deleteCollection(id: string): Promise<void> {
  const c = await db.collection.findUnique({ where: { id }, select: { heroImageUrl: true } });
  if (!c) throw new NotFoundError("Collection");
  await db.collection.delete({ where: { id } });
  const key = c.heroImageUrl ? uploadKeyFromUrl(c.heroImageUrl) : null;
  if (key) await getStorage().delete(key).catch((err) => console.error("[admin-collections] hero cleanup failed", err));
}

export async function setCollectionHero(id: string, file: File | null): Promise<string | null> {
  const c = await db.collection.findUnique({ where: { id }, select: { heroImageUrl: true } });
  if (!c) throw new NotFoundError("Collection");
  const url = file ? (await storeImage(file, `collections/${id}`)).url : null;
  try {
    await db.collection.update({ where: { id }, data: { heroImageUrl: url } });
  } catch (err) {
    // The new file is already on disk but nothing in the DB points to it yet; clean it up so a failed
    // update doesn't orphan it, then let the original error surface.
    const newKey = url ? uploadKeyFromUrl(url) : null;
    if (newKey) await getStorage().delete(newKey).catch((cleanupErr) => console.error("[admin-collections] failed-update cleanup failed", cleanupErr));
    throw err;
  }
  const oldKey = c.heroImageUrl ? uploadKeyFromUrl(c.heroImageUrl) : null;
  if (oldKey) await getStorage().delete(oldKey).catch((err) => console.error("[admin-collections] hero cleanup failed", err));
  return url;
}

export async function reorderCollectionProducts(id: string, orderedProductIds: string[]): Promise<void> {
  const links = await db.productCollection.findMany({ where: { collectionId: id }, select: { productId: true } });
  const ids = new Set(links.map((l) => l.productId));
  if (orderedProductIds.length !== ids.size || !orderedProductIds.every((p) => ids.has(p)) || new Set(orderedProductIds).size !== orderedProductIds.length) {
    throw new ValidationError({ products: ["Product order does not match this collection"] });
  }
  await db.$transaction(orderedProductIds.map((productId, i) => db.productCollection.update({ where: { productId_collectionId: { productId, collectionId: id } }, data: { sortOrder: i } })));
}

export async function removeProductFromCollection(id: string, productId: string): Promise<void> {
  const exists = await db.collection.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError("Collection");
  await db.productCollection.deleteMany({ where: { collectionId: id, productId } });
}
