import Link from "next/link";
import type { Page } from "@/server/services/catalog";
import type { RatingSummary as Summary, ReviewEligibility, ReviewView } from "@/server/services/reviews";
import { MoreReviews } from "./more-reviews";
import { RatingSummary } from "./rating-summary";
import { ReviewForm } from "./review-form";
import { ReviewList } from "./review-list";

export function ProductReviews({ productId, slug, summary, firstPage, eligibility }: {
  productId: string; slug: string; summary: Summary; firstPage: Page<ReviewView>; eligibility: ReviewEligibility;
}) {
  return (
    <section id="reviews" className="scroll-mt-24 border-t border-border py-10" data-testid="reviews" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className="mb-6 text-3xl md:text-4xl">Reviews</h2>
      {summary.count > 0 ? <RatingSummary summary={summary} /> : <p className="text-text-muted">No reviews yet.</p>}
      <div id="write-review" className="mt-8 scroll-mt-24">
        {eligibility.canReview ? (
          <>
            <h3 className="mb-4 text-2xl">Write a review</h3>
            <ReviewForm productId={productId} />
          </>
        ) : eligibility.blocker === "signed-out" ? (
          <p className="text-sm">
            Bought this tee?{" "}
            <Link href={`/login?next=${encodeURIComponent(`/products/${slug}#write-review`)}`} className="inline-flex min-h-11 items-center underline underline-offset-4">Log in to write a review</Link>
          </p>
        ) : eligibility.blocker === "not-delivered" ? (
          <p className="text-sm text-text-muted">Reviews come from customers whose order has been delivered.</p>
        ) : (
          <p className="text-sm text-text-muted">Thanks for reviewing this tee.</p>
        )}
      </div>
      <div className="mt-6">
        <ReviewList reviews={firstPage.items} />
        <MoreReviews slug={slug} initialPage={firstPage.page} hasMore={firstPage.hasMore} />
      </div>
    </section>
  );
}
