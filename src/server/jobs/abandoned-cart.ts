import { db } from "@/server/db";
import { abandonedCartEmail } from "@/server/emails/templates";
import { sendEmailSafely } from "@/server/services/notifications";
import { getSettings } from "@/server/services/settings";

const HOUR = 3_600_000;

export async function runAbandonedCart(now: Date = new Date()): Promise<{ sent: number; reason?: "disabled" }> {
  const s = await getSettings();
  if (!s.abandonedCartEnabled) return { sent: 0, reason: "disabled" };
  const newest = new Date(now.getTime() - 3 * HOUR);
  const oldest = new Date(now.getTime() - 48 * HOUR);
  const carts = await db.cart.findMany({
    where: { userId: { not: null }, remindedAt: null, items: { some: { updatedAt: { gte: oldest } } } },
    include: {
      user: { select: { email: true, name: true } },
      items: { include: { variant: { include: { product: { select: { name: true, status: true } } } } } },
    },
    take: 500,
  });
  let sent = 0;
  for (const c of carts) {
    if (!c.user || !c.userId || c.items.length === 0) continue;
    const last = new Date(Math.max(...c.items.map((i) => i.updatedAt.getTime())));
    if (last > newest || last < oldest) continue;
    const live = c.items.filter((i) => i.variant.product.status === "ACTIVE" && i.variant.stock > 0);
    if (live.length === 0) continue;
    if ((await db.order.count({ where: { userId: c.userId, createdAt: { gte: last } } })) > 0) continue;
    const claim = await db.cart.updateMany({ where: { id: c.id, remindedAt: null }, data: { remindedAt: now } });
    if (claim.count !== 1) continue;
    const ok = await sendEmailSafely({
      to: c.user.email,
      ...abandonedCartEmail({ name: c.user.name, items: live.map((i) => ({ name: i.variant.product.name, size: i.variant.size, colorName: i.variant.colorName })) }),
    });
    if (ok) sent++;
    else await db.cart.update({ where: { id: c.id }, data: { remindedAt: null } });
  }
  return { sent };
}
