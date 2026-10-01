import { formatRating } from "@/lib/rating";
import type { RatingSummary as Summary } from "@/server/services/reviews";
import { RatingStars } from "./rating-stars";

export function RatingSummary({ summary }: { summary: Summary }) {
  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center" data-testid="rating-summary">
      <div className="space-y-1">
        <p className="font-display text-6xl leading-none">{formatRating(summary.average)}</p>
        <RatingStars rating={summary.average} />
        <p className="text-sm text-text-muted">Based on {summary.count} {summary.count === 1 ? "review" : "reviews"}</p>
      </div>
      <ul className="space-y-1.5" aria-label="Rating breakdown">
        {([5, 4, 3, 2, 1] as const).map((n) => {
          const count = summary.histogram[n];
          const pct = summary.count ? Math.round((count / summary.count) * 100) : 0;
          return (
            <li key={n} className="grid grid-cols-[3ch_1fr_4ch] items-center gap-2 text-sm">
              <span aria-hidden="true">{n}★</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-raised" aria-hidden="true">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-right tabular-nums text-text-muted">
                <span className="sr-only">{n} {n === 1 ? "star" : "stars"}: </span>{count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
