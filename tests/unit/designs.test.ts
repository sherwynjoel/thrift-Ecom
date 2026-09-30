import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

const root = mkdtempSync(join(tmpdir(), "designs-"));
const storage = new LocalDiskStorage(root, "/api/uploads");
vi.mock("@/server/adapters/storage", async (orig) => ({ ...(await orig<typeof import("@/server/adapters/storage")>()), getStorage: () => storage }));

import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { fakePng } from "../helpers/png";
import { mergeGuestCartIntoUser } from "@/server/services/cart";
import {
  createDesignAndAddToCart, getDesignForOwner, getStudioProduct, listStudioProducts, uploadDesignAsset, type CreateDesignInput, type DesignSideUpload,
} from "@/server/services/designs";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";

const text = { type: "Textbox", text: "HELLO", data: { kind: "text", fontId: "anton" } };
const side = (objects: unknown[] = [text], over: Partial<DesignSideUpload> = {}): DesignSideUpload => ({
  json: { version: "6.4.0", objects }, preview: fakePng(800, 1000), print: fakePng(3600, 4800), ...over,
});
const files = (dir: "print" | "previews" | "assets") => {
  const d = join(root, "designs", dir);
  return existsSync(d) ? readdirSync(d).length : 0;
};

async function blank(stock = 5) {
  const p = await createProduct({ isCustomizable: true, variants: [{ size: "M", colorName: "Black", stock }] });
  return { productId: p.id, variantId: p.variants[0].id };
}
const input = (ids: { productId: string; variantId: string }, over: Partial<CreateDesignInput> = {}): CreateDesignInput => ({
  ...ids, quantity: 1, rightsConfirmed: true, front: side(), back: null, ...over,
});

describe("designs service", () => {
  beforeEach(resetDb);

  it("stores four files, derives asset keys from the JSON and adds a custom line", async () => {
    const ids = await blank();
    const asset = await uploadDesignAsset({ guestToken: "g1" }, new File([fakePng(1200, 1600)], "art.png", { type: "image/png" }));
    expect(asset.key).toMatch(/^designs\/assets\/[a-z0-9-]+\.png$/);
    const before = { print: files("print"), previews: files("previews") };
    const { designId, cart } = await createDesignAndAddToCart({ guestToken: "g1" }, input(ids, { back: side([{ type: "Image", src: asset.url, data: { kind: "image" } }]) }));
    const d = await db.design.findUniqueOrThrow({ where: { id: designId } });
    expect(d).toMatchObject({ cartToken: "g1", userId: null, colorName: "Black", rightsConfirmed: true, assetKeys: [asset.key] });
    expect(d.frontPrintKey).toMatch(/^designs\/print\//);
    expect(d.backPreviewKey).toMatch(/^designs\/previews\//);
    expect(files("print")).toBe(before.print + 2);
    expect(files("previews")).toBe(before.previews + 2);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].design).toMatchObject({ id: designId, label: "Custom print: front + back" });
    expect(await db.designAsset.findUniqueOrThrow({ where: { key: asset.key } })).toMatchObject({ cartToken: "g1", designId });
  });

  it("only accepts images uploaded by the same shopper, and hands them over on login", async () => {
    const ids = await blank();
    const imageSide = (url: string) => side([{ type: "Image", src: url, data: { kind: "image" } }]);
    const theirs = await uploadDesignAsset({ guestToken: "other" }, new File([fakePng(10, 10)], "a.png", { type: "image/png" }));
    await expect(createDesignAndAddToCart({ guestToken: "g1" }, input(ids, { front: imageSide(theirs.url) }))).rejects.toBeInstanceOf(ValidationError);
    // An image URL that was never uploaded through the studio (no record) is refused too.
    await storage.put("designs/assets/stray.png", fakePng(10, 10), "image/png");
    await expect(createDesignAndAddToCart({ guestToken: "g1" }, input(ids, { front: imageSide("/api/uploads/designs/assets/stray.png") }))).rejects.toBeInstanceOf(ValidationError);
    expect(await db.design.count()).toBe(0);
    const mine = await uploadDesignAsset({ guestToken: "g1" }, new File([fakePng(10, 10)], "b.png", { type: "image/png" }));
    const u = await createUser();
    await mergeGuestCartIntoUser("g1", u.id);
    expect(await db.designAsset.findUniqueOrThrow({ where: { key: mine.key } })).toMatchObject({ userId: u.id, cartToken: null });
    await expect(createDesignAndAddToCart({ userId: u.id }, input(ids, { front: imageSide(mine.url) }))).resolves.toMatchObject({ designId: expect.any(String) });
  });

  it("accepts the reduced print size used by small devices", async () => {
    const ids = await blank();
    await expect(createDesignAndAddToCart({ guestToken: "g" }, input(ids, { front: side([text], { print: fakePng(3072, 4096) }) }))).resolves.toMatchObject({ designId: expect.any(String) });
  });

  it("validates rights, emptiness, file formats, sizes and image origins", async () => {
    const ids = await blank();
    const g = { guestToken: "g1" };
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    for (const bad of [
      input(ids, { rightsConfirmed: false }),
      input(ids, { front: null }),
      input(ids, { front: side([]) }),
      input(ids, { quantity: 11 }),
      input(ids, { front: side([text], { print: fakePng(1000, 1000) }) }),
      input(ids, { front: side([text], { preview: fakePng(400, 500) }) }),
      input(ids, { front: side([text], { preview: jpeg }) }),
      input(ids, { front: side([{ type: "Image", src: "https://evil.example/x.png" }]) }),
      input(ids, { front: side([{ type: "Rect" }]) }),
    ]) {
      await expect(createDesignAndAddToCart(g, bad)).rejects.toBeInstanceOf(ValidationError);
    }
    expect(await db.design.count()).toBe(0);
  });

  it("refuses products that are not customizable and variants of another product", async () => {
    const plain = await createProduct();
    const ids = await blank();
    const g = { guestToken: "g" };
    await expect(createDesignAndAddToCart(g, input({ productId: plain.id, variantId: plain.variants[0].id }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(createDesignAndAddToCart(g, input({ productId: ids.productId, variantId: plain.variants[0].id }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("removes the design and its files when the bag refuses the line", async () => {
    const ids = await blank(0);
    const before = files("print");
    await expect(createDesignAndAddToCart({ guestToken: "g" }, input(ids))).rejects.toBeInstanceOf(OutOfStockError);
    expect(await db.design.count()).toBe(0);
    expect(files("print")).toBe(before);
  });

  it("lets only the owner load a design and hands guest designs to the user on login", async () => {
    const ids = await blank();
    const { designId } = await createDesignAndAddToCart({ guestToken: "g1" }, input(ids));
    expect((await getDesignForOwner({ guestToken: "g1" }, designId)).front?.objects).toHaveLength(1);
    await expect(getDesignForOwner({ guestToken: "g2" }, designId)).rejects.toBeInstanceOf(NotFoundError);
    const u = await createUser();
    await expect(getDesignForOwner({ userId: u.id }, designId)).rejects.toBeInstanceOf(NotFoundError);
    const cart = await mergeGuestCartIntoUser("g1", u.id);
    expect(cart.items[0].design?.id).toBe(designId);
    expect(await getDesignForOwner({ userId: u.id }, designId)).toMatchObject({ id: designId, colorName: "Black", back: null });
    await expect(getDesignForOwner({ guestToken: "g1" }, designId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("accepts design assets up to 10 MB", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(fakePng(10, 10));
    expect((await uploadDesignAsset({ guestToken: "g1" }, new File([big], "big.png", { type: "image/png" }))).url).toMatch(/^\/api\/uploads\/designs\/assets\//);
    const huge = new Uint8Array(10 * 1024 * 1024 + 1);
    huge.set(fakePng(10, 10));
    await expect(uploadDesignAsset({ guestToken: "g1" }, new File([huge], "huge.png", { type: "image/png" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("lists customizable products and loads one for the studio", async () => {
    await createProduct({ name: "Plain" });
    const p = await createProduct({ name: "Blank", slug: "blank", basePricePaise: 54900, isCustomizable: true, variants: [{ size: "M", colorName: "Black", colorHex: "#111111", stock: 2, pricePaise: 59900 }, { size: "L", colorName: "Black", colorHex: "#111111", stock: 0 }] });
    expect((await listStudioProducts()).map((c) => [c.slug, c.colors])).toEqual([["blank", [{ name: "Black", hex: "#111111" }]]]);
    const sp = await getStudioProduct("blank");
    expect(sp).toMatchObject({ id: p.id, basePricePaise: 54900, fees: { frontPaise: 0, backPaise: 14900 } });
    expect(sp.variants.map((v) => [v.size, v.pricePaise, v.stock])).toEqual([["M", 59900, 2], ["L", 54900, 0]]);
    await expect(getStudioProduct("plain")).rejects.toBeInstanceOf(NotFoundError);
  });
});
