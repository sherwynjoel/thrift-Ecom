import { BRAND } from "@/config/brand";
import type { CheckoutPayload } from "@/server/services/orders";

interface RazorpaySuccess { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
interface RazorpayInstance { open(): void }
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;
declare global {
  interface Window { Razorpay?: RazorpayCtor }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const LOAD_ERROR = "Could not open the payment window. Check your connection and try again.";
/** A captive portal or blocker can leave the request hanging with no error event; give up after this. */
export const RAZORPAY_LOAD_TIMEOUT_MS = 15_000;
let loading: Promise<void> | null = null;

export function loadRazorpay(timeoutMs: number = RAZORPAY_LOAD_TIMEOUT_MS): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    const fail = () => {
      window.clearTimeout(timer);
      s.remove();
      loading = null;
      reject(new Error(LOAD_ERROR));
    };
    const timer = window.setTimeout(fail, timeoutMs);
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return loading;
}

export interface PayNav { push(href: string): void; replace(href: string): void }

export function orderStatusUrl(number: string, payment?: "failed" | "dismissed" | "verifying"): string {
  return `/orders/${encodeURIComponent(number)}/success${payment ? `?payment=${payment}` : ""}`;
}

export async function startPayment(payload: CheckoutPayload, nav: PayNav): Promise<void> {
  if (payload.provider === "mock") {
    nav.push(`/checkout/mock-pay/${encodeURIComponent(payload.orderId)}`);
    return;
  }
  await loadRazorpay();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Could not open the payment window. Please try again.");
  new Razorpay({
    key: payload.keyId,
    amount: payload.amountPaise,
    currency: payload.currency,
    name: BRAND.name,
    description: `Order ${payload.number}`,
    order_id: payload.providerOrderId,
    prefill: payload.prefill,
    theme: { color: "#111111" },
    retry: { enabled: true },
    handler: async (resp: RazorpaySuccess) => {
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: payload.orderId, providerOrderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }),
        });
        nav.replace(orderStatusUrl(payload.number, res.ok ? undefined : "verifying"));
      } catch {
        nav.replace(orderStatusUrl(payload.number, "verifying"));
      }
    },
    modal: { ondismiss: () => nav.push(orderStatusUrl(payload.number, "dismissed")) },
  }).open();
}
