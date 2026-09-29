"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { paiseToRupees, rupeesToPaise } from "@/lib/money";
import type { ProductFormState } from "@/lib/product-form";
import { SIZES } from "@/lib/sizes";
import { buildVariantRows, type ColorSpec, type VariantRow } from "@/lib/variant-rows";
import { cn } from "@/lib/utils";

export function VariantMatrix({ state, onChange, inCarts }: { state: ProductFormState; onChange: (next: ProductFormState) => void; inCarts: Record<string, number> }) {
  const [fill, setFill] = useState("");

  const withMatrix = (sizes: string[], colors: ColorSpec[]) => onChange({ ...state, sizes, colors, rows: buildVariantRows(sizes, colors, state.rows) });
  const toggleSize = (size: string) => withMatrix(state.sizes.includes(size) ? state.sizes.filter((s) => s !== size) : [...state.sizes, size], state.colors);
  const setColor = (i: number, patch: Partial<ColorSpec>) => withMatrix(state.sizes, state.colors.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addColor = () => withMatrix(state.sizes, [...state.colors, { name: "", hex: "#ffffff" }]);
  const removeColor = (i: number) => withMatrix(state.sizes, state.colors.filter((_, j) => j !== i));
  const setRow = (key: string, patch: Partial<VariantRow>) => onChange({ ...state, rows: state.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const fillStock = () => {
    const n = Number(fill);
    if (!Number.isInteger(n) || n < 0) return;
    onChange({ ...state, rows: state.rows.map((r) => ({ ...r, stock: n })) });
  };

  return (
    <div className="space-y-5" data-testid="variant-matrix">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Sizes</legend>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button key={s} type="button" aria-pressed={state.sizes.includes(s)} onClick={() => toggleSize(s)} className={cn("min-w-12 rounded-full border px-3 py-1 text-sm", state.sizes.includes(s) ? "border-brand bg-brand text-brand-ink" : "border-border hover:border-text")} data-testid="size-toggle">{s}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Colors</legend>
        <ul className="space-y-2">
          {state.colors.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <input type="color" value={c.hex} onChange={(e) => setColor(i, { hex: e.target.value })} aria-label={`Color ${i + 1} swatch`} className="size-9 cursor-pointer rounded border border-border bg-transparent" />
              <input value={c.name} onChange={(e) => setColor(i, { name: e.target.value })} placeholder="Color name, e.g. Black" aria-label={`Color ${i + 1} name`} className="h-9 w-56 rounded-md border border-border bg-bg px-3 text-sm" data-testid="color-name" />
              <button type="button" onClick={() => removeColor(i)} aria-label={`Remove color ${c.name || i + 1}`} className="p-2 text-text-muted hover:text-danger"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={addColor}><Plus className="mr-1 size-4" />Add color</Button>
      </fieldset>

      {state.rows.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-muted">Set stock for every variant:</span>
            <input value={fill} onChange={(e) => setFill(e.target.value)} inputMode="numeric" aria-label="Stock for all variants" className="h-8 w-20 rounded-md border border-border bg-bg px-2" />
            <Button type="button" size="sm" variant="secondary" onClick={fillStock}>Apply</Button>
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] text-sm" data-testid="variant-rows">
              <thead className="bg-surface text-left text-text-muted"><tr><th className="p-2">Color</th><th>Size</th><th>Price override (₹)</th><th>Stock</th><th className="p-2">Notes</th></tr></thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.key} className="border-t border-border" data-testid="variant-row">
                    <td className="p-2"><span className="inline-flex items-center gap-2"><span className="size-3 rounded-full border border-border" style={{ backgroundColor: r.colorHex }} />{r.colorName}</span></td>
                    <td>{r.size}</td>
                    <td>
                      <input key={`${r.key}-price`} defaultValue={paiseToRupees(r.pricePaise)} placeholder="Base price" inputMode="decimal" aria-label={`Price override ${r.colorName} ${r.size}`} onBlur={(e) => setRow(r.key, { pricePaise: rupeesToPaise(e.target.value) })} className="h-8 w-28 rounded-md border border-border bg-bg px-2" />
                    </td>
                    <td>
                      <input type="number" min={0} value={r.stock} aria-label={`Stock ${r.colorName} ${r.size}`} onChange={(e) => setRow(r.key, { stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className="h-8 w-24 rounded-md border border-border bg-bg px-2" data-testid="stock-input" />
                    </td>
                    <td className="p-2 text-xs text-text-muted">{r.id && inCarts[r.id] ? `In ${inCarts[r.id]} bag(s), keep it or set stock to 0` : r.id ? "" : "New"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted" data-testid="variant-empty">Pick at least one size and name a color to create variants.</p>
      )}
    </div>
  );
}
