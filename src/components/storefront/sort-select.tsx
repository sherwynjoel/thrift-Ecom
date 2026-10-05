"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRODUCT_SORTS, type ProductSort } from "@/lib/catalog-types";
import { setParam } from "@/lib/query-string";

const LABELS: Record<ProductSort, string> = { featured: "Featured", newest: "Newest", "price-asc": "Price: low to high", "price-desc": "Price: high to low" };

export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get("sort") as ProductSort | null) ?? "featured";
  return (
    <Select value={current} onValueChange={(v) => router.replace(`${pathname}?${setParam(params, "sort", v === "featured" ? null : v)}`, { scroll: false })}>
      <SelectTrigger className="w-48 bg-surface data-[size=default]:h-11" aria-label="Sort by" data-testid="sort-select"><SelectValue /></SelectTrigger>
      <SelectContent>
        {PRODUCT_SORTS.map((s) => <SelectItem key={s} value={s}>{LABELS[s]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
