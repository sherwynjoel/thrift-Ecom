import { discountPercent, formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export function Price({ pricePaise, compareAtPricePaise, size = "md" }: { pricePaise: number; compareAtPricePaise?: number | null; size?: "md" | "lg" }) {
  const off = discountPercent(pricePaise, compareAtPricePaise);
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2", size === "lg" ? "text-3xl" : "text-lg")} data-testid="price">
      <span className="font-display">{formatPaise(pricePaise)}</span>
      {off !== null && compareAtPricePaise && (
        <>
          <s className="text-sm text-text-muted">{formatPaise(compareAtPricePaise)}</s>
          <span className="text-sm font-medium text-brand">{off}% off</span>
        </>
      )}
    </p>
  );
}
