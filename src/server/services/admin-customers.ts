import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { listAddresses, type AddressView } from "@/server/services/addresses";
import { orderWithItems, toOrderSummary, type OrderSummary } from "@/server/services/order-records";
import type { Page } from "@/server/services/catalog";
import { PAID_STATUSES } from "@/lib/order-status";

export interface CustomerRow { id: string; name: string | null; email: string; createdAt: Date; orderCount: number; totalSpentPaise: number; lastOrderAt: Date | null }
export interface CustomerDetail { id: string; name: string | null; email: string; createdAt: Date; addresses: AddressView[]; orders: OrderSummary[]; orderCount: number; totalSpentPaise: number }

const paid = { in: [...PAID_STATUSES] };

export async function listCustomers(args: { q?: string; page?: number; pageSize?: number } = {}): Promise<Page<CustomerRow>> {
  const pageSize = Math.min(Math.max(args.pageSize ?? 25, 1), 100);
  const page = Math.max(args.page ?? 1, 1);
  const q = args.q?.trim();
  const where: Prisma.UserWhereInput = { role: "CUSTOMER" };
  if (q) {
    const digits = q.replace(/\D/g, "");
    const or: Prisma.UserWhereInput[] = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
    if (digits.length >= 4) or.push({ addresses: { some: { phone: { contains: digits } } } }, { orders: { some: { shipPhone: { contains: digits } } } });
    where.OR = or;
  }
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: { id: true, name: true, email: true, createdAt: true } }),
  ]);
  const stats = users.length
    ? await db.order.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) }, status: paid }, _count: { _all: true }, _sum: { totalPaise: true }, _max: { createdAt: true } })
    : [];
  const byUser = new Map(stats.map((s) => [s.userId, s]));
  return {
    items: users.map((u) => {
      const s = byUser.get(u.id);
      return { ...u, orderCount: s?._count._all ?? 0, totalSpentPaise: s?._sum.totalPaise ?? 0, lastOrderAt: s?._max.createdAt ?? null };
    }),
    total, page, pageSize, hasMore: page * pageSize < total,
  };
}

export async function getCustomer(id: string): Promise<CustomerDetail> {
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, createdAt: true } });
  if (!user) throw new NotFoundError("Customer");
  const [addresses, orders, agg] = await Promise.all([
    listAddresses(id),
    db.order.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 50, include: orderWithItems }),
    db.order.aggregate({ where: { userId: id, status: paid }, _count: { _all: true }, _sum: { totalPaise: true } }),
  ]);
  return { ...user, addresses, orders: orders.map(toOrderSummary), orderCount: agg._count._all, totalSpentPaise: agg._sum.totalPaise ?? 0 };
}
