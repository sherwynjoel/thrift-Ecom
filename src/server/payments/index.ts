import { MockProvider } from "./mock";
import { RazorpayProvider } from "./razorpay";
import type { PaymentProvider, ProviderName } from "./types";

export type { PaymentProvider, ProviderName, ProviderOrder, ProviderRefund } from "./types";

let cached: PaymentProvider | undefined;

export function paymentProviderName(): ProviderName {
  const v = (process.env.PAYMENT_PROVIDER || "mock").trim().toLowerCase();
  if (v !== "razorpay" && v !== "mock") throw new Error(`Unknown PAYMENT_PROVIDER "${v}" (use razorpay or mock)`);
  return v;
}

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const name = paymentProviderName();
  if (name === "mock") {
    if (process.env.NODE_ENV === "production") throw new Error("PAYMENT_PROVIDER=mock is not allowed in production");
    cached = new MockProvider();
    return cached;
  }
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const webhook = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!keyId || !secret || !webhook) {
    throw new Error("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required when PAYMENT_PROVIDER=razorpay");
  }
  cached = new RazorpayProvider(keyId, secret, webhook);
  return cached;
}

export function isMockPayments(): boolean {
  try {
    return paymentProviderName() === "mock" && process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

export function resetPaymentProviderCache(): void {
  cached = undefined;
}
