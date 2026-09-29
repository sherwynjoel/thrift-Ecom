import type { Fit } from "@prisma/client";

export type ProductSort = "featured" | "newest" | "price-asc" | "price-desc";
export const PRODUCT_SORTS: ProductSort[] = ["featured", "newest", "price-asc", "price-desc"];

/** Max quantity allowed per cart line. Lives here (client-safe) so UI components
 * don't need to import the cart service module, which pulls in Prisma/db. */
export const MAX_QTY_PER_LINE = 10;

export interface ProductFilters {
  size?: string[];
  color?: string[];
  fit?: Fit[];
  minPricePaise?: number;
  maxPricePaise?: number;
}
