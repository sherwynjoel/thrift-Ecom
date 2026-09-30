import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

const root = mkdtempSync(join(tmpdir(), "designs-"));
const storage = new LocalDiskStorage(root, "/api/uploads");
vi.mock("@/server/adapters/storage", async (orig) => ({ ...(await orig<typeof import("@/server/adapters/storage")>()), getStorage: () => storage }));

import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct } from "../helpers/fixtures";
import { fakePng } from "../helpers/png";
import { POST as createDesign } from "@/app/api/designs/route";
import { GET as getDesign } from "@/app/api/designs/[id]/route";
import { POST as uploadAsset } from "@/app/api/designs/assets/route";

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
function req(path: string, init: { method?: string; body?: FormData; token?: string } = {}) {
  const headers = new Headers();
  if (init.token) headers.set("X-Cart-Token", init.token);
  return new NextRequest(`http://localhost${path}`, { method: init.method ?? "GET", body: init.body, headers });
}
function designForm(productId: string, variantId: string, frontJson: unknown) {
  const f = new FormData();
  f.set("productId", productId);
  f.set("variantId", variantId);
  f.set("quantity", "2");
  f.set("rightsConfirmed", "true");
  f.set("frontJson", JSON.stringify(frontJson));
  f.set("frontPreview", new File([fakePng(800, 1000)], "front-preview.png", { type: "image/png" }));
  f.set("frontPrint", new File([fakePng(3600, 4800)], "front-print.png", { type: "image/png" }));
  return f;
}

describe("design API", () => {
  beforeEach(resetDb);

  it("uploads an asset, creates a design for the cart token and shows it only to its owner", async () => {
    const p = await createProduct({ isCustomizable: true });
    const af = new FormData();
    af.set("file", new File([fakePng(1200, 1600)], "art.png", { type: "image/png" }));
    const assetRes = await uploadAsset(req("/api/designs/assets", { method: "POST", body: af }), ctx());
    expect(assetRes.status).toBe(201);
    const asset = (await assetRes.json()).data as { url: string };
    const res = await createDesign(req("/api/designs", { method: "POST", token: "g-api", body: designForm(p.id, p.variants[0].id, { version: "6.4.0", objects: [{ type: "Image", src: asset.url }] }) }), ctx());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.cart.items[0]).toMatchObject({ quantity: 2 });
    const id = body.data.designId as string;
    expect((await db.design.findUniqueOrThrow({ where: { id } })).cartToken).toBe("g-api");
    expect((await getDesign(req(`/api/designs/${id}`, { token: "g-api" }), ctx({ id }))).status).toBe(200);
    expect((await getDesign(req(`/api/designs/${id}`, { token: "someone-else" }), ctx({ id }))).status).toBe(404);
  });

  it("mints a guest cart cookie when the browser has none", async () => {
    const p = await createProduct({ isCustomizable: true });
    const res = await createDesign(req("/api/designs", { method: "POST", body: designForm(p.id, p.variants[0].id, { objects: [{ type: "Textbox", text: "HI" }] }) }), ctx());
    expect(res.status).toBe(201);
    const token = res.headers.get("X-Cart-Token");
    expect(token).toBeTruthy();
    expect(res.headers.get("set-cookie")).toContain(`cart_token=${token}`);
    expect((await db.design.findFirstOrThrow()).cartToken).toBe(token);
  });

  it("answers 400 for an incomplete side or malformed JSON", async () => {
    const p = await createProduct({ isCustomizable: true });
    const f = designForm(p.id, p.variants[0].id, { objects: [] });
    f.delete("frontPrint");
    expect((await createDesign(req("/api/designs", { method: "POST", token: "g", body: f }), ctx())).status).toBe(400);
    const g = designForm(p.id, p.variants[0].id, {});
    g.set("frontJson", "{not json");
    expect((await createDesign(req("/api/designs", { method: "POST", token: "g", body: g }), ctx())).status).toBe(400);
  });
});
