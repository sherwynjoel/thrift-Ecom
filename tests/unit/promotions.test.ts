import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderRow, createUser } from "../helpers/fixtures";
import { couponUses, getLiveOffers, normalizeCouponCode, quote, UNKNOWN_COUPON } from "@/server/services/promotions";

const lines = [{ unitPricePaise: 59900, quantity: 2, collectionIds: ["c1"] }];

describe("promotions service", () => {
  beforeEach(resetDb);

  it("normalises codes", () => {
    expect(normalizeCouponCode("  save10 ")).toBe("SAVE10");
  });

  it("reports unknown codes and applies known ones case-insensitively", async () => {
    const unknown = await quote({ lines, couponCode: "nope", userId: null });
    expect(unknown).toMatchObject({ couponError: UNKNOWN_COUPON, applied: null });
    await db.coupon.create({ data: { code: "SAVE10", type: "PERCENT", value: 10 } });
    const r = await quote({ lines, couponCode: "save10", userId: null });
    expect(r).toMatchObject({ applied: "coupon", discountPaise: 11980, coupon: { code: "SAVE10" } });
  });

  it("counts only paid-like orders toward usage", async () => {
    const u = await createUser();
    const other = await createUser();
    await createOrderRow(u.id, { couponCode: "ONCE", status: "PAID" });
    await createOrderRow(u.id, { couponCode: "ONCE", status: "PENDING_PAYMENT", paidAt: null });
    await createOrderRow(other.id, { couponCode: "ONCE", status: "DELIVERED" });
    await createOrderRow(other.id, { couponCode: "ONCE", status: "CANCELLED" });
    expect(await couponUses("once", u.id)).toEqual({ total: 2, byUser: 1 });
    await db.coupon.create({ data: { code: "ONCE", type: "FLAT", value: 5000, perUserLimit: 1 } });
    expect((await quote({ lines, couponCode: "ONCE", userId: u.id })).couponError).toBe("You have already used this code");
    const fresh = await createUser();
    expect((await quote({ lines, couponCode: "ONCE", userId: fresh.id })).applied).toBe("coupon");
  });

  it("loads only live offers, oldest first", async () => {
    const now = new Date();
    const hour = 3_600_000;
    await db.offer.create({ data: { label: "Live", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900 } });
    await db.offer.create({ data: { label: "Off", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900, active: false } });
    await db.offer.create({ data: { label: "Later", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900, startsAt: new Date(now.getTime() + hour) } });
    await db.offer.create({ data: { label: "Gone", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900, endsAt: new Date(now.getTime() - hour) } });
    expect((await getLiveOffers(now)).map((o) => o.label)).toEqual(["Live"]);
    const r = await quote({ lines, userId: null, now });
    expect(r).toMatchObject({ applied: "offer", offer: { label: "Live", discountPaise: 19900 } });
  });
});
