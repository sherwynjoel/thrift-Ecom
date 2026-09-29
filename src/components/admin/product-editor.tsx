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
    });
  };

  const variantErrors = Object.entries(errors).filter(([k]) => k.startsWith("variants")).flatMap(([, v]) => v);

  return (
    <form className="grid gap-8 xl:grid-cols-[1fr_320px]" onSubmit={(e) => { e.preventDefault(); save(); }} data-testid="product-editor">
      <div className="space-y-8">
        <section className="space-y-4 rounded-md border border-border bg-surface p-5">
          <div><Label htmlFor="p-name">Name</Label><Input id="p-name" value={state.name} onChange={(e) => set("name", e.target.value)} className="mt-1 bg-bg" /><FieldError errors={errors.name} /></div>
          <div><Label htmlFor="p-slug">URL slug</Label><Input id="p-slug" value={state.slug} onChange={(e) => set("slug", e.target.value)} placeholder="Leave blank to generate from the name" className="mt-1 bg-bg" /><FieldError errors={errors.slug} /></div>
          <div><Label htmlFor="p-desc">Description (markdown)</Label><textarea id="p-desc" value={state.description} onChange={(e) => set("description", e.target.value)} rows={6} className="mt-1 w-full rounded-md border border-border bg-bg p-3 text-sm" /><FieldError errors={errors.description} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="p-fit">Fit</Label>
              <select id="p-fit" value={state.fit} onChange={(e) => set("fit", e.target.value as ProductFormState["fit"])} className="mt-1 h-9 w-full rounded-md border border-border bg-bg px-3 text-sm">
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

      <aside className="space-y-6">
        <section className="space-y-3 rounded-md border border-border bg-surface p-5">
          <Label htmlFor="p-status">Status</Label>
          <select id="p-status" value={state.status} onChange={(e) => set("status", e.target.value as ProductFormState["status"])} className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm" data-testid="status-select">
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={state.isCustomizable} onChange={(e) => set("isCustomizable", e.target.checked)} className="accent-brand" />Customizable blank (for the design tool)</label>
          <Button type="submit" disabled={pending} className="w-full font-display text-lg tracking-wide" data-testid="save-product">{pending ? "Saving…" : product ? "Save changes" : "Create product"}</Button>
        </section>
        <section className="space-y-2 rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl">Collections</h2>
          {collections.length === 0 && <p className="text-sm text-text-muted">No collections yet.</p>}
          {collections.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={state.collectionIds.includes(c.id)} onChange={() => toggleCollection(c.id)} className="accent-brand" />{c.name}</label>
          ))}
          <FieldError errors={errors.collectionIds} />
        </section>
      </aside>
    </form>
  );
}
