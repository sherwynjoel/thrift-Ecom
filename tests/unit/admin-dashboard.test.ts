import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct } from "../helpers/fixtures";
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
});
