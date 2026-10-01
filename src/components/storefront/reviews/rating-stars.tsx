import { Star } from "lucide-react";
import { ratingLabel } from "@/lib/rating";
import { cn } from "@/lib/utils";

export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const row = (cls: string) => (
    <span className={cn("flex", cls)}>
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="size-4 shrink-0" aria-hidden="true" />)}
    </span>
  );
  return (
    <span role="img" aria-label={ratingLabel(rating)} className={cn("relative inline-flex", className)}>
      {row("text-border")}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>{row("fill-brand text-brand")}</span>
    </span>
  );
}
