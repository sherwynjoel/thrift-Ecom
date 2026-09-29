import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

const root = mkdtempSync(join(tmpdir(), "admin-col-"));
const storage = new LocalDiskStorage(root, "/api/uploads");
vi.mock("@/server/adapters/storage", async (orig) => ({ ...(await orig<typeof import("@/server/adapters/storage")>()), getStorage: () => storage }));

import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct, linkProductToCollection } from "../helpers/fixtures";
import {
  createCollection as adminCreate, deleteCollection, getAdminCollection, listAdminCollections,
  listCollectionOptions, removeProductFromCollection, reorderCollectionProducts, setCollectionHero, updateCollection,
} from "@/server/services/admin-collections";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`slug`)", { code: "P2002", clientVersion: "test" });

const input = (over: Record<string, unknown> = {}) => ({ name: "Summer Drop", slug: "", description: "Hot.", isFeatured: false, isActive: true, sortOrder: 3, ...over });
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "a.png", { type: "image/png" });

describe("admin collections service", () => {
  beforeEach(resetDb);

  it("creates with a unique slug and lists by sortOrder with product counts", async () => {
    await createCollection({ name: "Summer Drop", sortOrder: 9 });
    const { slug } = await adminCreate(input());
    expect(slug).toBe("summer-drop-2");
    const rows = await listAdminCollections();
    expect(rows.map((r) => r.slug)).toEqual(["summer-drop-2", "summer-drop"]);
    expect((await listCollectionOptions()).length).toBe(2);
    await expect(adminCreate(input({ name: "x" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates, reorders and removes products, deletes without touching products", async () => {
    const c = await createCollection({ name: "Box" });
    const a = await createProduct({ name: "A" });
    const b = await createProduct({ name: "B" });
    await linkProductToCollection(c.id, a.id, 0);
    await linkProductToCollection(c.id, b.id, 1);
    await updateCollection(c.id, input({ name: "Box Set", slug: "box-set", isFeatured: true }));
    await reorderCollectionProducts(c.id, [b.id, a.id]);
    let d = await getAdminCollection(c.id);
    expect(d).toMatchObject({ name: "Box Set", slug: "box-set", isFeatured: true });
    expect(d.products.map((p) => p.name)).toEqual(["B", "A"]);
    await expect(reorderCollectionProducts(c.id, [a.id])).rejects.toBeInstanceOf(ValidationError);
    await removeProductFromCollection(c.id, a.id);
    d = await getAdminCollection(c.id);
    expect(d.products.map((p) => p.name)).toEqual(["B"]);
    await deleteCollection(c.id);
    await expect(getAdminCollection(c.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.product.count()).toBe(2);
  });

  it("stores, replaces, and clears a hero image on disk", async () => {
    const c = await createCollection({ name: "Hero" });
    const url1 = await setCollectionHero(c.id, png());
    expect(url1).toMatch(new RegExp(`^/api/uploads/collections/${c.id}/`));
    expect(existsSync(join(root, url1!.replace("/api/uploads/", "")))).toBe(true);
    expect((await db.collection.findUnique({ where: { id: c.id } }))?.heroImageUrl).toBe(url1);

    const url2 = await setCollectionHero(c.id, png());
    expect(url2).not.toBe(url1);
    expect(existsSync(join(root, url1!.replace("/api/uploads/", "")))).toBe(false);
    expect(existsSync(join(root, url2!.replace("/api/uploads/", "")))).toBe(true);
    expect((await db.collection.findUnique({ where: { id: c.id } }))?.heroImageUrl).toBe(url2);

    const url3 = await setCollectionHero(c.id, null);
    expect(url3).toBeNull();
    expect(existsSync(join(root, url2!.replace("/api/uploads/", "")))).toBe(false);
    expect((await db.collection.findUnique({ where: { id: c.id } }))?.heroImageUrl).toBeNull();
  });

  it("deletes the hero file when the collection is deleted", async () => {
    const c = await createCollection({ name: "Hero2" });
    const url = await setCollectionHero(c.id, png());
    await deleteCollection(c.id);
    expect(existsSync(join(root, url!.replace("/api/uploads/", "")))).toBe(false);
  });

  it("maps a slug conflict on create to a ConflictError with a field error on slug", async () => {
    // `vi.spyOn(...).mockRestore()` does not put Prisma's client method back correctly (it leaves
    // `db.collection.create` as `undefined` for every later test in this file) — save and restore the
    // real bound method by hand instead.
    const originalCreate = db.collection.create.bind(db.collection);
    db.collection.create = vi.fn().mockRejectedValueOnce(p2002()) as unknown as typeof db.collection.create;
    try {
      const err = await adminCreate(input()).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.details).toEqual({ slug: ["That slug is already in use"] });
    } finally {
      db.collection.create = originalCreate;
    }
  });

  it("maps a slug conflict on update the same way", async () => {
    const c = await createCollection({ name: "Box2" });
    const originalUpdate = db.collection.update.bind(db.collection);
    db.collection.update = vi.fn().mockRejectedValueOnce(p2002()) as unknown as typeof db.collection.update;
    try {
      const err = await updateCollection(c.id, input({ name: "Box 2 renamed" })).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.details).toEqual({ slug: ["That slug is already in use"] });
    } finally {
      db.collection.update = originalUpdate;
    }
  });

  it("deletes the newly stored hero file when the DB update fails", async () => {
    const c = await createCollection({ name: "Hero3" });
    const putSpy = vi.spyOn(storage, "put");
    const originalUpdate = db.collection.update.bind(db.collection);
    db.collection.update = vi.fn().mockRejectedValueOnce(new Error("db down")) as unknown as typeof db.collection.update;
    try {
      await expect(setCollectionHero(c.id, png())).rejects.toThrow("db down");
    } finally {
      db.collection.update = originalUpdate;
    }
    expect(putSpy).toHaveBeenCalledTimes(1);
    const key = putSpy.mock.calls[0][0] as string;
    putSpy.mockRestore();
    expect(existsSync(join(root, key))).toBe(false);
    expect((await db.collection.findUnique({ where: { id: c.id } }))?.heroImageUrl).toBeNull();
  });

  it("throws NotFoundError removing a product from an unknown collection", async () => {
    const p = await createProduct({ name: "Orphan" });
    await expect(removeProductFromCollection("does-not-exist", p.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
