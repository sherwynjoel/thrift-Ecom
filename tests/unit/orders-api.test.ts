import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderItemRow, createOrderRow, createUser } from "../helpers/fixtures";
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

  it("never shows the customer an admin print hold", async () => {
    const u = await createUser();
    const o = await createOrderRow(u.id, { number: "ORD-1001" });
    const item = await createOrderItemRow(o.id);
    await db.orderItem.update({ where: { id: item.id }, data: { heldAt: new Date(), holdNote: "SECRET-HOLD-NOTE" } });
    const headers = { authorization: `Bearer ${await signApiToken({ id: u.id, role: "CUSTOMER" })}` };
    const one = await getOrder(new NextRequest(`${BASE}/api/v1/orders/ORD-1001`, { headers }), { params: Promise.resolve({ number: "ORD-1001" }) });
    const text = await one.text();
    expect(text).toContain(item.sku);
    expect(text).not.toMatch(/holdNote|heldAt|SECRET-HOLD-NOTE/);
    const list = await listOrders(new NextRequest(`${BASE}/api/v1/orders`, { headers }), { params: Promise.resolve({}) });
    expect(await list.text()).not.toMatch(/holdNote|heldAt|SECRET-HOLD-NOTE/);
  });

  it("never shows the customer the print-file URLs, only the previews", async () => {
    const u = await createUser();
    const o = await createOrderRow(u.id, { number: "ORD-1001" });
    await createOrderItemRow(o.id, {
      designFrontPreviewUrl: "/api/uploads/designs/previews/f.png", printFrontUrl: "/api/uploads/designs/print/SECRET-PRINT.png", printBackUrl: "/api/uploads/designs/print/SECRET-BACK.png",
    });
    const headers = { authorization: `Bearer ${await signApiToken({ id: u.id, role: "CUSTOMER" })}` };
    const one = await getOrder(new NextRequest(`${BASE}/api/v1/orders/ORD-1001`, { headers }), { params: Promise.resolve({ number: "ORD-1001" }) });
    const text = await one.text();
    expect(text).toContain("designs/previews/f.png");
    expect(text).not.toMatch(/printFrontUrl|printBackUrl|designs\/print|SECRET-/);
    const list = await listOrders(new NextRequest(`${BASE}/api/v1/orders`, { headers }), { params: Promise.resolve({}) });
    expect(await list.text()).not.toMatch(/designs\/print|SECRET-/);
  });
});
