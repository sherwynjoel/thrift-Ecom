import type { ReviewStatus } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import type { Page } from "@/server/services/catalog";

export interface AdminReviewRow {
  id: string; rating: number; title: string | null; body: string; status: ReviewStatus; createdAt: Date;
  productName: string; productSlug: string; authorName: string | null; authorEmail: string; orderId: string; orderNumber: string;
}

const PAGE_SIZE = 20;

export async function listAdminReviews(args: { status?: ReviewStatus; page?: number } = {}): Promise<Page<AdminReviewRow>> {
  const status = args.status ?? "PENDING";
  const page = Math.max(1, Math.floor(args.page ?? 1) || 1);
  const where = { status };
  const [total, rows] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: { select: { name: true, slug: true } },
        user: { select: { name: true, email: true } },
        orderItem: { select: { order: { select: { id: true, number: true } } } },
      },
    }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id, rating: r.rating, title: r.title, body: r.body, status: r.status, createdAt: r.createdAt,
      productName: r.product.name, productSlug: r.product.slug, authorName: r.user.name, authorEmail: r.user.email,
      orderId: r.orderItem.order.id, orderNumber: r.orderItem.order.number,
    })),
    total, page, pageSize: PAGE_SIZE, hasMore: page * PAGE_SIZE < total,
  };
}

export async function moderateReview(id: string, status: "APPROVED" | "REJECTED"): Promise<void> {
  const r = await db.review.updateMany({ where: { id }, data: { status, moderatedAt: new Date() } });
  if (r.count === 0) throw new NotFoundError("Review");
}

export function countPendingReviews(): Promise<number> {
  return db.review.count({ where: { status: "PENDING" } });
}
