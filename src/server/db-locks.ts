import type { Prisma } from "@prisma/client";

/**
 * Locks the user's row (`SELECT … FOR UPDATE`) for the rest of the enclosing transaction, so
 * concurrent per-user operations (two checkouts from two tabs; address create/update/delete/default)
 * are serialized: a second `FOR UPDATE` on the same row blocks until the first transaction commits.
 * In checkout it is the first lock taken (User → open Orders → Coupon → Variants).
 */
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}
