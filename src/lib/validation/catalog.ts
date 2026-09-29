import { z } from "zod";
import type { Fit } from "@prisma/client";
import { PRODUCT_SORTS, type ProductFilters, type ProductSort } from "@/lib/catalog-types";

const FITS = ["OVERSIZED", "REGULAR", "RELAXED"] as const;

const list = z.preprocess((v) => {
  if (Array.isArray(v)) return v.flatMap((s) => String(s).split(",")).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return undefined;
}, z.array(z.string()).optional());

const paise = z.coerce.number().int().min(0).optional();

export const productQuerySchema = z.object({
  size: list,
  color: list,
  fit: list.pipe(z.array(z.enum(FITS)).optional()),
  minPrice: paise,
  maxPrice: paise,
  sort: z.enum(PRODUCT_SORTS as [ProductSort, ...ProductSort[]]).default("featured"),
  page: z.coerce.number().int().min(1).default(1),
});

export function parseProductQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): { filters: ProductFilters; sort: ProductSort; page: number } {
  const raw: Record<string, string | string[] | undefined> =
    params instanceof URLSearchParams
      ? Object.fromEntries([...new Set(params.keys())].map((k) => [k, params.getAll(k)]))
      : params;
  const parsed = productQuerySchema.safeParse(raw);
  const q = parsed.success ? parsed.data : productQuerySchema.parse({});
  return {
    filters: { size: q.size, color: q.color, fit: q.fit as Fit[] | undefined, minPricePaise: q.minPrice, maxPricePaise: q.maxPrice },
    sort: q.sort,
    page: q.page,
  };
}
