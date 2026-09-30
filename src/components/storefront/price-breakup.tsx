import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/money";

export function PriceBreakup({ subtotalPaise, discountPaise, discountLabel, shippingPaise, totalPaise, className }: {
  subtotalPaise: number; discountPaise: number; discountLabel: string | null; shippingPaise: number; totalPaise: number; className?: string;
}) {
  return (
    <dl className={cn("space-y-2 text-sm", className)} data-testid="price-breakup">
      <div className="flex justify-between gap-4"><dt className="text-text-muted">Subtotal</dt><dd>{formatPaise(subtotalPaise)}</dd></div>
      {discountPaise > 0 && (
        <div className="flex justify-between gap-4 text-brand"><dt>{discountLabel ?? "Discount"}</dt><dd data-testid="price-discount">−{formatPaise(discountPaise)}</dd></div>
      )}
      <div className="flex justify-between gap-4"><dt className="text-text-muted">Shipping</dt><dd>{shippingPaise === 0 ? "Free" : formatPaise(shippingPaise)}</dd></div>
      <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
        <dt className="font-medium">Total</dt>
        <dd className="font-display text-2xl" data-testid="price-total">{formatPaise(totalPaise)}</dd>
      </div>
      <p className="text-xs text-text-muted">Inclusive of all taxes.</p>
    </dl>
  );
}
