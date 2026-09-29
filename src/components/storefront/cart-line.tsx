"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Minus, Plus, X } from "lucide-react";
import { removeCartItemAction, updateCartItemAction } from "@/app/(storefront)/cart/actions";
import { MAX_QTY_PER_LINE } from "@/lib/catalog-types";
import { formatPaise } from "@/lib/money";
import type { CartLine as Line } from "@/server/services/cart";

export function CartLine({ line }: { line: Line }) {
  const [pending, start] = useTransition();
  const max = Math.min(MAX_QTY_PER_LINE, line.variant.stock);

  const setQty = (q: number) =>
    start(async () => {
      const r = await updateCartItemAction(line.id, q);
      if (!r.ok) toast.error(r.message);
    });
  const remove = () =>
    start(async () => {
      const r = await removeCartItemAction(line.id);
      if (!r.ok) toast.error(r.message);
    });

  return (
    <li className="flex gap-4 py-4" data-testid="cart-line" aria-busy={pending}>
      <Link href={`/products/${line.product.slug}`} className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-sm bg-surface">
        {line.product.imageUrl && <Image src={line.product.imageUrl} alt={line.product.name} fill sizes="80px" className="object-cover" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/products/${line.product.slug}`} className="line-clamp-2 text-sm font-medium">{line.product.name}</Link>
          <button type="button" onClick={remove} aria-label={`Remove ${line.product.name}`} className="text-text-muted hover:text-text">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-xs text-text-muted">{line.variant.colorName} / {line.variant.size}</p>
        <div className="mt-auto flex items-center justify-between">
          <div className="inline-flex items-center rounded-full border border-border">
            <button type="button" onClick={() => setQty(line.quantity - 1)} disabled={pending} aria-label="Decrease quantity" className="px-2 py-1 disabled:opacity-40"><Minus className="size-3" /></button>
            <span className="min-w-6 text-center text-sm" data-testid="cart-line-qty">{line.quantity}</span>
            <button type="button" onClick={() => setQty(line.quantity + 1)} disabled={pending || line.quantity >= max} aria-label="Increase quantity" className="px-2 py-1 disabled:opacity-40"><Plus className="size-3" /></button>
          </div>
          <span className="font-display text-lg">{formatPaise(line.lineTotalPaise)}</span>
        </div>
      </div>
    </li>
  );
}
