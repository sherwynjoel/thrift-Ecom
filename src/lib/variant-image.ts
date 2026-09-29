export interface VariantImageLike {
  url: string;
  colorName: string | null;
}

/**
 * Picks the product image matching a variant's color, falling back to the product's first
 * image when no color-specific shot exists. Client-safe (pure, no server imports) so it can be
 * shared by server snapshotting (order-records/orders) and client-facing views (cart) alike.
 */
export function pickVariantImage<T extends VariantImageLike>(images: T[], colorName: string): T | undefined {
  return images.find((img) => img.colorName === colorName) ?? images[0];
}

export function variantImageUrl(images: VariantImageLike[], colorName: string): string | null {
  return pickVariantImage(images, colorName)?.url ?? null;
}
