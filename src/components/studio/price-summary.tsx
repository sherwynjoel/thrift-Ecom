import { customUnitPricePaise, type CustomFees, type DesignSides } from "@/lib/custom-pricing";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

const fee = (paise: number) => (paise === 0 ? "free" : formatPaise(paise));

export function PriceSummary({ basePricePaise, fees, sides, className }: { basePricePaise: number; fees: CustomFees; sides: DesignSides; className?: string }) {
  const parts = [`Tee ${formatPaise(basePricePaise)}`];
  if (sides.front) parts.push(`front print ${fee(fees.frontPaise)}`);
  if (sides.back) parts.push(`back print ${fee(fees.backPaise)}`);
  return (
    <div className={cn("min-w-0 text-sm", className)}>
      <p className="font-display text-2xl leading-none" data-testid="studio-price" aria-live="polite">{formatPaise(customUnitPricePaise(basePricePaise, sides, fees))}</p>
      <p className="mt-1 truncate text-xs text-text-muted">{sides.front || sides.back ? parts.join(" + ") : "Add a design to the front or back"}</p>
    </div>
  );
}
