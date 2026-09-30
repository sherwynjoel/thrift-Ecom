import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createOrderRow, createUser } from "../helpers/fixtures";
import { signApiToken } from "@/server/api-token";
import { GET as listOrders } from "@/app/api/v1/orders/route";
import { GET as getOrder } from "@/app/api/v1/orders/[number]/route";

const BASE = "http://localhost:3000";

describe("/api/v1/orders", () => {
  beforeEach(resetDb);

  it("lists and reads only the caller's orders", async () => {
    const u = await createUser();
    const other = await createUser();
    const mine = await createOrderRow(u.id, { number: "ORD-1001" });
    await createOrderRow(other.id, { number: "ORD-1002" });
    const headers = { authorization: `Bearer ${await signApiToken({ id: u.id, role: "CUSTOMER" })}` };
    const list = await (await listOrders(new NextRequest(`${BASE}/api/v1/orders`, { headers }), { params: Promise.resolve({}) })).json();
    expect(list.data.items.map((o: { number: string }) => o.number)).toEqual([mine.number]);
    const one = await getOrder(new NextRequest(`${BASE}/api/v1/orders/ORD-1001`, { headers }), { params: Promise.resolve({ number: "ORD-1001" }) });
    expect((await one.json()).data.ship.city).toBe("Bengaluru");
    const theirs = await getOrder(new NextRequest(`${BASE}/api/v1/orders/ORD-1002`, { headers }), { params: Promise.resolve({ number: "ORD-1002" }) });
    expect(theirs.status).toBe(404);
  });
});
