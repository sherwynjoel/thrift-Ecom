import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDeliveredPurchase, createProduct, createUser } from "../helpers/fixtures";
import { getEmail, type ConsoleEmail } from "@/server/adapters/email";
import { isJobName } from "@/server/jobs";
import { createReview } from "@/server/services/reviews";
import { runReviewRequest } from "@/server/jobs/review-request";

const DAY = 86_400_000;
const outbox = () => getEmail() as ConsoleEmail;

describe("review-request job", () => {
  beforeEach(async () => {
    await resetDb();
    outbox().sent.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it("is registered for the cron route", () => {
    expect(isJobName("review-request")).toBe(true);
  });

  it("emails once per order, 5–30 days after delivery", async () => {
    const now = new Date();
    const p = await createProduct({ name: "Alpha Tee" });
    const due = await createDeliveredPurchase((await createUser({ name: "Asha Rao" })).id, p.id, { deliveredAt: new Date(now.getTime() - 6 * DAY) });
    await createDeliveredPurchase((await createUser()).id, p.id, { deliveredAt: new Date(now.getTime() - 2 * DAY) });
    await createDeliveredPurchase((await createUser()).id, p.id, { deliveredAt: new Date(now.getTime() - 40 * DAY) });
    await createDeliveredPurchase((await createUser()).id, p.id, { status: "SHIPPED" });
    expect(await runReviewRequest(now)).toEqual({ sent: 1 });
    expect(outbox().sent).toHaveLength(1);
    expect(outbox().sent[0]).toMatchObject({ to: due.order.email, subject: `How is your order ${due.order.number}?` });
    expect(outbox().sent[0].html).toContain("/products/alpha-tee#write-review");
    expect(await runReviewRequest(now)).toEqual({ sent: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: due.order.id } })).reviewRequestedAt).not.toBeNull();
    expect(await db.orderEvent.count({ where: { orderId: due.order.id, type: "EMAIL_SENT" } })).toBe(1);
  });

  it("stamps without emailing when everything is already reviewed", async () => {
    const now = new Date();
    const u = await createUser();
    const p = await createProduct();
    const { order } = await createDeliveredPurchase(u.id, p.id, { deliveredAt: new Date(now.getTime() - 6 * DAY) });
    await createReview(u.id, p.id, { rating: 5 });
    expect(await runReviewRequest(now)).toEqual({ sent: 0 });
    expect(outbox().sent).toHaveLength(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).reviewRequestedAt).not.toBeNull();
  });

  it("releases the claim when sending fails, and respects the setting", async () => {
    const now = new Date();
    const p = await createProduct();
    const { order } = await createDeliveredPurchase((await createUser()).id, p.id, { deliveredAt: new Date(now.getTime() - 6 * DAY) });
    vi.spyOn(outbox(), "send").mockRejectedValueOnce(new Error("smtp down"));
    expect(await runReviewRequest(now)).toEqual({ sent: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).reviewRequestedAt).toBeNull();
    await db.storeSetting.upsert({ where: { id: 1 }, update: { reviewRequestsEnabled: false }, create: { id: 1, reviewRequestsEnabled: false } });
    expect(await runReviewRequest(now)).toEqual({ sent: 0, reason: "disabled" });
    await db.storeSetting.update({ where: { id: 1 }, data: { reviewRequestsEnabled: true } });
    expect(await runReviewRequest(now)).toEqual({ sent: 1 });
  });
});
