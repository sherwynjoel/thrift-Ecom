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
import { parseDesignForm } from "@/server/design-form";
import { MAX_DESIGN_UPLOAD_BYTES, MAX_SIDE_JSON_CHARS } from "@/lib/studio/constants";

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
/** Encodes the form like a browser does, with its Content-Length (the upload routes require it). */
async function req(path: string, init: { method?: string; body?: FormData; token?: string; contentLength?: string | null } = {}) {
  const headers = new Headers();
  if (init.token) headers.set("X-Cart-Token", init.token);
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (init.body) {
    const encoded = new Response(init.body);
    headers.set("content-type", encoded.headers.get("content-type")!);
    body = new Uint8Array(await encoded.arrayBuffer());
    if (init.contentLength !== null) headers.set("content-length", init.contentLength ?? String(body.byteLength));
  }
  return new NextRequest(`http://localhost${path}`, { method: init.method ?? "GET", body, headers });
}
function designForm(productId: string, variantId: string, frontJson: unknown, print: Uint8Array<ArrayBuffer> = fakePng(3600, 4800)) {
  const f = new FormData();
  f.set("productId", productId);
  f.set("variantId", variantId);
  f.set("quantity", "2");
  f.set("rightsConfirmed", "true");
  f.set("frontJson", JSON.stringify(frontJson));
  f.set("frontPreview", new File([fakePng(800, 1000)], "front-preview.png", { type: "image/png" }));
  f.set("frontPrint", new File([print], "front-print.png", { type: "image/png" }));
  return f;
}

describe("design API", () => {
  beforeEach(resetDb);

  it("uploads an asset, creates a design for the cart token and shows it only to its owner", async () => {
    const p = await createProduct({ isCustomizable: true });
    const af = new FormData();
    af.set("file", new File([fakePng(1200, 1600)], "art.png", { type: "image/png" }));
    const assetRes = await uploadAsset(await req("/api/designs/assets", { method: "POST", token: "g-api", body: af }), ctx());
    expect(assetRes.status).toBe(201);
    const asset = (await assetRes.json()).data as { url: string };
    const res = await createDesign(await req("/api/designs", { method: "POST", token: "g-api", body: designForm(p.id, p.variants[0].id, { version: "6.4.0", objects: [{ type: "Image", src: asset.url }] }) }), ctx());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.cart.items[0]).toMatchObject({ quantity: 2 });
    const id = body.data.designId as string;
    expect((await db.design.findUniqueOrThrow({ where: { id } })).cartToken).toBe("g-api");
    expect((await getDesign(await req(`/api/designs/${id}`, { token: "g-api" }), ctx({ id }))).status).toBe(200);
    expect((await getDesign(await req(`/api/designs/${id}`, { token: "someone-else" }), ctx({ id }))).status).toBe(404);
  });

  it("mints a guest cart cookie when the browser has none", async () => {
    const p = await createProduct({ isCustomizable: true });
    const res = await createDesign(await req("/api/designs", { method: "POST", body: designForm(p.id, p.variants[0].id, { objects: [{ type: "Textbox", text: "HI" }] }) }), ctx());
    expect(res.status).toBe(201);
    const token = res.headers.get("X-Cart-Token");
    expect(token).toBeTruthy();
    expect(res.headers.get("set-cookie")).toContain(`cart_token=${token}`);
    expect((await db.design.findFirstOrThrow()).cartToken).toBe(token);
  });

  it("refuses uploads without a Content-Length, over the limit, lying about their size or with extra fields", async () => {
    const p = await createProduct({ isCustomizable: true });
    const af = () => {
      const f = new FormData();
      f.set("file", new File([fakePng(10, 10)], "a.png", { type: "image/png" }));
      return f;
    };
    expect((await uploadAsset(await req("/api/designs/assets", { method: "POST", token: "g", body: af(), contentLength: null }), ctx())).status).toBe(411);
    expect((await createDesign(await req("/api/designs", { method: "POST", token: "g", body: designForm(p.id, p.variants[0].id, { objects: [] }), contentLength: null }), ctx())).status).toBe(411);
    expect((await uploadAsset(await req("/api/designs/assets", { method: "POST", token: "g", body: af(), contentLength: String(11 * 1024 * 1024) }), ctx())).status).toBe(413);
    // Declares a small body but streams 11 MB: the byte count stops it.
    const big = new FormData();
    big.set("file", new File([new Uint8Array(11 * 1024 * 1024)], "a.png", { type: "image/png" }));
    expect((await uploadAsset(await req("/api/designs/assets", { method: "POST", token: "g", body: big, contentLength: "1000" }), ctx())).status).toBe(413);
    const extra = af();
    extra.set("other", "x");
    expect((await uploadAsset(await req("/api/designs/assets", { method: "POST", token: "g", body: extra }), ctx())).status).toBe(400);
    const many = designForm(p.id, p.variants[0].id, { objects: [{ type: "Textbox", text: "HI" }] });
    for (let i = 0; i < 9; i++) many.append(`x${i}`, "y");
    expect((await createDesign(await req("/api/designs", { method: "POST", token: "g", body: many }), ctx())).status).toBe(400);
    expect(await db.designAsset.count()).toBe(0);
    expect(await db.design.count()).toBe(0);
  });

  it("takes a photo-sized design body and refuses one declared over the design limit", async () => {
    const p = await createProduct({ isCustomizable: true });
    const print = new Uint8Array(35 * 1024 * 1024);
    print.set(fakePng(3600, 4800));
    const text = { objects: [{ type: "Textbox", text: "HI", data: { kind: "text", fontId: "anton" } }] };
    expect((await createDesign(await req("/api/designs", { method: "POST", token: "g", body: designForm(p.id, p.variants[0].id, text, print) }), ctx())).status).toBe(201);
    const over = String(MAX_DESIGN_UPLOAD_BYTES + 2 * 1024 * 1024);
    expect((await createDesign(await req("/api/designs", { method: "POST", token: "g", body: designForm(p.id, p.variants[0].id, text), contentLength: over }), ctx())).status).toBe(413);
  });

  it("records who uploaded an asset and mints a guest cookie for a new visitor", async () => {
    const af = new FormData();
    af.set("file", new File([fakePng(10, 10)], "a.png", { type: "image/png" }));
    const res = await uploadAsset(await req("/api/designs/assets", { method: "POST", body: af }), ctx());
    expect(res.status).toBe(201);
    const token = res.headers.get("X-Cart-Token");
    expect(res.headers.get("set-cookie")).toContain(`cart_token=${token}`);
    expect(await db.designAsset.findFirstOrThrow()).toMatchObject({ cartToken: token, userId: null, designId: null });
  });

  it("refuses oversized design JSON before parsing it", async () => {
    const f = designForm("p", "v", {});
    f.set("frontJson", "[".repeat(MAX_SIDE_JSON_CHARS + 1));
    const parse = vi.spyOn(JSON, "parse");
    try {
      await expect(parseDesignForm(f)).rejects.toMatchObject({ details: { frontJson: ["This design is too complex. Remove some layers."] } });
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("answers 400 for an incomplete side or malformed JSON", async () => {
    const p = await createProduct({ isCustomizable: true });
    const f = designForm(p.id, p.variants[0].id, { objects: [] });
    f.delete("frontPrint");
    expect((await createDesign(await req("/api/designs", { method: "POST", token: "g", body: f }), ctx())).status).toBe(400);
    const g = designForm(p.id, p.variants[0].id, {});
    g.set("frontJson", "{not json");
    expect((await createDesign(await req("/api/designs", { method: "POST", token: "g", body: g }), ctx())).status).toBe(400);
  });
});
