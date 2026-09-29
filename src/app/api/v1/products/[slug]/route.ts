import { handle, ok } from "@/server/api";
import { getProductBySlug, getRelatedProducts } from "@/server/services/catalog";

export const GET = handle(async (_req, ctx) => {
  const { slug } = await ctx.params;
  const product = await getProductBySlug(slug);
  const related = await getRelatedProducts(product.id, 4);
  return ok({ product, related });
});
