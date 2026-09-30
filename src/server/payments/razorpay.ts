import { PaymentError } from "@/server/errors";
import { verifyHmac } from "./hmac";
import type { PaymentProvider, ProviderOrder, ProviderRefund } from "./types";

const API = "https://api.razorpay.com/v1";
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  readonly publicKey: string;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {
    this.publicKey = keyId;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}${path}`, {
        method,
        headers: {
          authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      console.error("[razorpay] network", path, err);
      throw new PaymentError("Could not reach the payment provider. Please try again.");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[razorpay] ${path} → ${res.status} ${text.slice(0, 500)}`);
      throw new PaymentError();
    }
    return (await res.json()) as T;
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder> {
    const r = await this.post<{ id: string; amount: number }>("/orders", {
      amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes ?? {},
    });
    return { id: r.id, amountPaise: r.amount, currency: "INR" };
  }

  verifyPaymentSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean {
    return verifyHmac(this.keySecret, `${input.providerOrderId}|${input.paymentId}`, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return verifyHmac(this.webhookSecret, rawBody, signature);
  }

  async refund(paymentId: string, amountPaise: number): Promise<{ id: string }> {
    const r = await this.post<{ id: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise });
    return { id: r.id };
  }

  async fetchRefunds(paymentId: string): Promise<ProviderRefund[]> {
    const r = await this.request<{ items?: { id: string; amount: number; status: string }[] }>("GET", `/payments/${encodeURIComponent(paymentId)}/refunds`);
    return (r.items ?? []).map((x) => ({ id: x.id, amountPaise: x.amount, status: x.status }));
  }
}
