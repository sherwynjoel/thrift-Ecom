"use client";

import { ShoppingBag } from "lucide-react";
import { useCartUI } from "./cart-ui";

export function CartTrigger({ count }: { count: number }) {
  const setOpen = useCartUI((s) => s.setOpen);
  return (
    <button type="button" onClick={() => setOpen(true)} className="relative p-2" aria-label={`Open bag, ${count} items`} data-testid="cart-trigger">
      <ShoppingBag className="size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-brand-ink" data-testid="cart-count">{count}</span>
      )}
    </button>
  );
}
