import { handle, ok } from "@/server/api";
import { getCollectionBySlug, getFacets, listProducts } from "@/server/services/catalog";
import { parseProductQuery } from "@/lib/validation/catalog";

export const GET = handle(async (req, ctx) => {
  const { slug } = await ctx.params;
  const collection = await getCollectionBySlug(slug);
  const { filters, sort, page } = parseProductQuery(req.nextUrl.searchParams);
  const [products, facets] = await Promise.all([
    listProducts({ collectionSlug: slug, filters, sort, page }),
    getFacets(slug),
  ]);
  return ok({ collection, ...products, facets });
});
