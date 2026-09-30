"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AddToCartBar({ price, rights, onRights, onAdd, busy, status, compact = false }: {
  price: React.ReactNode; rights: boolean; onRights(v: boolean): void; onAdd(): void; busy: boolean; status: string | null;
  /** Mobile with the tool sheet open: only price + button, so the shirt keeps the room above the sheet. */
  compact?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-sm", compact && "max-md:hidden")}>
        <input
          type="checkbox"
          className="size-5 shrink-0 accent-[var(--accent)]"
          data-testid="rights-checkbox"
          checked={rights}
          onChange={(e) => onRights(e.target.checked)}
        />
        I own the rights to this artwork
      </label>
      <div className="flex items-center justify-between gap-3">
        {price}
        <Button type="button" onClick={onAdd} disabled={busy} aria-busy={busy} className="h-11 shrink-0 px-5 font-display text-lg tracking-wide" data-testid="studio-add-to-cart">
          {busy && <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />}
          {busy ? "Adding…" : "Add to cart"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="min-h-0 text-xs text-text-muted empty:hidden" data-testid="studio-status">{status ?? ""}</p>
    </div>
  );
}
