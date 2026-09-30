import { afterEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex, safeEqual, verifyHmac } from "@/server/payments/hmac";
import { RazorpayProvider, type FetchLike } from "@/server/payments/razorpay";
import { MOCK_SECRET, MockProvider, newMockPaymentId } from "@/server/payments/mock";
import { getPaymentProvider, isMockPayments, resetPaymentProviderCache } from "@/server/payments";
import { PaymentError } from "@/server/errors";

// HMAC-SHA256("test_key_secret", "order_TEST123|pay_TEST456")
const ORDER_SIG = "4e29c3db4c2941c4f1b1845d71c004542e3b6439806ce9aeef5e5d9d291c48fe";
const WEBHOOK_BODY = '{"event":"payment.captured"}';
// HMAC-SHA256("whsec_test", WEBHOOK_BODY)
const WEBHOOK_SIG = "4f463a57dd128675850163391f0311888616d57bccca75c774c9cdb28134f851";

function fakeFetch(status: number, body: unknown) {
  return vi.fn<FetchLike>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
const provider = (f: FetchLike) => new RazorpayProvider("rzp_test_key", "test_key_secret", "whsec_test", f);

describe("hmac helpers", () => {
  it("matches known HMAC-SHA256 hex fixtures", () => {
    expect(hmacSha256Hex("test_key_secret", "order_TEST123|pay_TEST456")).toBe(ORDER_SIG);
    expect(hmacSha256Hex("whsec_test", WEBHOOK_BODY)).toBe(WEBHOOK_SIG);
  });

  it("compares safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(verifyHmac("whsec_test", WEBHOOK_BODY, ` ${WEBHOOK_SIG.toUpperCase()} `)).toBe(true);
    expect(verifyHmac("whsec_test", WEBHOOK_BODY, "")).toBe(false);
    expect(verifyHmac("whsec_test", WEBHOOK_BODY, null)).toBe(false);
  });
});

describe("RazorpayProvider", () => {
  it("creates an order with basic auth and a paise amount", async () => {
    const f = fakeFetch(200, { id: "order_ABC", amount: 67800, currency: "INR" });
    const p = provider(f);
    await expect(p.createOrder({ amountPaise: 67800, receipt: "ORD-1001", notes: { orderId: "o1" } })).resolves.toEqual({ id: "order_ABC", amountPaise: 67800, currency: "INR" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("rzp_test_key:test_key_secret").toString("base64")}`);
    expect(JSON.parse(init.body as string)).toEqual({ amount: 67800, currency: "INR", receipt: "ORD-1001", notes: { orderId: "o1" } });
    expect(p.publicKey).toBe("rzp_test_key");
    expect(p.name).toBe("razorpay");
  });

  it("maps API errors and network failures to PaymentError", async () => {
    await expect(provider(fakeFetch(400, { error: { description: "bad" } })).createOrder({ amountPaise: 100, receipt: "r" })).rejects.toBeInstanceOf(PaymentError);
    const down = vi.fn<FetchLike>(async () => { throw new TypeError("fetch failed"); });
    await expect(provider(down).createOrder({ amountPaise: 100, receipt: "r" })).rejects.toBeInstanceOf(PaymentError);
  });

  it("verifies payment and webhook signatures", () => {
    const p = provider(fakeFetch(200, {}));
    expect(p.verifyPaymentSignature({ providerOrderId: "order_TEST123", paymentId: "pay_TEST456", signature: ORDER_SIG })).toBe(true);
    expect(p.verifyPaymentSignature({ providerOrderId: "order_TEST123", paymentId: "pay_OTHER", signature: ORDER_SIG })).toBe(false);
    expect(p.verifyWebhookSignature(WEBHOOK_BODY, WEBHOOK_SIG)).toBe(true);
    expect(p.verifyWebhookSignature(`${WEBHOOK_BODY} `, WEBHOOK_SIG)).toBe(false);
  });

  it("refunds a payment by id", async () => {
    const f = fakeFetch(200, { id: "rfnd_1" });
    await expect(provider(f).refund("pay_1", 5000)).resolves.toEqual({ id: "rfnd_1" });
    expect(f.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/payments/pay_1/refund");
    expect(JSON.parse(f.mock.calls[0][1].body as string)).toEqual({ amount: 5000 });
  });

  it("lists the refunds a payment already has", async () => {
    const f = fakeFetch(200, { entity: "collection", count: 1, items: [{ id: "rfnd_9", amount: 5000, status: "processed" }] });
    await expect(provider(f).fetchRefunds("pay_1")).resolves.toEqual([{ id: "rfnd_9", amountPaise: 5000, status: "processed" }]);
    expect(f.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/payments/pay_1/refunds");
    expect(f.mock.calls[0][1].method).toBe("GET");
    expect(f.mock.calls[0][1].body).toBeUndefined();
    await expect(provider(fakeFetch(500, {})).fetchRefunds("pay_1")).rejects.toBeInstanceOf(PaymentError);
  });
});

describe("MockProvider", () => {
  it("creates orders, signs and verifies like Razorpay", async () => {
    const m = new MockProvider();
    const o = await m.createOrder({ amountPaise: 67800, receipt: "ORD-1001" });
    expect(o).toMatchObject({ amountPaise: 67800, currency: "INR" });
    expect(o.id).toMatch(/^mock_order_/);
    const pay = newMockPaymentId();
    expect(pay).toMatch(/^mock_pay_/);
    expect(m.verifyPaymentSignature({ providerOrderId: o.id, paymentId: pay, signature: m.sign(o.id, pay) })).toBe(true);
    expect(m.verifyPaymentSignature({ providerOrderId: o.id, paymentId: pay, signature: m.sign(o.id, "x") })).toBe(false);
    expect(m.verifyWebhookSignature(WEBHOOK_BODY, hmacSha256Hex(MOCK_SECRET, WEBHOOK_BODY))).toBe(true);
    expect((await m.refund(pay, 100)).id).toMatch(/^mock_refund_/);
    await expect(m.fetchRefunds(pay)).resolves.toEqual([]);
    expect(m.publicKey).toBeNull();
  });
});

describe("getPaymentProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetPaymentProviderCache();
  });

  it("defaults to mock outside production", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "");
    expect(getPaymentProvider()).toBeInstanceOf(MockProvider);
    expect(isMockPayments()).toBe(true);
  });

  it("refuses mock in production", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getPaymentProvider()).toThrow(/not allowed in production/);
    expect(isMockPayments()).toBe(false);
  });

  it("builds Razorpay from env and requires every key", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "razorpay");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    expect(() => getPaymentProvider()).toThrow(/RAZORPAY_WEBHOOK_SECRET/);
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whsec");
    const p = getPaymentProvider();
    expect(p).toBeInstanceOf(RazorpayProvider);
    expect(p.publicKey).toBe("rzp_test_key");
    expect(getPaymentProvider()).toBe(p);
  });

  it("rejects unknown provider names", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "paypal");
    expect(() => getPaymentProvider()).toThrow(/Unknown PAYMENT_PROVIDER/);
  });
});
