import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/fixtures";
import { signApiToken } from "@/server/api-token";
import { GET as list, POST as create } from "@/app/api/v1/addresses/route";
import { DELETE as remove, PATCH as patch } from "@/app/api/v1/addresses/[id]/route";
import { POST as makeDefault } from "@/app/api/v1/addresses/[id]/default/route";

const BASE = "http://localhost:3000";
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });
const body = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", line2: "", landmark: "", city: "Bengaluru", state: "Karnataka", pincode: "560001", isDefault: false };

describe("/api/v1/addresses", () => {
  beforeEach(resetDb);

  it("requires a signed-in user", async () => {
    const res = await list(new NextRequest(`${BASE}/api/v1/addresses`), params({}));
    expect(res.status).toBe(401);
  });

  it("creates, lists, updates, defaults and deletes", async () => {
    const u = await createUser();
    const auth = { authorization: `Bearer ${await signApiToken({ id: u.id, role: "CUSTOMER" })}`, "content-type": "application/json" };
    const created = await create(new NextRequest(`${BASE}/api/v1/addresses`, { method: "POST", headers: auth, body: JSON.stringify(body) }), params({}));
    expect(created.status).toBe(201);
    const a = (await created.json()).data;
    expect(a.isDefault).toBe(true);

    const second = await (await create(new NextRequest(`${BASE}/api/v1/addresses`, { method: "POST", headers: auth, body: JSON.stringify({ ...body, fullName: "Ravi" }) }), params({}))).json();
    const bad = await create(new NextRequest(`${BASE}/api/v1/addresses`, { method: "POST", headers: auth, body: JSON.stringify({ ...body, pincode: "12" }) }), params({}));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.details.pincode).toBeDefined();

    const updated = await patch(new NextRequest(`${BASE}/api/v1/addresses/${a.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ ...body, city: "Mysuru" }) }), params({ id: a.id }));
    expect((await updated.json()).data.city).toBe("Mysuru");

    const defaults = await (await makeDefault(new NextRequest(`${BASE}/api/v1/addresses/${second.data.id}/default`, { method: "POST", headers: auth }), params({ id: second.data.id }))).json();
    expect(defaults.data[0]).toMatchObject({ id: second.data.id, isDefault: true });

    const del = await remove(new NextRequest(`${BASE}/api/v1/addresses/${a.id}`, { method: "DELETE", headers: auth }), params({ id: a.id }));
    expect(del.status).toBe(200);
    const after = await (await list(new NextRequest(`${BASE}/api/v1/addresses`, { headers: auth }), params({}))).json();
    expect(after.data).toHaveLength(1);
  });
});
