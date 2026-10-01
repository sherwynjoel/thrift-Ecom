import type { Banner, BannerPlacement } from "@prisma/client";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getStorage } from "@/server/adapters/storage";
import { storeImage } from "@/server/uploads";
import { bannerState, type BannerState } from "@/lib/banner-schedule";
import { bannerInputSchema } from "@/lib/validation/banner";

export type BannerSlot = "desktop" | "mobile";

export interface BannerView {
  id: string; title: string; subtitle: string | null; ctaLabel: string | null; ctaHref: string | null;
  imageUrl: string | null; mobileImageUrl: string | null; placement: BannerPlacement;
}
export interface AdminBannerRow extends BannerView { active: boolean; sortOrder: number; startsAt: Date | null; endsAt: Date | null; state: BannerState }
export interface Announcement { text: string; href: string | null }

const publicUrl = (key: string | null) => (key ? getStorage().getPublicUrl(key) : null);

function toView(b: Banner): BannerView {
  return {
    id: b.id, title: b.title, subtitle: b.subtitle, ctaLabel: b.ctaLabel, ctaHref: b.ctaHref,
    imageUrl: publicUrl(b.imageKey), mobileImageUrl: publicUrl(b.mobileImageKey), placement: b.placement,
  };
}

function toAdmin(b: Banner, now: Date): AdminBannerRow {
  return { ...toView(b), active: b.active, sortOrder: b.sortOrder, startsAt: b.startsAt, endsAt: b.endsAt, state: bannerState(b, now) };
}

function parse(input: unknown) {
  const r = bannerInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  const d = r.data;
  // Strip lines are text-only ticker items.
  return d.placement === "STRIP" ? { ...d, subtitle: null, ctaLabel: null, ctaHref: null } : d;
}

function assertActivatable(placement: BannerPlacement, active: boolean, imageKey: string | null): void {
  if (placement === "HERO" && active && !imageKey) {
    throw new ValidationError({ active: ["Upload a desktop image before switching this slide on"] }, "Upload a desktop image before switching this slide on");
  }
}

async function nextSortOrder(placement: BannerPlacement): Promise<number> {
  const max = await db.banner.aggregate({ where: { placement }, _max: { sortOrder: true } });
  return (max._max.sortOrder ?? -1) + 1;
}

async function removeFiles(keys: (string | null)[]): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      await getStorage().delete(key);
    } catch (err) {
      console.error("[banners] could not delete stored file", key, err);
    }
  }
}

export async function getLiveBanners(now: Date = new Date()): Promise<{ hero: BannerView[]; strip: BannerView[] }> {
  // Coarse query (just `active`), then the exact live-window rule is bannerState's alone so it isn't
  // duplicated here as a second Prisma where-clause.
  const rows = await db.banner.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const live = rows.filter((b) => bannerState(b, now) === "live");
  return {
    hero: live.filter((b) => b.placement === "HERO" && b.imageKey).map(toView),
    strip: live.filter((b) => b.placement === "STRIP").map(toView),
  };
}

/** Read-only (no lazy create): the storefront layout calls this on every request. */
export async function getAnnouncement(): Promise<Announcement | null> {
  const s = await db.storeSetting.findUnique({ where: { id: 1 }, select: { announcementText: true, announcementHref: true } });
  return s?.announcementText ? { text: s.announcementText, href: s.announcementHref } : null;
}

export async function listAdminBanners(now: Date = new Date()): Promise<AdminBannerRow[]> {
  const rows = await db.banner.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map((b) => toAdmin(b, now));
}

export async function getAdminBanner(id: string): Promise<AdminBannerRow> {
  const b = await db.banner.findUnique({ where: { id } });
  if (!b) throw new NotFoundError("Banner");
  return toAdmin(b, new Date());
}

export async function createBanner(input: unknown): Promise<{ id: string }> {
  const data = parse(input);
  assertActivatable(data.placement, data.active, null);
  const row = await db.banner.create({ data: { ...data, sortOrder: await nextSortOrder(data.placement) } });
  return { id: row.id };
}

export async function updateBanner(id: string, input: unknown): Promise<void> {
  const data = parse(input);
  const current = await db.banner.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Banner");
  assertActivatable(data.placement, data.active, current.imageKey);
  const sortOrder = data.placement === current.placement ? current.sortOrder : await nextSortOrder(data.placement);
  // Ticker lines are text-only: a slide switched to STRIP drops its images.
  const images = data.placement === "STRIP" ? { imageKey: null, mobileImageKey: null } : {};
  await db.banner.update({ where: { id }, data: { ...data, ...images, sortOrder } });
  if (data.placement === "STRIP") await removeFiles([current.imageKey, current.mobileImageKey]);
}

export async function deleteBanner(id: string): Promise<void> {
  const b = await db.banner.findUnique({ where: { id } });
  if (!b) throw new NotFoundError("Banner");
  await db.banner.delete({ where: { id } });
  await removeFiles([b.imageKey, b.mobileImageKey]);
}

export async function moveBanner(id: string, direction: "up" | "down"): Promise<void> {
  const b = await db.banner.findUnique({ where: { id }, select: { placement: true } });
  if (!b) throw new NotFoundError("Banner");
  const ids = (await db.banner.findMany({ where: { placement: b.placement }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } })).map((s) => s.id);
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await db.$transaction(ids.map((bannerId, index) => db.banner.update({ where: { id: bannerId }, data: { sortOrder: index } })));
}

export async function setBannerImage(id: string, slot: BannerSlot, file: File | null): Promise<{ url: string | null }> {
  const b = await db.banner.findUnique({ where: { id } });
  if (!b) throw new NotFoundError("Banner");
  const previous = slot === "desktop" ? b.imageKey : b.mobileImageKey;
  const field = slot === "desktop" ? "imageKey" : "mobileImageKey";
  if (!file) {
    if (slot === "desktop" && b.placement === "HERO" && b.active) {
      throw new ValidationError({ file: ["Switch the slide off before removing its desktop image"] }, "Switch the slide off before removing its desktop image");
    }
    await db.banner.update({ where: { id }, data: { [field]: null } });
    await removeFiles([previous]);
    return { url: null };
  }
  const { key } = await storeImage(file, `banners/${id}`);
  try {
    await db.banner.update({ where: { id }, data: { [field]: key } });
  } catch (err) {
    await removeFiles([key]);
    throw err;
  }
  await removeFiles([previous]);
  return { url: publicUrl(key) };
}
