import type { Prisma, ProductStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { getSettings } from "@/server/services/settings";
import type { Page } from "@/server/services/catalog";

export interface InventoryRow {
  variantId: string; productId: string; productName: string; productStatus: ProductStatus; sku: string; size: string;
  colorName: string; colorHex: string; stock: number; low: boolean;
}
export interface InventoryPage extends Page<InventoryRow> { threshold: number; lowCount: number }

const include = { product: { select: { id: true, name: true, status: true } } } satisfies Prisma.ProductVariantInclude;
type Row = Prisma.ProductVariantGetPayload<{ include: typeof include }>;
const toRow = (v: Row, threshold: number): InventoryRow => ({
  variantId: v.id, productId: v.product.id, productName: v.product.name, productStatus: v.product.status, sku: v.sku,
  size: v.size, colorName: v.colorName, colorHex: v.colorHex, stock: v.stock, low: v.stock <= threshold,
});

export async function listInventory(args: { q?: string; lowOnly?: boolean; page?: number; pageSize?: number } = {}): Promise<InventoryPage> {
  const { lowStockThreshold: threshold } = await getSettings();
  const pageSize = Math.min(Math.max(args.pageSize ?? 50, 1), 200);
  const page = Math.max(args.page ?? 1, 1);
  const q = args.q?.trim();
  const where: Prisma.ProductVariantWhereInput = { product: { status: { not: "ARCHIVED" } } };
  if (args.lowOnly) where.stock = { lte: threshold };
  if (q) where.OR = [{ sku: { contains: q, mode: "insensitive" } }, { colorName: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }];
  const orderBy: Prisma.ProductVariantOrderByWithRelationInput[] = args.lowOnly
    ? [{ stock: "asc" }, { product: { name: "asc" } }, { id: "asc" }]
    : [{ product: { name: "asc" } }, { productId: "asc" }, { sortOrder: "asc" }, { id: "asc" }];
  const [total, rows, lowCount] = await Promise.all([
    db.productVariant.count({ where }),
    db.productVariant.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include }),
    db.productVariant.count({ where: { stock: { lte: threshold }, product: { status: { not: "ARCHIVED" } } } }),
  ]);
  return { items: rows.map((r) => toRow(r, threshold)), total, page, pageSize, hasMore: page * pageSize < total, threshold, lowCount };
}

const stockSchema = z.number({ invalid_type_error: "Enter a whole number" }).int("Whole numbers only").min(0, "Stock cannot be negative").max(100_000, "Keep stock under 100,000");

function parseStock(v: unknown, field: string): number {
  const parsed = stockSchema.safeParse(v);
  if (!parsed.success) throw new ValidationError({ [field]: parsed.error.issues.map((i) => i.message) });
  return parsed.data;
}

/**
 * Sets a variant's stock from the inventory screen.
 *
 * When `expectedStock` (the value the admin had on screen) is given, the edit is applied as an
 * increment of `stock - expectedStock` at the database, the same way the product editor's
 * `syncVariants` uses `originalStock`: a checkout that decremented this variant while the admin was
 * typing keeps its sale instead of being overwritten by a stale absolute number. If the result would
 * go negative the edit is rejected with a ConflictError and nothing is written.
 *
 * Raising stock above the low-stock threshold clears `lowStockAlertedAt`, re-arming the alert.
 */
export async function setVariantStock(variantId: string, stock: unknown, expectedStock?: unknown): Promise<InventoryRow> {
  const target = parseStock(stock, "stock");
  const expected = expectedStock === undefined || expectedStock === null ? null : parseStock(expectedStock, "expectedStock");
  const { lowStockThreshold: threshold } = await getSettings();
  return db.$transaction(async (tx) => {
    const exists = await tx.productVariant.findUnique({ where: { id: variantId }, select: { id: true } });
    if (!exists) throw new NotFoundError("Variant");
    const data: Prisma.ProductVariantUpdateInput = expected === null ? { stock: target } : { stock: { increment: target - expected } };
    let v = await tx.productVariant.update({ where: { id: variantId }, data, include });
    if (v.stock < 0) {
      throw new ConflictError("Stock changed while you were editing (an order came in). Reload and try again.", { stock: ["Stock changed; reload"] });
    }
    if (v.stock > threshold && v.lowStockAlertedAt) {
      v = await tx.productVariant.update({ where: { id: variantId }, data: { lowStockAlertedAt: null }, include });
    }
    return toRow(v, threshold);
  });
}
