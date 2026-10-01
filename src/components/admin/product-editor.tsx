"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveProductAction } from "@/app/admin/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyProductForm, productFormFromProduct, toProductInput, type ProductFormState } from "@/lib/product-form";
import type { AdminProductDetail } from "@/server/services/admin-products";
import { FieldError } from "./field-error";
import { VariantMatrix } from "./variant-matrix";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const FITS = [["OVERSIZED", "Oversized"], ["REGULAR", "Regular"], ["RELAXED", "Relaxed"]] as const;
const STATUSES = [["DRAFT", "Draft (hidden)"], ["ACTIVE", "Active (live)"], ["ARCHIVED", "Archived (hidden)"]] as const;

export function ProductEditor({ product, collections }: { product: AdminProductDetail | null; collections: { id: string; name: string }[] }) {
  const [state, setState] = useState<ProductFormState>(() => (product ? productFormFromProduct(product) : emptyProductForm()));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const inCarts = Object.fromEntries((product?.variants ?? []).map((v) => [v.id, v.inCarts]));
  const set = <K extends keyof ProductFormState>(k: K, v: ProductFormState[K]) => setState((s) => ({ ...s, [k]: v }));
  const toggleCollection = (id: string) => set("collectionIds", state.collectionIds.includes(id) ? state.collectionIds.filter((c) => c !== id) : [...state.collectionIds, id]);

  const save = () => {
    const { input, errors: local } = toProductInput(state);
    if (!input) {
      setErrors(local);
      toast.error("Fix the highlighted fields");
      return;
    }
    start(async () => {
      try {
        const r = await saveProductAction(product?.id ?? null, input);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          toast.error(r.message);
          return;
        }
        setErrors({});
        toast.success(product ? "Saved" : "Product created");
        if (product) router.refresh();
        else router.push(`/admin/products/${r.data.id}`);
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  };

  const variantErrors = Object.entries(errors).filter(([k]) => k.startsWith("variants")).flatMap(([, v]) => v);

  return (
    <form className="grid gap-8 xl:grid-cols-[1fr_320px]" onSubmit={(e) => { e.preventDefault(); save(); }} data-testid="product-editor">
      {/* min-w-0: a grid item's default min-width is "auto" (its content's min-content size), so without
          this the variant table's `min-w-[560px]` (see variant-matrix.tsx) propagates up through this
          column and forces the whole page wider than the viewport on phones, even though the table itself
          scrolls internally via overflow-x-auto. */}
      <div className="min-w-0 space-y-8">
        <section className="space-y-4 rounded-md border border-border bg-surface p-5">
          <div><Label htmlFor="p-name">Name</Label><Input id="p-name" value={state.name} onChange={(e) => set("name", e.target.value)} className="mt-1 bg-bg" /><FieldError errors={errors.name} /></div>
          <div><Label htmlFor="p-slug">URL slug</Label><Input id="p-slug" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={state.slug} onChange={(e) => set("slug", e.target.value)} placeholder="Leave blank to generate from the name" className="mt-1 bg-bg" /><FieldError errors={errors.slug} /></div>
          <div><Label htmlFor="p-desc">Description (markdown)</Label><textarea id="p-desc" value={state.description} onChange={(e) => set("description", e.target.value)} rows={6} className="mt-1 w-full rounded-md border border-border bg-bg p-3 text-sm" /><FieldError errors={errors.description} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="p-fit">Fit</Label>
              <select id="p-fit" value={state.fit} onChange={(e) => set("fit", e.target.value as ProductFormState["fit"])} className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 text-sm lg:h-9">
                {FITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div><Label htmlFor="p-fabric">Fabric</Label><Input id="p-fabric" value={state.fabric} onChange={(e) => set("fabric", e.target.value)} className="mt-1 bg-bg" /><FieldError errors={errors.fabric} /></div>
            <div><Label htmlFor="p-price">Price (₹)</Label><Input id="p-price" inputMode="decimal" value={state.priceText} onChange={(e) => set("priceText", e.target.value)} className="mt-1 bg-bg" /><FieldError errors={errors.basePricePaise} /></div>
            <div><Label htmlFor="p-compare">Compare-at price (₹)</Label><Input id="p-compare" inputMode="decimal" value={state.compareAtText} onChange={(e) => set("compareAtText", e.target.value)} placeholder="Optional, shows a strikethrough" className="mt-1 bg-bg" /><FieldError errors={errors.compareAtPricePaise} /></div>
          </div>
        </section>

        <section className="space-y-3 rounded-md border border-border bg-surface p-5">
          <h2 className="text-2xl">Variants</h2>
          <VariantMatrix state={state} onChange={setState} inCarts={inCarts} />
          {variantErrors.length > 0 && <p className="text-sm text-danger" role="alert" data-testid="variant-error">{variantErrors[0]}</p>}
        </section>
      </div>

      <aside className="min-w-0 space-y-6">
        <section className="space-y-3 rounded-md border border-border bg-surface p-5">
          <Label htmlFor="p-status">Status</Label>
          <select id="p-status" value={state.status} onChange={(e) => set("status", e.target.value as ProductFormState["status"])} className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm lg:h-9" data-testid="status-select">
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={state.isCustomizable} onChange={(e) => set("isCustomizable", e.target.checked)} className="size-5 accent-brand" />Customizable blank (for the design tool)</label>
          {/* Fixed to the bottom of the viewport below `lg` (so Save is reachable without scrolling past
              the whole variant matrix on a phone), and back to a normal inline button at `lg`+. Only one
              button is ever mounted, so data-testid="save-product" never matches twice. */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:static lg:border-0 lg:bg-transparent lg:p-0">
            <Button type="submit" disabled={pending} className="h-11 w-full font-display text-lg tracking-wide" data-testid="save-product">{pending ? "Saving…" : product ? "Save changes" : "Create product"}</Button>
          </div>
        </section>
        <section className="space-y-2 rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl">Collections</h2>
          {collections.length === 0 && <p className="text-sm text-text-muted">No collections yet.</p>}
          {collections.map((c) => (
            <label key={c.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={state.collectionIds.includes(c.id)} onChange={() => toggleCollection(c.id)} className="size-5 accent-brand" />{c.name}</label>
          ))}
          <FieldError errors={errors.collectionIds} />
        </section>
      </aside>
    </form>
  );
}
