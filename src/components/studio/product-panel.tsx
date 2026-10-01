"use client";

import { Check } from "lucide-react";
import { colorsOf, sizesFor } from "@/lib/variant-matrix";
import { isDarkHex } from "@/lib/studio/shirt";
import { onRadioGroupKeyDown, radioTabIndex } from "@/lib/roving-radio";
import { cn } from "@/lib/utils";
import type { StudioProduct } from "@/server/services/designs";

const FIT_LABEL: Record<StudioProduct["fit"], string> = { OVERSIZED: "Oversized fit", REGULAR: "Regular fit", RELAXED: "Relaxed fit" };

type StockTone = "ok" | "low" | "out";

function stockLine(color: string | null, size: string | null, sizes: { size: string; stock: number }[]): { text: string; tone: StockTone } | null {
  if (!color) return null;
  if (sizes.every((s) => s.stock === 0)) return { text: "Sold out in this colour", tone: "out" };
  const chosen = size ? sizes.find((s) => s.size === size) : null;
  if (chosen && chosen.stock > 0 && chosen.stock < 5) return { text: `Only ${chosen.stock} left`, tone: "low" };
  return { text: "In stock", tone: "ok" };
}

export function ProductPanel({ product, color, size, onColor, onSize, sizeError }: {
  product: StudioProduct; color: string | null; size: string | null;
  onColor: (name: string) => void; onSize: (size: string) => void; sizeError: boolean;
}) {
  const colors = colorsOf(product.variants);
  const sizes = color ? sizesFor(product.variants, color) : [];
  const stock = stockLine(color, size, sizes);

  return (
    <div className="space-y-6" data-testid="product-panel">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">{FIT_LABEL[product.fit]} · {product.fabric}</p>
        <h2 className="mt-1 text-3xl">{product.name}</h2>
      </div>

      {colors.length > 0 && (
        <div>
          <p className="mb-3 text-sm">Colour: <span className="text-text-muted" data-testid="studio-color-name">{color}</span></p>
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2" onKeyDown={onRadioGroupKeyDown}>
            {colors.map((c, i) => {
              const active = c.name === color;
              return (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={radioTabIndex(colors, i, (x) => x.name === color)}
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => onColor(c.name)}
                  className={cn(
                    "inline-flex size-11 items-center justify-center rounded-full border-2 motion-safe:transition-[border-color,box-shadow]",
                    active ? "border-brand shadow-[0_0_0_3px_var(--bg),0_0_0_5px_var(--accent)]" : "border-border hover:border-text-muted",
                  )}
                  style={{ backgroundColor: c.hex }}
                  data-testid="studio-color"
                >
                  {active && <Check aria-hidden className={cn("size-4", isDarkHex(c.hex) ? "text-white" : "text-black")} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className={cn("mb-3 text-sm", sizeError && "text-danger")}>
          {sizeError ? "Pick a size to continue" : <>Size{size && <>: <span className="text-text-muted">{size}</span></>}</>}
        </p>
        <div role="radiogroup" aria-label="Size" className="flex flex-wrap gap-x-2 gap-y-6 pb-4" onKeyDown={onRadioGroupKeyDown}>
          {sizes.map((s, i) => {
            const active = s.size === size;
            return (
              <button
                key={s.size}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={radioTabIndex(sizes, i, (x) => x.size === size, (x) => x.stock === 0)}
                disabled={s.stock === 0}
                onClick={() => onSize(s.size)}
                className={cn(
                  "relative min-h-11 min-w-12 rounded-full border px-4 text-sm motion-safe:transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40",
                  active ? "border-brand bg-brand text-brand-ink" : sizeError ? "border-danger" : "border-border hover:border-text",
                )}
                data-testid="studio-size"
              >
                {s.size}
                {s.stock > 0 && s.stock < 5 && <span className="absolute inset-x-0 -bottom-5 text-center text-xs text-danger">{s.stock} left</span>}
              </button>
            );
          })}
        </div>
      </div>

      {stock && (
        <p className={cn("flex items-center gap-2 text-sm", stock.tone === "out" ? "text-danger" : stock.tone === "low" ? "text-text" : "text-text-muted")} data-testid="studio-stock">
          <span aria-hidden className={cn("size-2 rounded-full", stock.tone === "ok" ? "bg-brand" : "bg-danger")} />
          {stock.text}
        </p>
      )}

      <p className="rounded-md border border-border bg-surface px-3 py-2.5 text-xs leading-relaxed text-text-muted">
        Print area 12 × 16 in on each side. Printed in-house, ships in 3–5 days.
      </p>
    </div>
  );
}
