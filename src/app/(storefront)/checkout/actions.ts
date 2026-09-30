"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { actionError, type ActionResult } from "@/server/action-result";
import { RateLimitedError } from "@/server/errors";
import { getPaymentProvider, isMockPayments } from "@/server/payments";
import { MockProvider, newMockPaymentId } from "@/server/payments/mock";
import { rateLimit } from "@/server/rate-limit";
import { requireUserId } from "@/server/session-user";
import { confirmClientPayment, getOwnedOrderRef, limitCouponQuotes, quoteForUser } from "@/server/services/checkout";
import { getRetryPayload, placeOrder, recordPaymentFailure, type CheckoutPayload, type PlaceOrderInput } from "@/server/services/orders";
import type { PriceResult } from "@/lib/pricing";

export async function quoteCheckoutAction(couponCode: string | null): Promise<ActionResult<PriceResult>> {
  try {
    const userId = await requireUserId();
    const code = couponCode?.trim() || null;
    if (code) limitCouponQuotes(userId);
    return { ok: true, data: await quoteForUser(userId, code) };
  } catch (err) {
    return actionError(err);
  }
}

export async function placeOrderAction(input: PlaceOrderInput): Promise<ActionResult<CheckoutPayload>> {
  try {
    const userId = await requireUserId();
    const rl = rateLimit(`place-order:${userId}`, 10, 60_000);
    if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
    const payload = await placeOrder(userId, input);
    revalidatePath("/", "layout");
    return { ok: true, data: payload };
  } catch (err) {
    return actionError(err);
  }
}

export async function retryPaymentAction(number: string): Promise<ActionResult<CheckoutPayload>> {
  try {
    return { ok: true, data: await getRetryPayload(await requireUserId(), number) };
  } catch (err) {
    return actionError(err);
  }
}

/** Dev/e2e only: simulates the Razorpay popup. Refused in production and for the razorpay provider. */
export async function mockPayAction(orderId: string, outcome: "succeed" | "fail"): Promise<void> {
  if (!isMockPayments()) notFound();
  const provider = getPaymentProvider();
  if (!(provider instanceof MockProvider)) notFound();
  const userId = await requireUserId();
  const order = await getOwnedOrderRef(userId, orderId);
  if (outcome === "succeed" && order.providerOrderId) {
    const paymentId = newMockPaymentId();
    const r = await confirmClientPayment(userId, { orderId, providerOrderId: order.providerOrderId, paymentId, signature: provider.sign(order.providerOrderId, paymentId) });
    revalidatePath("/", "layout");
    redirect(`/orders/${encodeURIComponent(r.number)}/success`);
  }
  await recordPaymentFailure(order.id, "Test payment failed (mock provider)");
  redirect(`/orders/${encodeURIComponent(order.number)}/success?payment=failed`);
}
