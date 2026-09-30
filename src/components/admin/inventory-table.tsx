"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setStockAction } from "@/app/admin/inventory/actions";
import { cn } from "@/lib/utils";
import type { InventoryRow } from "@/server/services/admin-inventory";

const GENERIC_ERROR = "Something went wrong. Please try again.";
// Phones: [variant details | stock editor]. md+: product, variant, SKU, stock.
const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_120px]";

function StockRow({ row, threshold }: { row: InventoryRow; threshold: number }) {
  // `saved` is the stock this screen last knew the server had. Edits are sent as "change from saved
  // to typed" so a sale that lands while the admin is typing is kept rather than overwritten.
  const [saved, setSaved] = useState(row.stock);
  const [text, setText] = useState(String(row.stock));
  const [pending, start] = useTransition();
  const skipBlur = useRef(false);
  const router = useRouter();
  const id = `stock-${row.variantId}`;
  const low = saved <= threshold;

  const commit = () => {
    const t = text.trim();
    if (t === String(saved)) return;
    if (!/^\d+$/.test(t) || Number(t) > 100_000) {
      toast.error("Enter a whole number, 0 or more");
      setText(String(saved));
      return;
    }
    const target = Number(t);
    start(async () => {
      try {
        const r = await setStockAction(row.variantId, target, saved);
        if (!r.ok) {
          toast.error(r.message);
          setText(String(saved));
          // The server's stock moved under us (e.g. an order); reload the rows so the next edit starts from the real number.
          router.refresh();
          return;
        }
        setSaved(r.data.stock);
        setText(String(r.data.stock));
        toast.success(r.data.stock === target ? "Stock updated" : `Stock updated to ${r.data.stock} (an order came in while you were editing)`);
      } catch {
        toast.error(GENERIC_ERROR);
        setText(String(saved));
      }
    });
  };

  return (
    <li
      className={cn(ROW, "border-b border-l-4 border-border px-3 py-2 last:border-b-0", low ? "border-l-amber-500" : "border-l-transparent")}
      data-testid="inventory-row"
      data-low={low || undefined}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="size-4 shrink-0 rounded-full border border-border" style={{ backgroundColor: row.colorHex }} aria-hidden />
        <div className="min-w-0">
          <Link href={`/admin/products/${row.productId}`} className="inline-flex min-h-11 items-center font-medium hover:underline">{row.productName}</Link>
          {row.productStatus !== "ACTIVE" && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">Draft</span>}
          <p className="truncate text-xs text-text-muted md:hidden">{row.colorName} / {row.size} · <span className="font-mono">{row.sku}</span></p>
        </div>
      </div>
      <p className="hidden text-sm md:block">{row.colorName} / {row.size}</p>
      <p className="hidden truncate font-mono text-xs text-text-muted md:block">{row.sku}</p>
      <div className="flex items-center justify-end gap-2">
        {pending && <Loader2 className="size-4 animate-spin text-text-muted" aria-label="Saving" />}
        <label className="sr-only" htmlFor={id}>Stock for {row.productName} {row.colorName} {row.size}</label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={text}
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              skipBlur.current = true;
              setText(String(saved));
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            if (skipBlur.current) {
              skipBlur.current = false;
              return;
            }
            commit();
          }}
          className={cn(
            "h-11 w-24 rounded-md border border-border bg-bg px-3 text-right tabular-nums",
            saved === 0 && "text-danger",
          )}
          data-testid="stock-input"
        />
      </div>
    </li>
  );
}

export function InventoryTable({ rows, threshold }: { rows: InventoryRow[]; threshold: number }) {
  return (
    <div className="rounded-md border border-border">
      <div className={cn(ROW, "hidden border-b border-l-4 border-border border-l-transparent bg-surface px-3 py-2 text-xs uppercase tracking-wide text-text-muted md:grid")}>
        <span>Product</span><span>Variant</span><span>SKU</span><span className="text-right">Stock</span>
      </div>
      <ul data-testid="inventory-table">
        {/* Keyed by stock too, so a refresh with a changed server value remounts the row from fresh data. */}
        {rows.map((r) => <StockRow key={`${r.variantId}:${r.stock}`} row={r} threshold={threshold} />)}
      </ul>
    </div>
  );
}
