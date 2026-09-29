import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { signApiToken } from "@/server/api-token";
import { MOCK_SECRET, MockProvider } from "@/server/payments/mock";
import { hmacSha256Hex } from "@/server/payments/hmac";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { POST as verify } from "@/app/api/payments/verify/route";
import { GET as checkoutGet, POST as checkoutPost } from "@/app/api/v1/checkout/route";

const BASE = "http://localhost:3000";
const params = { params: Promise.resolve({}) };

describe("payment routes", () => {
  beforeEach(resetDb);

  it("runs the API checkout, client verification and webhook", async () => {
    const user = await createUser();
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    const address = await createAddress(user.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await addItem({ userId: user.id }, p.variants[0].id, 1);
    const headers = { authorization: `Bearer ${await signApiToken({ id: user.id, role: "CUSTOMER" })}`, "content-type": "application/json" };

    const view = await (await checkoutGet(new NextRequest(`${BASE}/api/v1/checkout`, { headers }), params)).json();
    expect(view.data.price.totalPaise).toBe(67800);

    const placed = await checkoutPost(new NextRequest(`${BASE}/api/v1/checkout`, { method: "POST", headers, body: JSON.stringify({ addressId: address.id }) }), params);
    expect(placed.status).toBe(201);
    const payload = (await placed.json()).data;

    const badVerify = await verify(new NextRequest(`${BASE}/api/payments/verify`, { method: "POST", headers, body: JSON.stringify({ orderId: payload.orderId, providerOrderId: payload.providerOrderId, paymentId: "p1", signature: "bad" }) }), params);
    expect(badVerify.status).toBe(403);

    const sig = new MockProvider().sign(payload.providerOrderId, "p1");
    const good = await verify(new NextRequest(`${BASE}/api/payments/verify`, { method: "POST", headers, body: JSON.stringify({ orderId: payload.orderId, providerOrderId: payload.providerOrderId, paymentId: "p1", signature: sig }) }), params);
    expect((await good.json()).data).toEqual({ outcome: "paid", number: payload.number });

    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "p1", order_id: payload.providerOrderId, amount: payload.amountPaise } } } });
    const dup = await webhook(new Request(`${BASE}/api/webhooks/razorpay`, { method: "POST", body: raw, headers: { "x-razorpay-signature": hmacSha256Hex(MOCK_SECRET, raw) } }));
    expect(dup.status).toBe(200);
    expect((await dup.json()).handled).toBe("already_paid");
    const forged = await webhook(new Request(`${BASE}/api/webhooks/razorpay`, { method: "POST", body: raw, headers: { "x-razorpay-signature": "0".repeat(64) } }));
    expect(forged.status).toBe(400);
  });
});
