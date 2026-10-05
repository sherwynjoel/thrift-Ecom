import { PaymentError } from "@/server/errors";
import type { PaymentProvider, ProviderOrder, ProviderPayment, ProviderRefund } from "./types";

export const PAYMENTS_DISABLED_MESSAGE = "Online payment opens very soon — your bag is saved, check back shortly.";

/**
 * PAYMENT_PROVIDER=disabled: the store runs before Razorpay keys exist. Checkout never starts a payment
 * (no order can be paid, and no fake "success" path exists, unlike the mock provider), so it is safe in production.
 */
export class DisabledProvider implements PaymentProvider {
  readonly name = "disabled" as const;
  readonly publicKey = null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createOrder(_input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder> {
    throw new PaymentError(PAYMENTS_DISABLED_MESSAGE);
  }

  verifyPaymentSignature(): boolean {
    return false;
  }

  verifyWebhookSignature(): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refund(_paymentId: string, _amountPaise: number): Promise<{ id: string }> {
    throw new PaymentError("Payments are not set up yet.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchRefunds(_paymentId: string): Promise<ProviderRefund[]> {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchOrderPayments(_providerOrderId: string): Promise<ProviderPayment[]> {
    return [];
  }
}
