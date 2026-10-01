import { db } from "@/server/db";
import { reviewRequestEmail, siteUrl } from "@/server/emails/templates";
import { sendEmailSafely } from "@/server/services/notifications";
import { addOrderEvent } from "@/server/services/order-records";
import { getSettings } from "@/server/services/settings";

export const REVIEW_REQUEST_DELAY_DAYS = 5;
export const REVIEW_REQUEST_WINDOW_DAYS = 30;
const DAY = 86_400_000;

export async function runReviewRequest(now: Date = new Date()): Promise<{ sent: number; reason?: "disabled" }> {
  const { reviewRequestsEnabled } = await getSettings();
  if (!reviewRequestsEnabled) return { sent: 0, reason: "disabled" };
  const orders = await db.order.findMany({
    where: {
      status: "DELIVERED",
      reviewRequestedAt: null,
      deliveredAt: { lte: new Date(now.getTime() - REVIEW_REQUEST_DELAY_DAYS * DAY), gte: new Date(now.getTime() - REVIEW_REQUEST_WINDOW_DAYS * DAY) },
    },
    include: {
      user: { select: { name: true, reviews: { select: { productId: true } } } },
      items: { include: { product: { select: { slug: true, status: true } } } },
    },
    orderBy: { deliveredAt: "asc" },
    take: 200,
  });
  let sent = 0;
  for (const o of orders) {
    const claim = await db.order.updateMany({ where: { id: o.id, reviewRequestedAt: null }, data: { reviewRequestedAt: now } });
    if (claim.count !== 1) continue;
    const reviewed = new Set(o.user.reviews.map((r) => r.productId));
    const seen = new Set<string>();
    const items = o.items.flatMap((i) => {
      if (!i.productId || !i.product || i.product.status !== "ACTIVE" || reviewed.has(i.productId) || seen.has(i.productId)) return [];
      seen.add(i.productId);
      return [{ name: i.productName, url: `${siteUrl()}/products/${encodeURIComponent(i.product.slug)}#write-review` }];
    });
    if (items.length === 0) continue;   // stays stamped: nothing left to ask about
    const ok = await sendEmailSafely({ to: o.email, ...reviewRequestEmail({ name: o.user.name ?? o.shipName, orderNumber: o.number, items }) });
    if (ok) {
      sent++;
      await addOrderEvent(db, o.id, "EMAIL_SENT", `Review request email sent → ${o.email}`);
    } else {
      await db.order.update({ where: { id: o.id }, data: { reviewRequestedAt: null } });
      await addOrderEvent(db, o.id, "EMAIL_FAILED", `Review request email failed → ${o.email}`);
    }
  }
  return { sent };
}
