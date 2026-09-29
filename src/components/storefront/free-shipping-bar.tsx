import { BRAND } from "@/config/brand";
import { formatPaise } from "@/lib/money";

export function FreeShippingBar({ subtotalPaise, thresholdPaise = BRAND.freeShippingThresholdPaise }: { subtotalPaise: number; thresholdPaise?: number }) {
  const threshold = thresholdPaise;
  const remaining = Math.max(0, threshold - subtotalPaise);
  const pct = threshold > 0 ? Math.min(100, Math.round((subtotalPaise / threshold) * 100)) : 100;
  return (
    <div className="space-y-2" data-testid="free-shipping-bar">
      <p className="text-sm text-text-muted">
        {remaining === 0 ? (
          <span className="text-brand">You get free delivery on this order.</span>
        ) : (
          <>Add {formatPaise(remaining)} more for free delivery.</>
        )}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
