import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

const root = mkdtempSync(join(tmpdir(), "admin-img-"));
const storage = new LocalDiskStorage(root, "/api/uploads");
vi.mock("@/server/adapters/storage", async (orig) => ({ ...(await orig<typeof import("@/server/adapters/storage")>()), getStorage: () => storage }));

import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { addProductImages, deleteProductImage, reorderProductImages, updateProductImage } from "@/server/services/admin-images";
import { ValidationError } from "@/server/errors";
import { existsSync, readdirSync } from "node:fs";

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "a.png", { type: "image/png" });
const gif = () => new File([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0])], "a.gif", { type: "image/gif" });

describe("admin images service", () => {
  beforeEach(resetDb);

  it("appends uploaded images after existing ones and stores the files", async () => {
    const p = await createProduct({ images: [{ url: "/seed/x.svg" }] });
    const added = await addProductImages(p.id, [png(), png()]);
    expect(added.map((i) => i.sortOrder)).toEqual([1, 2]);
    expect(added[0].url).toMatch(new RegExp(`^/api/uploads/products/${p.id}/`));
    expect(existsSync(join(root, added[0].url.replace("/api/uploads/", "")))).toBe(true);
  });

  it("rejects bad files and count limits without saving anything", async () => {
    const p = await createProduct({ images: [] });
    await expect(addProductImages(p.id, [png(), gif()])).rejects.toBeInstanceOf(ValidationError);
    expect(await db.productImage.count({ where: { productId: p.id } })).toBe(0);
    await expect(addProductImages(p.id, Array.from({ length: 11 }, png))).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates alt and color tag, reorders, and deletes with file cleanup", async () => {
    const p = await createProduct({ images: [] });
    const [a, b] = await addProductImages(p.id, [png(), png()]);
    expect((await updateProductImage(a.id, { alt: "Front", colorName: "Black" })).colorName).toBe("Black");
    expect((await updateProductImage(a.id, { alt: "Front", colorName: null })).colorName).toBeNull();
    await reorderProductImages(p.id, [b.id, a.id]);
    const order = await db.productImage.findMany({ where: { productId: p.id }, orderBy: { sortOrder: "asc" } });
    expect(order.map((i) => i.id)).toEqual([b.id, a.id]);
    await expect(reorderProductImages(p.id, [a.id])).rejects.toBeInstanceOf(ValidationError);
    await deleteProductImage(a.id);
    expect(existsSync(join(root, a.url.replace("/api/uploads/", "")))).toBe(false);
    expect(await db.productImage.count({ where: { productId: p.id } })).toBe(1);
  });

  it("keeps the file when a past order still shows it as the line thumbnail", async () => {
    const p = await createProduct({ images: [] });
    const [a] = await addProductImages(p.id, [png()]);
    const order = await createOrderRow((await createUser()).id);
    await db.orderItem.create({
      data: { orderId: order.id, productId: p.id, productName: "Tee", productSlug: p.slug, size: "M", colorName: "Black", imageUrl: a.url, sku: "SKU-1", unitPricePaise: 59900, quantity: 1, lineTotalPaise: 59900 },
    });
    await deleteProductImage(a.id);
    expect(await db.productImage.count({ where: { productId: p.id } })).toBe(0);
    expect(existsSync(join(root, a.url.replace("/api/uploads/", "")))).toBe(true);
  });

  it("does not try to delete seed files that the storage adapter did not create", async () => {
    const p = await createProduct({ images: [{ url: "/seed/keep.svg" }] });
    await expect(deleteProductImage(p.images[0].id)).resolves.toEqual({ productId: p.id });
  });

  it("rolls back all inserted rows and stored files when any upload in the batch fails", async () => {
    const p = await createProduct({ images: [] });
    const originalPut = storage.put.bind(storage);
    const keys: string[] = [];
    let calls = 0;
    const spy = vi.spyOn(storage, "put").mockImplementation(async (key: string, bytes: Uint8Array, contentType: string) => {
      keys.push(key);
      calls++;
      if (calls === 2) throw new Error("disk full");
      return originalPut(key, bytes, contentType);
    });
    try {
      await expect(addProductImages(p.id, [png(), png()])).rejects.toThrow("disk full");
    } finally {
      spy.mockRestore();
    }
    expect(await db.productImage.count({ where: { productId: p.id } })).toBe(0);
    expect(existsSync(join(root, keys[0]))).toBe(false);
  });

  it("cleans up a stored file when its own image insert fails", async () => {
    const p = await createProduct({ images: [] });
    const createSpy = vi.spyOn(db.productImage, "create").mockRejectedValueOnce(new Error("insert failed"));
    try {
      await expect(addProductImages(p.id, [png()])).rejects.toThrow("insert failed");
    } finally {
      createSpy.mockRestore();
    }
    expect(await db.productImage.count({ where: { productId: p.id } })).toBe(0);
    const dir = join(root, "products", p.id);
    const remaining = existsSync(dir) ? readdirSync(dir) : [];
    expect(remaining).toEqual([]);
  });
});
