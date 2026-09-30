import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { getDashboardStats } from "@/server/services/admin-dashboard";

describe("admin dashboard", () => {
  beforeEach(resetDb);

  it("counts products by status, low-stock active variants, and customers", async () => {
    await createProduct({ name: "Live", status: "ACTIVE", variants: [{ size: "S", colorName: "Red", stock: 2 }, { size: "M", colorName: "Red", stock: 9 }] });
    await createProduct({ name: "Draft", status: "DRAFT", variants: [{ size: "S", colorName: "Red", stock: 0 }] });
    await createProduct({ name: "Old", status: "ARCHIVED" });
    await db.user.create({ data: { email: "c@x.test" } });
    await db.user.create({ data: { email: "a@x.test", role: "ADMIN" } });
    const s = await getDashboardStats();
    expect(s).toMatchObject({ activeProducts: 1, draftProducts: 1, archivedProducts: 1, lowStockVariants: 1, customers: 1 });
    expect(s.lowStock).toEqual([{ productId: expect.any(String), productName: "Live", size: "S", colorName: "Red", stock: 2 }]);
  });

  it("adds revenue windows, queues, recent orders, top products and 14-day bars", async () => {
    const now = new Date("2026-10-10T12:00:00Z"); // 17:30 IST
    const day = 86_400_000;
    const u = await createUser();
    const today = await createOrderRow(u.id, { status: "PAID", totalPaise: 100000, paidAt: new Date(now.getTime() - 3_600_000) });
    await createOrderRow(u.id, { status: "SHIPPED", totalPaise: 50000, paidAt: new Date(now.getTime() - 3 * day) });
    await createOrderRow(u.id, { status: "DELIVERED", totalPaise: 20000, paidAt: new Date(now.getTime() - 20 * day) });
    await createOrderRow(u.id, { status: "DELIVERED", totalPaise: 70000, paidAt: new Date(now.getTime() - 40 * day) });
    await createOrderRow(u.id, { status: "REFUNDED", totalPaise: 99999, paidAt: new Date(now.getTime() - 3_600_000) });
    await createOrderRow(u.id, { status: "PENDING_PAYMENT", paidAt: null, needsAttention: true });
    await db.orderItem.create({ data: { orderId: today.id, productName: "Alpha", productSlug: "alpha", size: "M", colorName: "Black", sku: "A-1", unitPricePaise: 50000, quantity: 2, lineTotalPaise: 100000 } });
    const s = await getDashboardStats(now);
    expect(s.revenue).toEqual({ todayPaise: 100000, last7Paise: 150000, last30Paise: 170000 });
    expect(s).toMatchObject({ paidToday: 1, toShip: 1, needsAttention: 1, lowStockThreshold: 5 });
    expect(s.recentOrders).toHaveLength(6);
    expect(s.topProducts).toEqual([{ productName: "Alpha", units: 2, grossSalesPaise: 100000 }]);
    expect(s.revenueByDay).toHaveLength(14);
    expect(s.revenueByDay[13]).toEqual({ date: "2026-10-10", revenuePaise: 100000, orders: 1 });
    expect(s.revenueByDay[10]).toEqual({ date: "2026-10-07", revenuePaise: 50000, orders: 1 });
  });
});
