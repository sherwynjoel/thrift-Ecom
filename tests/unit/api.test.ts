import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct } from "../helpers/fixtures";
import { GET as listCollections } from "@/app/api/v1/collections/route";
import { GET as collectionProducts } from "@/app/api/v1/collections/[slug]/products/route";
import { GET as productDetail } from "@/app/api/v1/products/[slug]/route";
import { GET as search } from "@/app/api/v1/search/route";
import { GET as getCart } from "@/app/api/v1/cart/route";
import { POST as addCartItem } from "@/app/api/v1/cart/items/route";
import { PATCH as patchCartItem, DELETE as deleteCartItem } from "@/app/api/v1/cart/items/[id]/route";
import { POST as register } from "@/app/api/v1/auth/register/route";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { GET as me } from "@/app/api/v1/me/route";

const BASE = "http://localhost:3000";
const req = (path: string, init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> = {}) => new NextRequest(BASE + path, init);
const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers },
});
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

describe("/api/v1", () => {
  beforeEach(resetDb);

  it("lists collections and paged products with filters in the envelope", async () => {
    const col = await createCollection({ name: "Drops", isFeatured: true });
    await createProduct({ name: "Big", collectionIds: [col.id], variants: [{ size: "XL", colorName: "Black" }] });
    await createProduct({ name: "Small", collectionIds: [col.id], variants: [{ size: "S", colorName: "White" }] });
    const cols = await (await listCollections(req("/api/v1/collections"), params({}))).json();
    expect(cols.data[0].slug).toBe("drops");
    const res = await collectionProducts(req("/api/v1/collections/drops/products?size=S"), params({ slug: "drops" }));
    const body = await res.json();
    expect(body.data.items.map((p: { name: string }) => p.name)).toEqual(["Small"]);
    const missing = await collectionProducts(req("/api/v1/collections/nope/products"), params({ slug: "nope" }));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns product detail with related products, and searches", async () => {
    const col = await createCollection({ name: "C" });
    await createProduct({ name: "Alpha Tee", collectionIds: [col.id] });
    await createProduct({ name: "Beta Tee", collectionIds: [col.id] });
    const res = await productDetail(req("/api/v1/products/alpha-tee"), params({ slug: "alpha-tee" }));
    const body = await res.json();
    expect(body.data.product.slug).toBe("alpha-tee");
    expect(body.data.related.map((p: { name: string }) => p.name)).toEqual(["Beta Tee"]);
    const s = await (await search(req("/api/v1/search?q=beta"), params({}))).json();
    expect(s.data.items).toHaveLength(1);
  });

  it("runs a guest cart through add, update, delete using X-Cart-Token", async () => {
    const p = await createProduct({ name: "Cart Tee", variants: [{ size: "M", colorName: "Black", stock: 3 }] });

    const failed = await addCartItem(req("/api/v1/cart/items", json({ variantId: "does-not-exist", quantity: 1 })), params({}));
    expect(failed.status).toBe(404);
    expect(failed.headers.get("X-Cart-Token")).toBeTruthy();

    const first = await addCartItem(req("/api/v1/cart/items", json({ variantId: p.variants[0].id, quantity: 1 })), params({}));
    expect(first.status).toBe(200);
    const token = first.headers.get("X-Cart-Token");
    expect(token).toBeTruthy();
    const h = { "X-Cart-Token": token! };

    const view = await (await getCart(req("/api/v1/cart", { headers: h }), params({}))).json();
    expect(view.data.itemCount).toBe(1);
    const itemId = view.data.items[0].id;

    const tooMany = await patchCartItem(req(`/api/v1/cart/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity: 5 }), headers: { ...h, "content-type": "application/json" } }), params({ id: itemId }));
    expect(tooMany.status).toBe(409);
    expect((await tooMany.json()).error.code).toBe("OUT_OF_STOCK");

    const gone = await deleteCartItem(req(`/api/v1/cart/items/${itemId}`, { method: "DELETE", headers: h }), params({ id: itemId }));
    expect((await gone.json()).data.items).toEqual([]);

    const bad = await addCartItem(req("/api/v1/cart/items", json({ variantId: "", quantity: 0 }, h)), params({}));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("registers, logs in with a bearer token, and reads /me", async () => {
    const r = await register(req("/api/v1/auth/register", json({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" })), params({}));
    expect(r.status).toBe(201);
    const rb = await r.json();
    expect(rb.data.token).toBeTruthy();
    expect(rb.data.user.email).toBe("asha@example.com");

    const dup = await register(req("/api/v1/auth/register", json({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" })), params({}));
    expect(dup.status).toBe(409);

    const bad = await login(req("/api/v1/auth/login", json({ email: "asha@example.com", password: "wrong" })), params({}));
    expect(bad.status).toBe(401);

    const good = await login(req("/api/v1/auth/login", json({ email: "asha@example.com", password: "hunter2hunter2" })), params({}));
    const { token } = (await good.json()).data;
    const who = await me(req("/api/v1/me", { headers: { authorization: `Bearer ${token}` } }), params({}));
    expect((await who.json()).data.email).toBe("asha@example.com");
    const anon = await me(req("/api/v1/me"), params({}));
    expect(anon.status).toBe(401);
  });

  it("uses the user cart when a bearer token is present", async () => {
    const p = await createProduct({ name: "User Tee" });
    const r = await register(req("/api/v1/auth/register", json({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" })), params({}));
    const { token } = (await r.json()).data;
    const auth = { authorization: `Bearer ${token}` };
    const added = await addCartItem(req("/api/v1/cart/items", json({ variantId: p.variants[0].id, quantity: 2 }, auth)), params({}));
    expect(added.headers.get("X-Cart-Token")).toBeNull();
    const view = await (await getCart(req("/api/v1/cart", { headers: auth }), params({}))).json();
    expect(view.data.itemCount).toBe(2);
  });
});
