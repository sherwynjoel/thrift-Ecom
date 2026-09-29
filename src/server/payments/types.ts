export type ProviderName = "razorpay" | "mock";

export interface ProviderOrder { id: string; amountPaise: number; currency: "INR" }

export interface PaymentProvider {
  readonly name: ProviderName;
  readonly publicKey: string | null;
  createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder>;
  verifyPaymentSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  refund(paymentId: string, amountPaise: number): Promise<{ id: string }>;
}
