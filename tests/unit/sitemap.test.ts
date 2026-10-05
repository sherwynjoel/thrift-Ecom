import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct } from "../helpers/fixtures";
import sitemap from "@/app/sitemap";
import { listPageSlugs } from "@/server/content";

describe("sitemap", () => {
  beforeEach(resetDb);

  it("lists home, active collections, active products and content pages", async () => {
    const col = await createCollection({ name: "New Drops" });
    await createCollection({ name: "Hidden", isActive: false });
    await createProduct({ name: "Alpha Tee", collectionIds: [col.id], images: [{ url: "/seed/a.svg" }] });
    await createProduct({ name: "Draft Tee", status: "DRAFT" });
    const urls = (await sitemap()).map((e) => e.url);
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    expect(urls).toContain(`${base}/`);
    expect(urls).toContain(`${base}/collections/new-drops`);
    expect(urls).toContain(`${base}/products/alpha-tee`);
    expect(urls).not.toContain(`${base}/collections/hidden`);
    expect(urls).not.toContain(`${base}/products/draft-tee`);
    for (const slug of await listPageSlugs()) expect(urls).toContain(`${base}/pages/${slug}`);
    expect(await listPageSlugs()).toContain("shipping");
  });
});
