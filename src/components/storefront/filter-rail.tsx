"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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

function Filters({ facets, showClear = true }: { facets: Facets; showClear?: boolean }) {
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
            <button key={s} type="button" onClick={() => go(toggleListParam(params, "size", s))} aria-pressed={has("size", s)} className={cn("min-h-11 min-w-11 rounded-full border px-4 text-sm", has("size", s) ? "border-brand bg-brand text-brand-ink" : "border-border hover:border-text")}>{s}</button>
          ))}
        </div>
      </Group>
      <Group title="Color">
        <div className="-ml-1 flex flex-wrap gap-1">
          {facets.colors.map((c) => (
            <button key={c.name} type="button" onClick={() => go(toggleListParam(params, "color", c.name))} aria-pressed={has("color", c.name)} aria-label={c.name} title={c.name} className={cn("size-11 rounded-full border-2 p-1", has("color", c.name) ? "border-brand" : "border-transparent")}>
              <span className="block size-full rounded-full border border-border" style={{ backgroundColor: c.hex }} />
            </button>
          ))}
        </div>
      </Group>
      <Group title="Fit">
        <div className="flex flex-col text-sm">
          {facets.fits.map((f) => (
            <label key={f} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={has("fit", f)} onChange={() => go(toggleListParam(params, "fit", f))} className="size-5 accent-brand" />
              {FIT_LABEL[f] ?? f}
            </label>
          ))}
        </div>
      </Group>
      <Group title="Price">
        <div className="flex items-center gap-2 text-sm">
          <input type="number" inputMode="numeric" min={0} placeholder={String(Math.floor(facets.minPricePaise / 100))} value={min} onChange={(e) => setMin(e.target.value)} className="h-11 w-20 rounded-sm border border-border bg-surface px-2" aria-label="Minimum price" />
          <span className="text-text-muted">to</span>
          <input type="number" inputMode="numeric" min={0} placeholder={String(Math.ceil(facets.maxPricePaise / 100))} value={max} onChange={(e) => setMax(e.target.value)} className="h-11 w-20 rounded-sm border border-border bg-surface px-2" aria-label="Maximum price" />
          <Button type="button" variant="secondary" onClick={applyPrice} className="h-11 px-4">Go</Button>
        </div>
      </Group>
      {showClear && <ClearAll className="mt-2 inline-flex min-h-11 items-center text-sm text-text-muted underline-offset-4 hover:underline" />}
    </div>
  );
}

function ClearAll({ className }: { className: string }) {
  const { params, go } = useQueryNav();
  return <button type="button" onClick={() => go(clearFilterParams(params))} className={className} data-testid="clear-filters">Clear all</button>;
}

export function FilterRail({ facets, resultCount }: { facets: Facets; resultCount: number }) {
  return (
    <>
      <aside className="hidden w-60 shrink-0 lg:block"><Filters facets={facets} /></aside>
      <Sheet>
        <SheetTrigger render={<Button variant="secondary" className="h-11 px-4 lg:hidden" data-testid="open-filters" />}>
          <SlidersHorizontal className="mr-2 size-4" />
          Filters
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 bg-bg">
          <SheetTitle className="p-4 pr-14 font-display text-2xl uppercase">Filters</SheetTitle>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <Filters facets={facets} showClear={false} />
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border px-4 pt-3 pb-safe">
            <ClearAll className="h-11 rounded-lg border border-border text-sm" />
            <SheetClose render={<Button className="h-11" data-testid="show-results" />}>
              Show {resultCount} {resultCount === 1 ? "result" : "results"}
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
