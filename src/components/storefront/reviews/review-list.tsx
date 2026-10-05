import { formatDateIst } from "@/lib/dates";
import type { ReviewView } from "@/server/services/reviews";
import { RatingStars } from "./rating-stars";

export function ReviewList({ reviews }: { reviews: ReviewView[] }) {
  if (reviews.length === 0) return null;
  return (
    <ul className="divide-y divide-border">
      {reviews.map((r) => (
        <li key={r.id}>
          <article data-testid="review" className="space-y-2 py-5">
            <RatingStars rating={r.rating} />
            {r.title && <h3 className="font-medium">{r.title}</h3>}
            {r.body && <p className="whitespace-pre-line text-sm leading-relaxed">{r.body}</p>}
            <p className="text-xs text-text-muted">{r.authorName} · Verified buyer · {formatDateIst(r.createdAt)}</p>
          </article>
        </li>
      ))}
    </ul>
  );
}
