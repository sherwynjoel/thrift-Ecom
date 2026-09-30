import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { BRAND } from "@/config/brand";
import { resetDb } from "../helpers/db";
import { getSettings, updateSettings } from "@/server/services/settings";
import { ValidationError } from "@/server/errors";

const valid = {
  shippingFeePaise: 4900,
  freeShippingThresholdPaise: 149900,
  lowStockThreshold: 3,
  adminNotifyEmail: " Owner@Example.com ",
  sellerName: "Test Store",
  sellerAddress: "1 Anna Salai, Chennai 600002",
  sellerState: "Tamil Nadu",
  gstin: "33abcde1234f1z5",
  gstRateLowPct: 5,
  gstRateHighPct: 18,
  gstThresholdPaise: 250000,
  whatsappNumber: "+91 98765 43210",
  dailySummaryEnabled: false,
  abandonedCartEnabled: true,
};

describe("settings service", () => {
  beforeEach(resetDb);

  it("creates the singleton lazily with defaults, once", async () => {
    const s = await getSettings();
    expect(s).toMatchObject({
      id: 1, shippingFeePaise: 7900, freeShippingThresholdPaise: BRAND.freeShippingThresholdPaise, lowStockThreshold: 5,
      gstRateLowPct: 5, gstRateHighPct: 18, gstThresholdPaise: 250000, sellerName: BRAND.name,
      dailySummaryEnabled: true, abandonedCartEnabled: true, adminNotifyEmail: null,
    });
    await Promise.all([getSettings(), getSettings(), getSettings()]);
    expect(await db.storeSetting.count()).toBe(1);
  });

  it("saves normalised values", async () => {
    const s = await updateSettings(valid);
    expect(s).toMatchObject({ adminNotifyEmail: "owner@example.com", gstin: "33ABCDE1234F1Z5", whatsappNumber: "9876543210", shippingFeePaise: 4900, dailySummaryEnabled: false });
    expect((await getSettings()).sellerState).toBe("Tamil Nadu");
  });

  it("turns blank optional fields into null", async () => {
    const s = await updateSettings({ ...valid, adminNotifyEmail: "", gstin: "  ", whatsappNumber: "" });
    expect(s).toMatchObject({ adminNotifyEmail: null, gstin: null, whatsappNumber: null });
  });

  it("rejects invalid values with field errors", async () => {
    await expect(updateSettings({ ...valid, sellerState: "Bombay" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ ...valid, gstin: "123" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ ...valid, shippingFeePaise: -1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ ...valid, gstRateHighPct: 40 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ ...valid, whatsappNumber: "12345" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("keeps the lower GST slab at or below the higher one and matches the GSTIN to the seller state", async () => {
    const fields = async (input: Record<string, unknown>) => {
      const err = await updateSettings(input).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      return (err as ValidationError).details as Record<string, string[]>;
    };
    expect(Object.keys(await fields({ ...valid, gstRateLowPct: 18, gstRateHighPct: 12 }))).toEqual(["gstRateLowPct"]);
    expect(Object.keys(await fields({ ...valid, gstin: "29ABCDE1234F1Z5" }))).toEqual(["gstin"]);
    expect(Object.keys(await fields({ ...valid, sellerState: "" }))).toEqual(["sellerState"]);
    await expect(updateSettings({ ...valid, gstRateLowPct: 12, gstRateHighPct: 12 })).resolves.toMatchObject({ gstRateLowPct: 12 });
    await expect(updateSettings({ ...valid, sellerState: "Karnataka", gstin: "29abcde1234f1z5" })).resolves.toMatchObject({ gstin: "29ABCDE1234F1Z5" });
    await expect(updateSettings({ ...valid, sellerState: "", gstin: "" })).resolves.toMatchObject({ gstin: null, sellerState: "" });
  });
});
