import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => authMock() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { placeOrder } from "@/server/services/orders";
import { COUPON_QUOTE_LIMIT } from "@/server/services/checkout";
import { COUPON_UNAVAILABLE } from "@/lib/pricing";
import { placeOrderAction, quoteCheckoutAction } from "@/app/(storefront)/checkout/actions";

const ADDRESS = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };

async function shopper(variantId: string) {
  const user = await createUser();
  const address = await createAddress(user.id, ADDRESS);
  await addItem({ userId: user.id }, variantId, 1);
  return { user, address };
}

describe("checkout actions", () => {
  beforeEach(async () => {
    await resetDb();
    authMock.mockReset();
  });

  it("refuses a coupon that ran out between quote and Pay, and the no-coupon re-quote restores full price (review I1)", async () => {
    const p = await createProduct({ basePricePaise: 99900, variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    await db.coupon.create({ data: { code: "ONCE", type: "PERCENT", value: 10, usageLimit: 1 } });
    const a = await shopper(p.variants[0].id);
    const b = await shopper(p.variants[0].id);

    authMock.mockResolvedValue({ user: { id: a.user.id, role: "CUSTOMER" } });
    const quoted = await quoteCheckoutAction("once");
    expect(quoted).toMatchObject({ ok: true, data: { applied: "coupon", discountPaise: 9990 } });

    // Someone else claims the single use before `a` taps Pay.
    await placeOrder(b.user.id, { addressId: b.address.id, couponCode: "ONCE" });

    const paid = await placeOrderAction({ addressId: a.address.id, couponCode: "ONCE" });
    expect(paid).toMatchObject({ ok: false, fieldErrors: { couponCode: [COUPON_UNAVAILABLE] } });
    expect(await db.order.count({ where: { userId: a.user.id } })).toBe(0);

    const fresh = await quoteCheckoutAction(null);
    expect(fresh).toMatchObject({ ok: true, data: { applied: null, discountPaise: 0, totalPaise: 99900 } });
  });

  it("rate-limits coupon checks per user, but not no-coupon re-quotes (review I2)", async () => {
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    const { user } = await shopper(p.variants[0].id);
    authMock.mockResolvedValue({ user: { id: user.id, role: "CUSTOMER" } });

    for (let i = 0; i < COUPON_QUOTE_LIMIT; i++) {
      const r = await quoteCheckoutAction(`GUESS${i}`);
      expect(r).toMatchObject({ ok: true, data: { couponError: COUPON_UNAVAILABLE } });
    }
    expect(await quoteCheckoutAction("GUESS-X")).toMatchObject({ ok: false, message: expect.stringMatching(/too many/i) });
    expect(await quoteCheckoutAction(null)).toMatchObject({ ok: true });
    expect(await quoteCheckoutAction("  ")).toMatchObject({ ok: true });
  });
});
