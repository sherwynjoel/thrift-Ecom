import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct, linkProductToCollection } from "../helpers/fixtures";
import {
  createCollection as adminCreate, deleteCollection, getAdminCollection, listAdminCollections,
  listCollectionOptions, removeProductFromCollection, reorderCollectionProducts, updateCollection,
} from "@/server/services/admin-collections";
import { NotFoundError, ValidationError } from "@/server/errors";

const input = (over: Record<string, unknown> = {}) => ({ name: "Summer Drop", slug: "", description: "Hot.", isFeatured: false, isActive: true, sortOrder: 3, ...over });

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
});
