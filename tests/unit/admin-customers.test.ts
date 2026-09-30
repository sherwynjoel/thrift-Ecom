import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createOrderRow, createUser } from "../helpers/fixtures";
import { createAddress } from "@/server/services/addresses";
import { getCustomer, listCustomers } from "@/server/services/admin-customers";

describe("customers admin", () => {
  beforeEach(resetDb);

  it("lists customers with paid-order stats and searches name, email and phone", async () => {
    const a = await createUser({ name: "Asha Rao", email: "asha@example.test" });
    const b = await createUser({ name: "Ravi K", email: "ravi@example.test" });
    await createUser({ name: "Admin", email: "admin@example.test", role: "ADMIN" });
    await createAddress(b.id, { fullName: "Ravi K", phone: "9123456780", line1: "1 Beach Rd", city: "Chennai", state: "Tamil Nadu", pincode: "600001" });
    await createOrderRow(a.id, { status: "PAID", totalPaise: 59900 });
    await createOrderRow(a.id, { status: "DELIVERED", totalPaise: 40100 });
    await createOrderRow(a.id, { status: "EXPIRED", totalPaise: 99900, paidAt: null });
    const all = await listCustomers();
    expect(all.total).toBe(2);
    expect(all.items.find((c) => c.id === a.id)).toMatchObject({ orderCount: 2, totalSpentPaise: 100000 });
    expect(all.items.find((c) => c.id === b.id)).toMatchObject({ orderCount: 0, totalSpentPaise: 0, lastOrderAt: null });
    expect((await listCustomers({ q: "asha" })).items.map((c) => c.id)).toEqual([a.id]);
    expect((await listCustomers({ q: "91234" })).items.map((c) => c.id)).toEqual([b.id]);
  });

  it("shows a customer's addresses and orders", async () => {
    const a = await createUser({ name: "Asha Rao" });
    await createAddress(a.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await createOrderRow(a.id, { status: "PAID", totalPaise: 59900 });
    const d = await getCustomer(a.id);
    expect(d).toMatchObject({ name: "Asha Rao", orderCount: 1, totalSpentPaise: 59900 });
    expect(d.addresses).toHaveLength(1);
    expect(d.orders).toHaveLength(1);
  });
});
