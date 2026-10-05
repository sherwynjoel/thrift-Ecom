import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getProductCardsByIds, type ProductCard } from "@/server/services/catalog";

export const MAX_WISHLIST_ITEMS = 200;

export async function listWishlistProductIds(userId: string): Promise<string[]> {
  const rows = await db.wishlistItem.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { productId: true } });
  return rows.map((r) => r.productId);
}

export async function listWishlist(userId: string): Promise<ProductCard[]> {
  return getProductCardsByIds(await listWishlistProductIds(userId));
}

export async function addToWishlist(userId: string, productId: string): Promise<{ added: boolean }> {
  const product = await db.product.findFirst({ where: { id: productId, status: "ACTIVE" }, select: { id: true } });
  if (!product) throw new NotFoundError("Product");
  const existing = await db.wishlistItem.findUnique({ where: { userId_productId: { userId, productId } }, select: { id: true } });
  if (existing) return { added: false };
  if ((await db.wishlistItem.count({ where: { userId } })) >= MAX_WISHLIST_ITEMS) {
    const msg = `Your wishlist holds up to ${MAX_WISHLIST_ITEMS} products`;
    throw new ValidationError({ productId: [msg] }, msg);
  }
  try {
    await db.wishlistItem.create({ data: { userId, productId } });
    return { added: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { added: false };
    throw err;
  }
}

export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  await db.wishlistItem.deleteMany({ where: { userId, productId } });
}
