import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { signApiToken } from "@/server/api-token";
import { GET, POST } from "@/app/api/v1/wishlist/route";
import { DELETE } from "@/app/api/v1/wishlist/[productId]/route";

const BASE = "http://localhost:3000/api/v1/wishlist";
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

describe("/api/v1/wishlist", () => {
  beforeEach(resetDb);

  it("requires a token", async () => {
    expect((await GET(new NextRequest(BASE), params({}))).status).toBe(401);
  });

  it("adds, lists and removes", async () => {
    const u = await createUser();
    const p = await createProduct({ name: "Api Tee" });
    const auth = { authorization: `Bearer ${await signApiToken({ id: u.id, role: "CUSTOMER" })}` };
    const post = () => POST(new NextRequest(BASE, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ productId: p.id }) }), params({}));
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(200);
    const list = await (await GET(new NextRequest(BASE, { headers: auth }), params({}))).json();
    expect(list.data.items.map((i: { name: string }) => i.name)).toEqual(["Api Tee"]);
    expect((await DELETE(new NextRequest(`${BASE}/${p.id}`, { method: "DELETE", headers: auth }), params({ productId: p.id }))).status).toBe(200);
    const after = await (await GET(new NextRequest(BASE, { headers: auth }), params({}))).json();
    expect(after.data.items).toEqual([]);
  });
});
