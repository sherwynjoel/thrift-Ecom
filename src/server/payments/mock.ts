import { randomBytes } from "node:crypto";
import { hmacSha256Hex, verifyHmac } from "./hmac";
import type { PaymentProvider, ProviderOrder, ProviderRefund } from "./types";

/** Not a secret: the mock provider only runs outside production. */
export const MOCK_SECRET = "mock_payment_secret";

export function newMockPaymentId(): string {
  return `mock_pay_${randomBytes(9).toString("hex")}`;
}

export class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly publicKey = null;

  async createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder> {
    return { id: `mock_order_${randomBytes(9).toString("hex")}`, amountPaise: input.amountPaise, currency: "INR" };
  }

  sign(providerOrderId: string, paymentId: string): string {
    return hmacSha256Hex(MOCK_SECRET, `${providerOrderId}|${paymentId}`);
  }

  verifyPaymentSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean {
    return verifyHmac(MOCK_SECRET, `${input.providerOrderId}|${input.paymentId}`, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return verifyHmac(MOCK_SECRET, rawBody, signature);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refund(_paymentId: string, _amountPaise: number): Promise<{ id: string }> {
    return { id: `mock_refund_${randomBytes(6).toString("hex")}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchRefunds(_paymentId: string): Promise<ProviderRefund[]> {
    return [];
  }
}
