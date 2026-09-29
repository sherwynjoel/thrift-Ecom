import { db } from "@/server/db";

const TABLES = [
  "CartItem",
  "Cart",
  "ProductImage",
  "ProductVariant",
  "ProductCollection",
  "Product",
  "Collection",
  "Account",
  "VerificationToken",
  "User",
];

export async function resetDb(): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
