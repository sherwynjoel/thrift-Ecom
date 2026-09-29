import type { Fit } from "@prisma/client";

export type ProductSort = "featured" | "newest" | "price-asc" | "price-desc";
export const PRODUCT_SORTS: ProductSort[] = ["featured", "newest", "price-asc", "price-desc"];

export interface ProductFilters {
  size?: string[];
  color?: string[];
  fit?: Fit[];
  minPricePaise?: number;
  maxPricePaise?: number;
}
