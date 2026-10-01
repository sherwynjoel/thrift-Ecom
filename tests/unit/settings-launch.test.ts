import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { settingsInputFrom } from "../helpers/fixtures";
import { getSettings, updateSettings } from "@/server/services/settings";
import { ValidationError } from "@/server/errors";

describe("launch settings", () => {
  beforeEach(resetDb);

  it("defaults to no announcement and review automation on", async () => {
    expect(await getSettings()).toMatchObject({ announcementText: null, announcementHref: null, autoApproveReviews: true, reviewRequestsEnabled: true });
  });

  it("saves, trims and clears the announcement", async () => {
    const base = settingsInputFrom(await getSettings());
    const saved = await updateSettings({ ...base, announcementText: "  Free shipping this week  ", announcementHref: " /collections/new-drops ", autoApproveReviews: false });
    expect(saved).toMatchObject({ announcementText: "Free shipping this week", announcementHref: "/collections/new-drops", autoApproveReviews: false, reviewRequestsEnabled: true });
    const cleared = await updateSettings({ ...settingsInputFrom(saved), announcementText: "", announcementHref: "" });
    expect(cleared).toMatchObject({ announcementText: null, announcementHref: null });
  });

  it("leaves the new fields alone when an older form omits them", async () => {
    const s = await getSettings();
    await updateSettings({ ...settingsInputFrom(s), announcementText: "Hello", reviewRequestsEnabled: false });
    const { announcementText, announcementHref, autoApproveReviews, reviewRequestsEnabled, ...older } = settingsInputFrom(await getSettings());
    void announcementText; void announcementHref; void autoApproveReviews; void reviewRequestsEnabled;
    expect(await updateSettings(older)).toMatchObject({ announcementText: "Hello", reviewRequestsEnabled: false });
  });

  it("rejects unsafe or oversized announcement values", async () => {
    const base = settingsInputFrom(await getSettings());
    await expect(updateSettings({ ...base, announcementHref: "javascript:alert(1)" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ ...base, announcementText: "x".repeat(141) })).rejects.toBeInstanceOf(ValidationError);
  });
});
