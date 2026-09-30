import type { OrderStatus } from "@prisma/client";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { addDays, istDateKey, startOfIstDay } from "@/lib/dates";
import { PAID_STATUSES, TO_SHIP_STATUSES } from "@/lib/order-status";

export interface DashboardStats {
  activeProducts: number; draftProducts: number; archivedProducts: number; lowStockVariants: number; customers: number;
  lowStock: { productId: string; productName: string; size: string; colorName: string; stock: number }[];
  lowStockThreshold: number;
  revenue: { todayPaise: number; last7Paise: number; last30Paise: number };
  paidToday: number; toShip: number; needsAttention: number;
  recentOrders: { id: string; number: string; createdAt: Date; customerName: string; totalPaise: number; status: OrderStatus }[];
  /** `grossSalesPaise`: line totals before discounts and without shipping, so it does not add up to the revenue tiles (M8). */
  topProducts: { productName: string; units: number; grossSalesPaise: number }[];
  /** 14 IST days, oldest first; the last entry is today. */
  revenueByDay: { date: string; revenuePaise: number; orders: number }[];
}

/** Revenue = orders in PAID_STATUSES bucketed by `paidAt` (refunded orders drop out); days are IST days. */
export async function getDashboardStats(now: Date = new Date()): Promise<DashboardStats> {
  const { lowStockThreshold } = await getSettings();
  const today = startOfIstDay(now);
  const since7 = addDays(today, -6);
  const since14 = addDays(today, -13);
  const since30 = addDays(today, -29);
  const paid = { in: [...PAID_STATUSES] };
  const lowWhere = { stock: { lte: lowStockThreshold }, product: { status: "ACTIVE" as const } };
  const sumSince = (from: Date) => db.order.aggregate({ where: { status: paid, paidAt: { gte: from, lte: now } }, _sum: { totalPaise: true } });

  const [byStatus, lowStockVariants, customers, low, rToday, r7, r30, paidToday, toShip, needsAttention, recent, top, recentPaid] = await Promise.all([
    db.product.groupBy({ by: ["status"], _count: { _all: true } }),
    db.productVariant.count({ where: lowWhere }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.productVariant.findMany({ where: lowWhere, orderBy: [{ stock: "asc" }, { product: { name: "asc" } }], take: 10, include: { product: { select: { id: true, name: true } } } }),
    sumSince(today), sumSince(since7), sumSince(since30),
    db.order.count({ where: { status: paid, paidAt: { gte: today, lte: now } } }),
    db.order.count({ where: { status: { in: [...TO_SHIP_STATUSES] } } }),
    db.order.count({ where: { needsAttention: true } }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, number: true, createdAt: true, shipName: true, totalPaise: true, status: true } }),
    db.orderItem.groupBy({
      by: ["productName"],
      where: { order: { status: paid, paidAt: { gte: since30, lte: now } } },
      _sum: { quantity: true, lineTotalPaise: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    db.order.findMany({ where: { status: paid, paidAt: { gte: since14, lte: now } }, select: { paidAt: true, totalPaise: true } }),
  ]);

  const buckets = new Map<string, { revenuePaise: number; orders: number }>();
  for (let i = 13; i >= 0; i--) buckets.set(istDateKey(addDays(today, -i)), { revenuePaise: 0, orders: 0 });
  for (const o of recentPaid) {
    const b = o.paidAt && buckets.get(istDateKey(o.paidAt));
    if (b) {
      b.revenuePaise += o.totalPaise;
      b.orders += 1;
    }
  }
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    activeProducts: count("ACTIVE"), draftProducts: count("DRAFT"), archivedProducts: count("ARCHIVED"), lowStockVariants, customers,
    lowStock: low.map((v) => ({ productId: v.product.id, productName: v.product.name, size: v.size, colorName: v.colorName, stock: v.stock })),
    lowStockThreshold,
    revenue: { todayPaise: rToday._sum.totalPaise ?? 0, last7Paise: r7._sum.totalPaise ?? 0, last30Paise: r30._sum.totalPaise ?? 0 },
    paidToday, toShip, needsAttention,
    recentOrders: recent.map((o) => ({ id: o.id, number: o.number, createdAt: o.createdAt, customerName: o.shipName, totalPaise: o.totalPaise, status: o.status })),
    topProducts: top.map((t) => ({ productName: t.productName, units: t._sum.quantity ?? 0, grossSalesPaise: t._sum.lineTotalPaise ?? 0 })),
    revenueByDay: [...buckets.entries()].map(([date, b]) => ({ date, ...b })),
  };
}
