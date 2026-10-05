import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

const root = mkdtempSync(join(tmpdir(), "banners-"));
const storage = new LocalDiskStorage(root, "/api/uploads");
vi.mock("@/server/adapters/storage", async (orig) => ({ ...(await orig<typeof import("@/server/adapters/storage")>()), getStorage: () => storage }));

import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import {
  createBanner, deleteBanner, getAnnouncement, getLiveBanners, listAdminBanners, moveBanner, setBannerImage, updateBanner,
} from "@/server/services/banners";
import { ValidationError } from "@/server/errors";

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "a.png", { type: "image/png" });
const hero = (over: Record<string, unknown> = {}) => ({ title: "Monsoon drop", subtitle: "", ctaLabel: "Shop now", ctaHref: "/collections/new-drops", placement: "HERO", active: false, startsAt: "", endsAt: "", ...over });
const strip = (title: string, over: Record<string, unknown> = {}) => ({ title, placement: "STRIP", active: true, startsAt: null, endsAt: null, ...over });
const fileOf = (url: string) => join(root, url.replace("/api/uploads/", ""));

describe("banners service", () => {
  beforeEach(resetDb);

  it("validates input", async () => {
    await expect(createBanner(hero({ ctaHref: "javascript:alert(1)" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createBanner(hero({ ctaHref: "" }))).rejects.toBeInstanceOf(ValidationError);   // label without link
    await expect(createBanner(hero({ startsAt: "2026-10-10T10:00:00Z", endsAt: "2026-10-09T10:00:00Z" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createBanner(hero({ title: "x" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("needs a desktop image before a hero slide can go live", async () => {
    await expect(createBanner(hero({ active: true }))).rejects.toBeInstanceOf(ValidationError);
    const { id } = await createBanner(hero());
    await expect(updateBanner(id, hero({ active: true }))).rejects.toBeInstanceOf(ValidationError);
    const { url } = await setBannerImage(id, "desktop", png());
    expect(url).toMatch(new RegExp(`^/api/uploads/banners/${id}/`));
    expect(existsSync(fileOf(url!))).toBe(true);
    await updateBanner(id, hero({ active: true }));
    const { hero: slides } = await getLiveBanners();
    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({ title: "Monsoon drop", imageUrl: url, mobileImageUrl: null, ctaHref: "/collections/new-drops" });
    await expect(setBannerImage(id, "desktop", null)).rejects.toBeInstanceOf(ValidationError);
  });

  it("replaces and removes stored files", async () => {
    const { id } = await createBanner(hero());
    const first = (await setBannerImage(id, "mobile", png())).url!;
    const second = (await setBannerImage(id, "mobile", png())).url!;
    expect(existsSync(fileOf(first))).toBe(false);
    expect(existsSync(fileOf(second))).toBe(true);
    expect(await setBannerImage(id, "mobile", null)).toEqual({ url: null });
    expect(existsSync(fileOf(second))).toBe(false);
    const desktop = (await setBannerImage(id, "desktop", png())).url!;
    await deleteBanner(id);
    expect(existsSync(fileOf(desktop))).toBe(false);
    expect(await db.banner.count()).toBe(0);
  });

  it("shows only live banners, strip lines without images, in order", async () => {
    const now = new Date();
    await createBanner(strip("Free delivery over ₹999"));
    await createBanner(strip("Hidden", { active: false }));
    await createBanner(strip("Later", { startsAt: new Date(now.getTime() + 3_600_000).toISOString() }));
    await createBanner(strip("Ended", { endsAt: new Date(now.getTime() - 1000).toISOString() }));
    await createBanner(strip("Second line"));
    const { strip: lines, hero: slides } = await getLiveBanners(now);
    expect(lines.map((b) => b.title)).toEqual(["Free delivery over ₹999", "Second line"]);
    expect(slides).toEqual([]);
    expect((await listAdminBanners(now)).map((b) => b.state)).toEqual(["live", "off", "scheduled", "expired", "live"]);
  });

  it("moves banners within their placement and ignores moves past the ends", async () => {
    const a = await createBanner(strip("AA"));
    const b = await createBanner(strip("BB"));
    const c = await createBanner(strip("CC"));
    await moveBanner(c.id, "up");
    await moveBanner(a.id, "up");
    const titles = async () => (await getLiveBanners()).strip.map((x) => x.title);
    expect(await titles()).toEqual(["AA", "CC", "BB"]);
    await moveBanner(b.id, "down");
    expect(await titles()).toEqual(["AA", "CC", "BB"]);
  });

  it("reads the announcement from settings", async () => {
    expect(await getAnnouncement()).toBeNull();
    await db.storeSetting.upsert({ where: { id: 1 }, update: { announcementText: "Sale", announcementHref: "/collections/new-drops" }, create: { id: 1, announcementText: "Sale", announcementHref: "/collections/new-drops" } });
    expect(await getAnnouncement()).toEqual({ text: "Sale", href: "/collections/new-drops" });
  });
});
