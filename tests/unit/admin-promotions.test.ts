import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createCollection, createOrderRow, createUser } from "../helpers/fixtures";
import {
  createCoupon, createOffer, deleteCoupon, deleteOffer, describeCoupon, describeOffer, listCoupons, listOffers, updateCoupon, updateOffer,
} from "@/server/services/admin-promotions";
import { ConflictError, ValidationError } from "@/server/errors";

const coupon = (over: Record<string, unknown> = {}) => ({
  code: "save10", type: "PERCENT", value: 10, minSubtotalPaise: 0, maxDiscountPaise: 20000, startsAt: null, endsAt: null,
  usageLimit: null, perUserLimit: 1, active: true, ...over,
});
const offer = (over: Record<string, unknown> = {}) => ({
  label: "Any 3 for ₹999", type: "BUNDLE_PRICE", minQty: 3, pricePaise: 99900, percent: null, collectionId: null,
  active: true, startsAt: null, endsAt: null, ...over,
});

describe("coupons admin", () => {
  beforeEach(resetDb);

  it("creates uppercase unique codes and validates values and windows", async () => {
    const c = await createCoupon(coupon());
    expect(c).toMatchObject({ code: "SAVE10", uses: 0 });
    expect(describeCoupon(c)).toBe("10% off (max ₹200)");
    expect(describeCoupon({ type: "FLAT", value: 10000, maxDiscountPaise: null })).toBe("₹100 off");
    await expect(createCoupon(coupon({ code: "Save10" }))).rejects.toBeInstanceOf(ConflictError);
    await expect(createCoupon(coupon({ code: "BIG", value: 95 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCoupon(coupon({ code: "FLAT", type: "FLAT", value: 50 }))).rejects.toBeInstanceOf(ValidationError);
    // Flat values are capped at ₹1,00,000 (a larger paise value would also overflow the Int column).
    await expect(createCoupon(coupon({ code: "HUGE", type: "FLAT", value: 10_000_100, maxDiscountPaise: null }))).rejects.toBeInstanceOf(ValidationError);
    expect((await createCoupon(coupon({ code: "MAXFLAT", type: "FLAT", value: 10_000_000, maxDiscountPaise: null }))).value).toBe(10_000_000);
    await expect(createCoupon(coupon({ code: "WIN", startsAt: "2026-10-02T00:00:00.000Z", endsAt: "2026-10-01T00:00:00.000Z" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCoupon(coupon({ code: "x" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("counts uses and protects used codes", async () => {
    const c = await createCoupon(coupon());
    const u = await createUser();
    await createOrderRow(u.id, { couponCode: "SAVE10", status: "DELIVERED" });
    await createOrderRow(u.id, { couponCode: "SAVE10", status: "CANCELLED" });
    expect((await listCoupons())[0].uses).toBe(1);
    await expect(updateCoupon(c.id, coupon({ code: "SAVE20" }))).rejects.toBeInstanceOf(ConflictError);
    expect((await updateCoupon(c.id, coupon({ active: false }))).active).toBe(false);
    await expect(deleteCoupon(c.id)).rejects.toBeInstanceOf(ConflictError);
    const unused = await createCoupon(coupon({ code: "UNUSED" }));
    await deleteCoupon(unused.id);
    expect((await listCoupons()).map((x) => x.code)).toEqual(["SAVE10"]);
  });
});

describe("coupons held by orders awaiting payment", () => {
  beforeEach(resetDb);

  it("can't be renamed or deleted while an unexpired pending order holds the code, and uses stay paid-only", async () => {
    const c = await createCoupon(coupon());
    const u = await createUser();
    const pending = await createOrderRow(u.id, { couponCode: "SAVE10", status: "PENDING_PAYMENT", paidAt: null });
    expect((await listCoupons())[0].uses).toBe(0);
    await expect(updateCoupon(c.id, coupon({ code: "SAVE20" }))).rejects.toThrow(/awaiting payment/);
    await expect(deleteCoupon(c.id)).rejects.toThrow(/awaiting payment/);
    // Other edits are still allowed.
    expect((await updateCoupon(c.id, coupon({ active: false }))).active).toBe(false);
    // Once that order has expired the code is free again.
    await db.order.update({ where: { id: pending.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await updateCoupon(c.id, coupon({ code: "SAVE20" }))).code).toBe("SAVE20");
    await deleteCoupon(c.id);
    expect(await listCoupons()).toEqual([]);
  });
});

describe("offers admin", () => {
  beforeEach(resetDb);

  it("validates by type and collection, and reports uses", async () => {
    const col = await createCollection({ name: "Oversized" });
    await expect(createOffer(offer({ pricePaise: null }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createOffer(offer({ type: "QTY_PERCENT", pricePaise: null, percent: null }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createOffer(offer({ collectionId: "missing" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createOffer(offer({ minQty: 1 }))).rejects.toBeInstanceOf(ValidationError);
    const o = await createOffer(offer({ collectionId: col.id }));
    const u = await createUser();
    await createOrderRow(u.id, { offerLabel: "Any 3 for ₹999", status: "PAID" });
    const [row] = await listOffers();
    expect(row).toMatchObject({ id: o.id, collectionName: "Oversized", uses: 1 });
    expect(describeOffer(row)).toBe("Any 3 for ₹999");
    expect(describeOffer({ type: "QTY_PERCENT", minQty: 3, pricePaise: null, percent: 10 })).toBe("10% off 3 or more");
    await deleteOffer(o.id);
    expect(await listOffers()).toEqual([]);
  });

  it("keeps offer names unique and locks the name once the offer has been used", async () => {
    const a = await createOffer(offer());
    const err = await createOffer(offer({ label: "any 3 FOR ₹999" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).details).toMatchObject({ label: ["Another offer already uses this name"] });
    const b = await createOffer(offer({ label: "Weekend deal" }));
    await expect(updateOffer(b.id, offer({ label: "ANY 3 for ₹999" }))).rejects.toBeInstanceOf(ValidationError);
    // Unused: rename is fine.
    expect((await updateOffer(a.id, offer({ label: "Any 3 for ₹949", pricePaise: 94900 }))).label).toBe("Any 3 for ₹949");
    const u = await createUser();
    await createOrderRow(u.id, { offerLabel: "Any 3 for ₹949", status: "DELIVERED" });
    const locked = await updateOffer(a.id, offer({ label: "Any 3 for ₹899" })).catch((e: unknown) => e);
    expect(locked).toBeInstanceOf(ConflictError);
    expect((locked as ConflictError).details).toMatchObject({ label: [expect.stringMatching(/name is locked/)] });
    // Other fields on a used offer can still change.
    expect((await updateOffer(a.id, offer({ label: "Any 3 for ₹949", pricePaise: 94900, active: false }))).active).toBe(false);
  });
});
