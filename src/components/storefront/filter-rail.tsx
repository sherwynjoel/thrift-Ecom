"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Facets } from "@/server/services/catalog";
import { clearFilterParams, setParam, toggleListParam } from "@/lib/query-string";
import { cn } from "@/lib/utils";

const FIT_LABEL: Record<string, string> = { OVERSIZED: "Oversized", REGULAR: "Regular", RELAXED: "Relaxed" };

function useQueryNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (next: URLSearchParams) => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  return { params, go };
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2 border-b border-border py-4">
      <legend className="font-display text-lg uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function Filters({ facets }: { facets: Facets }) {
  const { params, go } = useQueryNav();
  const has = (key: string, v: string) => (params.get(key) ?? "").split(",").includes(v);
  const [min, setMin] = useState(params.get("minPrice") ? String(Number(params.get("minPrice")) / 100) : "");
  const [max, setMax] = useState(params.get("maxPrice") ? String(Number(params.get("maxPrice")) / 100) : "");
  const applyPrice = () => {
    let next = setParam(params, "minPrice", min ? String(Math.round(Number(min) * 100)) : null);
    next = setParam(next, "maxPrice", max ? String(Math.round(Number(max) * 100)) : null);
    go(next);
  };
  return (
    <div data-testid="filter-rail">
      <Group title="Size">
        <div className="flex flex-wrap gap-2">
          {facets.sizes.map((s) => (
            <button key={s} type="button" onClick={() => go(toggleListParam(params, "size", s))} aria-pressed={has("size", s)} className={cn("min-w-10 rounded-full border px-3 py-1 text-sm", has("size", s) ? "border-brand bg-brand text-brand-ink" : "border-border hover:border-text")}>{s}</button>
          ))}
        </div>
      </Group>
      <Group title="Color">
        <div className="flex flex-wrap gap-2">
          {facets.colors.map((c) => (
            <button key={c.name} type="button" onClick={() => go(toggleListParam(params, "color", c.name))} aria-pressed={has("color", c.name)} aria-label={c.name} title={c.name} className={cn("size-7 rounded-full border-2", has("color", c.name) ? "border-brand" : "border-border")} style={{ backgroundColor: c.hex }} />
          ))}
        </div>
      </Group>
      <Group title="Fit">
        <div className="flex flex-col gap-2 text-sm">
          {facets.fits.map((f) => (
            <label key={f} className="flex items-center gap-2">
              <input type="checkbox" checked={has("fit", f)} onChange={() => go(toggleListParam(params, "fit", f))} className="accent-brand" />
              {FIT_LABEL[f] ?? f}
            </label>
          ))}
        </div>
      </Group>
      <Group title="Price">
        <div className="flex items-center gap-2 text-sm">
          <input type="number" inputMode="numeric" min={0} placeholder={String(Math.floor(facets.minPricePaise / 100))} value={min} onChange={(e) => setMin(e.target.value)} className="w-20 rounded-sm border border-border bg-surface px-2 py-1" aria-label="Minimum price" />
          <span className="text-text-muted">to</span>
          <input type="number" inputMode="numeric" min={0} placeholder={String(Math.ceil(facets.maxPricePaise / 100))} value={max} onChange={(e) => setMax(e.target.value)} className="w-20 rounded-sm border border-border bg-surface px-2 py-1" aria-label="Maximum price" />
          <Button type="button" size="sm" variant="secondary" onClick={applyPrice}>Go</Button>
        </div>
      </Group>
      <button type="button" onClick={() => go(clearFilterParams(params))} className="mt-4 text-sm text-text-muted underline-offset-4 hover:underline" data-testid="clear-filters">Clear all</button>
    </div>
  );
}

export function FilterRail({ facets }: { facets: Facets }) {
  return (
    <>
      <aside className="hidden w-60 shrink-0 lg:block"><Filters facets={facets} /></aside>
      <Sheet>
        <SheetTrigger render={<Button variant="secondary" className="lg:hidden" data-testid="open-filters" />}>
          <SlidersHorizontal className="mr-2 size-4" />
          Filters
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto bg-bg">
          <SheetTitle className="font-display text-2xl uppercase">Filters</SheetTitle>
          <Filters facets={facets} />
        </SheetContent>
      </Sheet>
    </>
  );
}
