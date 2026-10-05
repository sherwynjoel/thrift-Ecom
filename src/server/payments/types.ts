export type ProviderName = "razorpay" | "mock" | "disabled";

export interface ProviderOrder { id: string; amountPaise: number; currency: "INR" }
/** A refund already recorded by the provider. status: "pending" | "processed" | "failed" (Razorpay's values). */
export interface ProviderRefund { id: string; amountPaise: number; status: string }
/** A payment attempt on a provider order. status: "created" | "authorized" | "captured" | "refunded" | "failed" (Razorpay's values). */
export interface ProviderPayment { id: string; amountPaise: number; status: string }

export interface PaymentProvider {
  readonly name: ProviderName;
  readonly publicKey: string | null;
  createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder>;
  verifyPaymentSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  refund(paymentId: string, amountPaise: number): Promise<{ id: string }>;
  /** Refunds the provider already holds for a payment, so a retry after a timed-out refund never refunds twice. */
  fetchRefunds(paymentId: string): Promise<ProviderRefund[]>;
  /** Payments made against a provider order — the reconcile job uses it to catch payments whose webhook never arrived. */
  fetchOrderPayments(providerOrderId: string): Promise<ProviderPayment[]>;
}
