import { Prisma, type ReviewStatus } from "@prisma/client";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitedError, ValidationError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { getSettings } from "@/server/services/settings";
import type { Page } from "@/server/services/catalog";
import { autoApproves, reviewerName, roundRating } from "@/lib/rating";
import { REVIEWS_PAGE_SIZE, reviewInputSchema } from "@/lib/validation/review";

export interface ReviewView { id: string; rating: number; title: string | null; body: string; authorName: string; createdAt: Date }
export interface RatingSummary { average: number; count: number; histogram: Record<1 | 2 | 3 | 4 | 5, number> }
export type ReviewBlocker = "signed-out" | "not-delivered" | "already-reviewed";
export interface ReviewEligibility { canReview: boolean; blocker: ReviewBlocker | null }

const HOUR = 3_600_000;

function toView(r: { id: string; rating: number; title: string | null; body: string; createdAt: Date; user: { name: string | null } }): ReviewView {
  return { id: r.id, rating: r.rating, title: r.title, body: r.body, authorName: reviewerName(r.user.name), createdAt: r.createdAt };
}

async function activeProductId(slug: string): Promise<string> {
  const p = await db.product.findFirst({ where: { slug, status: "ACTIVE" }, select: { id: true } });
  if (!p) throw new NotFoundError("Product");
  return p.id;
}

export async function getRatingSummary(productId: string): Promise<RatingSummary> {
  const groups = await db.review.groupBy({ by: ["rating"], where: { productId, status: "APPROVED" }, _count: { _all: true } });
  const histogram: RatingSummary["histogram"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let total = 0;
  for (const g of groups) {
    histogram[g.rating as 1 | 2 | 3 | 4 | 5] = g._count._all;
    count += g._count._all;
    total += g.rating * g._count._all;
  }
  return { average: count ? roundRating(total / count) : 0, count, histogram };
}

const MAX_PAGE = 1000;

export async function listApprovedReviews(productId: string, page = 1): Promise<Page<ReviewView>> {
  const p = Math.min(MAX_PAGE, Math.max(1, Math.floor(page) || 1));
  const where = { productId, status: "APPROVED" as const };
  const [total, rows] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (p - 1) * REVIEWS_PAGE_SIZE, take: REVIEWS_PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
  ]);
  return { items: rows.map(toView), total, page: p, pageSize: REVIEWS_PAGE_SIZE, hasMore: p * REVIEWS_PAGE_SIZE < total };
}

export async function getProductReviewsBySlug(slug: string, page = 1): Promise<{ summary: RatingSummary; reviews: Page<ReviewView> }> {
  const productId = await activeProductId(slug);
  const [summary, reviews] = await Promise.all([getRatingSummary(productId), listApprovedReviews(productId, page)]);
  return { summary, reviews };
}

/** Eligible item for a review: delivered, not yet reviewed, and the product is still active (the server action's
 * productId comes straight from the client, so this is the only gate — the slug-based API path filters ACTIVE too). */
function eligibleItem(userId: string, productId: string) {
  return db.orderItem.findFirst({
    where: { productId, review: { is: null }, order: { userId, status: "DELIVERED" }, product: { status: "ACTIVE" } },
    orderBy: { order: { deliveredAt: "asc" } },
    select: { id: true },
  });
}

export async function getReviewEligibility(userId: string | null, productId: string): Promise<ReviewEligibility> {
  if (!userId) return { canReview: false, blocker: "signed-out" };
  const existing = await db.review.findUnique({ where: { productId_userId: { productId, userId } }, select: { id: true } });
  if (existing) return { canReview: false, blocker: "already-reviewed" };
  return (await eligibleItem(userId, productId)) ? { canReview: true, blocker: null } : { canReview: false, blocker: "not-delivered" };
}

export async function createReview(userId: string, productId: string, input: unknown): Promise<{ id: string; status: ReviewStatus }> {
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodFieldErrors(parsed.error));
  const limit = rateLimit(`review:${userId}`, 5, HOUR);
  if (!limit.ok) throw new RateLimitedError(limit.retryAfterSec);
  const eligibility = await getReviewEligibility(userId, productId);
  if (eligibility.blocker === "already-reviewed") throw new ConflictError("You have already reviewed this product");
  const item = await eligibleItem(userId, productId);
  if (!item) throw new ForbiddenError("Only customers whose order was delivered can review this product");
  const { autoApproveReviews } = await getSettings();
  const status: ReviewStatus = autoApproves(parsed.data.rating, autoApproveReviews) ? "APPROVED" : "PENDING";
  try {
    const row = await db.review.create({
      data: {
        productId, userId, orderItemId: item.id, rating: parsed.data.rating, title: parsed.data.title, body: parsed.data.body,
        status, moderatedAt: status === "APPROVED" ? new Date() : null,
      },
    });
    return { id: row.id, status: row.status };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConflictError("You have already reviewed this product");
    throw err;
  }
}

export async function createReviewBySlug(userId: string, slug: string, input: unknown): Promise<{ id: string; status: ReviewStatus }> {
  return createReview(userId, await activeProductId(slug), input);
}
