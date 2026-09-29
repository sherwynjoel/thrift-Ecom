import { db } from "@/server/db";

export interface DashboardStats {
  activeProducts: number; draftProducts: number; archivedProducts: number; lowStockVariants: number; customers: number;
  lowStock: { productId: string; productName: string; size: string; colorName: string; stock: number }[];
}

const LOW = 5;

export async function getDashboardStats(): Promise<DashboardStats> {
  const lowWhere = { stock: { lt: LOW }, product: { status: "ACTIVE" as const } };
  const [byStatus, lowStockVariants, customers, low] = await Promise.all([
    db.product.groupBy({ by: ["status"], _count: { _all: true } }),
    db.productVariant.count({ where: lowWhere }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.productVariant.findMany({ where: lowWhere, orderBy: [{ stock: "asc" }, { product: { name: "asc" } }], take: 10, include: { product: { select: { id: true, name: true } } } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    activeProducts: count("ACTIVE"), draftProducts: count("DRAFT"), archivedProducts: count("ARCHIVED"),
    lowStockVariants, customers,
    lowStock: low.map((v) => ({ productId: v.product.id, productName: v.product.name, size: v.size, colorName: v.colorName, stock: v.stock })),
  };
}
