import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDeliveredPurchase, createProduct, createUser } from "../helpers/fixtures";
import {
  createReview, getProductReviewsBySlug, getRatingSummary, getReviewEligibility, listApprovedReviews,
} from "@/server/services/reviews";
import { countPendingReviews, listAdminReviews, moderateReview } from "@/server/services/admin-reviews";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import { signApiToken } from "@/server/api-token";
import { GET, POST } from "@/app/api/v1/products/[slug]/reviews/route";

async function buyer(productId: string, name = "Asha Rao") {
  const u = await createUser({ name });
  await createDeliveredPurchase(u.id, productId);
  return u;
}

describe("reviews service", () => {
  beforeEach(resetDb);

  it("works out who may review", async () => {
    const p = await createProduct();
    expect(await getReviewEligibility(null, p.id)).toEqual({ canReview: false, blocker: "signed-out" });
    const shipped = await createUser();
    await createDeliveredPurchase(shipped.id, p.id, { status: "SHIPPED" });
    expect(await getReviewEligibility(shipped.id, p.id)).toEqual({ canReview: false, blocker: "not-delivered" });
    const u = await buyer(p.id);
    expect(await getReviewEligibility(u.id, p.id)).toEqual({ canReview: true, blocker: null });
    await createReview(u.id, p.id, { rating: 5, body: "Great" });
    expect(await getReviewEligibility(u.id, p.id)).toEqual({ canReview: false, blocker: "already-reviewed" });
  });

  it("blocks reviews once the product is no longer active, even via the server-action path (raw productId)", async () => {
    const p = await createProduct();
    const u = await buyer(p.id);
    await db.product.update({ where: { id: p.id }, data: { status: "ARCHIVED" } });
    expect(await getReviewEligibility(u.id, p.id)).toEqual({ canReview: false, blocker: "not-delivered" });
    await expect(createReview(u.id, p.id, { rating: 5 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("auto-approves 4–5 stars, holds the rest, and honours the setting", async () => {
    const p = await createProduct();
    expect((await createReview((await buyer(p.id)).id, p.id, { rating: 5, title: " Love it ", body: "Soft and heavy." })).status).toBe("APPROVED");
    expect((await createReview((await buyer(p.id)).id, p.id, { rating: 3, body: "" })).status).toBe("PENDING");
    await db.storeSetting.upsert({ where: { id: 1 }, update: { autoApproveReviews: false }, create: { id: 1, autoApproveReviews: false } });
    expect((await createReview((await buyer(p.id)).id, p.id, { rating: 5 })).status).toBe("PENDING");
    const saved = await db.review.findFirstOrThrow({ where: { rating: 5, status: "APPROVED" } });
    expect(saved).toMatchObject({ title: "Love it", body: "Soft and heavy." });
    expect(await countPendingReviews()).toBe(2);
  });

  it("refuses non-buyers, duplicates and bad input", async () => {
    const p = await createProduct();
    const stranger = await createUser();
    await expect(createReview(stranger.id, p.id, { rating: 5 })).rejects.toBeInstanceOf(ForbiddenError);
    const u = await buyer(p.id);
    await expect(createReview(u.id, p.id, { rating: 6 })).rejects.toBeInstanceOf(ValidationError);
    await expect(createReview(u.id, p.id, { rating: 4, body: "x".repeat(1001) })).rejects.toBeInstanceOf(ValidationError);
    await createReview(u.id, p.id, { rating: 4 });
    await createDeliveredPurchase(u.id, p.id);   // bought it again
    await expect(createReview(u.id, p.id, { rating: 5 })).rejects.toBeInstanceOf(ConflictError);
  });

  it("summarises and pages approved reviews only", async () => {
    const p = await createProduct({ name: "Summary Tee" });
    for (const r of [5, 5, 4, 4, 4, 5, 5, 4, 5, 5, 4]) await createReview((await buyer(p.id)).id, p.id, { rating: r });
    await createReview((await buyer(p.id)).id, p.id, { rating: 1 });   // pending, not counted
    const s = await getRatingSummary(p.id);
    expect(s).toEqual({ average: 4.5, count: 11, histogram: { 1: 0, 2: 0, 3: 0, 4: 5, 5: 6 } });
    const page1 = await listApprovedReviews(p.id, 1);
    expect(page1).toMatchObject({ total: 11, pageSize: 10, hasMore: true });
    expect(page1.items).toHaveLength(10);
    expect(page1.items[0].authorName).toBe("Asha R.");
    expect((await listApprovedReviews(p.id, 2)).items).toHaveLength(1);
    expect((await getProductReviewsBySlug("summary-tee")).summary.count).toBe(11);
  });

  it("clamps absurd page numbers instead of overflowing the database offset", async () => {
    const p = await createProduct();
    await expect(listApprovedReviews(p.id, 1e300)).resolves.toMatchObject({ items: [], page: 1000 });
    await expect(listApprovedReviews(p.id, -5)).resolves.toMatchObject({ page: 1 });
  });

  it("lets admins moderate", async () => {
    const p = await createProduct({ name: "Moderated Tee" });
    const { id } = await createReview((await buyer(p.id, "Ravi K")).id, p.id, { rating: 2, title: "Too tight" });
    const pending = await listAdminReviews();
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]).toMatchObject({ id, productName: "Moderated Tee", authorName: "Ravi K", status: "PENDING" });
    expect(pending.items[0].orderNumber).toBeTruthy();
    await moderateReview(id, "APPROVED");
    expect((await getRatingSummary(p.id)).count).toBe(1);
    await moderateReview(id, "REJECTED");
    expect((await getRatingSummary(p.id)).count).toBe(0);
    expect((await listAdminReviews({ status: "REJECTED" })).items.map((r) => r.id)).toEqual([id]);
  });

  it("serves the API", async () => {
    const p = await createProduct({ name: "Api Review Tee" });
    const u = await buyer(p.id);
    const base = "http://localhost:3000/api/v1/products/api-review-tee/reviews";
    const params = { params: Promise.resolve({ slug: "api-review-tee" }) };
    const auth = { authorization: `Bearer ${await signApiToken({ id: u.id, role: "CUSTOMER" })}`, "content-type": "application/json" };
    const created = await POST(new NextRequest(base, { method: "POST", headers: auth, body: JSON.stringify({ rating: 5, body: "Nice" }) }), params);
    expect(created.status).toBe(201);
    const listed = await (await GET(new NextRequest(`${base}?page=1`), params)).json();
    expect(listed.data).toMatchObject({ summary: { count: 1, average: 5 }, total: 1, hasMore: false });
    const stranger = await createUser();
    const other = { ...auth, authorization: `Bearer ${await signApiToken({ id: stranger.id, role: "CUSTOMER" })}` };
    expect((await POST(new NextRequest(base, { method: "POST", headers: other, body: JSON.stringify({ rating: 5 }) }), params)).status).toBe(403);
    expect((await GET(new NextRequest("http://localhost:3000/api/v1/products/nope/reviews"), { params: Promise.resolve({ slug: "nope" }) })).status).toBe(404);
  });
});
