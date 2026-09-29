import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { zodFieldErrors } from "@/server/action-result";
import { getStorage } from "@/server/adapters/storage";
import { storeImage, uploadKeyFromUrl, validateImage } from "@/server/uploads";
import { imageUpdateSchema } from "@/lib/validation/admin";
import type { AdminImage } from "@/server/services/admin-products";

export const MAX_FILES_PER_UPLOAD = 10;
export const MAX_IMAGES_PER_PRODUCT = 20;

function toAdmin(i: { id: string; url: string; alt: string; colorName: string | null; sortOrder: number }): AdminImage {
  return { id: i.id, url: i.url, alt: i.alt, colorName: i.colorName, sortOrder: i.sortOrder };
}

export async function addProductImages(productId: string, files: File[]): Promise<AdminImage[]> {
  if (files.length === 0) throw new ValidationError({ files: ["Choose at least one image"] });
  if (files.length > MAX_FILES_PER_UPLOAD) throw new ValidationError({ files: [`Upload at most ${MAX_FILES_PER_UPLOAD} images at a time`] });
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, name: true, _count: { select: { images: true } } } });
  if (!product) throw new NotFoundError("Product");
  if (product._count.images + files.length > MAX_IMAGES_PER_PRODUCT) {
    throw new ValidationError({ files: [`A product can have at most ${MAX_IMAGES_PER_PRODUCT} images`] });
  }
  // Validate every file before storing any, so a bad file in the batch saves nothing.
  for (const f of files) validateImage(new Uint8Array(await f.arrayBuffer()));
  const max = await db.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } });
  let next = (max._max.sortOrder ?? -1) + 1;
  const created: AdminImage[] = [];
  for (const f of files) {
    const { url } = await storeImage(f, `products/${productId}`);
    const row = await db.productImage.create({ data: { productId, url, alt: product.name, sortOrder: next++ } });
    created.push(toAdmin(row));
  }
  return created;
}

export async function updateProductImage(imageId: string, input: unknown): Promise<AdminImage> {
  const r = imageUpdateSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  const exists = await db.productImage.findUnique({ where: { id: imageId }, select: { id: true } });
  if (!exists) throw new NotFoundError("Image");
  const row = await db.productImage.update({ where: { id: imageId }, data: { alt: r.data.alt, colorName: r.data.colorName || null } });
  return toAdmin(row);
}

export async function reorderProductImages(productId: string, orderedIds: string[]): Promise<void> {
  const current = await db.productImage.findMany({ where: { productId }, select: { id: true } });
  const ids = new Set(current.map((i) => i.id));
  if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(id)) || new Set(orderedIds).size !== orderedIds.length) {
    throw new ValidationError({ images: ["Image order does not match this product's images"] });
  }
  await db.$transaction(orderedIds.map((id, i) => db.productImage.update({ where: { id }, data: { sortOrder: i } })));
}

export async function deleteProductImage(imageId: string): Promise<{ productId: string }> {
  const img = await db.productImage.findUnique({ where: { id: imageId } });
  if (!img) throw new NotFoundError("Image");
  await db.productImage.delete({ where: { id: imageId } });
  const key = uploadKeyFromUrl(img.url);
  if (key) {
    try {
      await getStorage().delete(key);
    } catch (err) {
      console.error("[admin-images] could not delete stored file", key, err);
    }
  }
  return { productId: img.productId };
}
