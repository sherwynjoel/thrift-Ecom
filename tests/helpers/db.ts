import { db } from "@/server/db";

const TABLES = [
  "OrderEvent",
  "OrderItem",
  "DesignAsset",
  "Design",
  "Order",
  "Address",
  "Coupon",
  "Offer",
  "StoreSetting",
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
  await db.$executeRawUnsafe(`ALTER SEQUENCE "order_number_seq" RESTART WITH 1001`);
}
