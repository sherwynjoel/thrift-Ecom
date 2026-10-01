import { z } from "zod";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ForbiddenError, NotFoundError, RateLimitedError, ValidationError, type StockIssue } from "@/server/errors";
import { getPaymentProvider } from "@/server/payments";
import { rateLimit } from "@/server/rate-limit";
import { listAddresses, type AddressView } from "@/server/services/addresses";
import type { CartRef } from "@/server/services/cart";
import {
  findOrderByProviderOrderId, loadCheckoutLines, markOrderPaid, recordPaymentFailure, reconcileCartStock, toPricingLines, unitPriceOf,
  type CheckoutLineRow, type MarkPaidOutcome,
} from "@/server/services/orders";
import { getLiveOffers, quote } from "@/server/services/promotions";
import { getCustomFees, getSettings } from "@/server/services/settings";
import { designFileUrl } from "@/server/services/designs";
import { priceCart, type PriceResult } from "@/lib/pricing";
import { variantImageUrl } from "@/lib/variant-image";
import { bagLineKey, customFeesOf, customPrintLabel, customUnitPricePaise, designSides, type CustomFees } from "@/lib/custom-pricing";

export interface CheckoutLineView {
  variantId: string; productName: string; productSlug: string; imageUrl: string | null; size: string; colorName: string;
  unitPricePaise: number; quantity: number; lineTotalPaise: number;
  /** Custom-print lines: the design and its label ("Custom print: front + back"); null for plain lines. */
  designId: string | null; customLabel: string | null;
}
export interface CheckoutView {
  lines: CheckoutLineView[]; addresses: AddressView[]; price: PriceResult; stockIssues: StockIssue[]; email: string; freeShippingThresholdPaise: number;
}
export interface CartPricingPreview {
  offerLabel: string | null; discountPaise: number; discountedSubtotalPaise: number; shippingPaise: number; totalPaise: number; freeShippingThresholdPaise: number;
}

function toLineView(l: CheckoutLineRow, fees: CustomFees): CheckoutLineView {
  const p = l.variant.product;
  const unit = unitPriceOf(l, fees);
  const preview = designFileUrl(l.design?.frontPreviewKey ?? l.design?.backPreviewKey ?? null);
  return {
    variantId: l.variantId, productName: p.name, productSlug: p.slug, imageUrl: preview ?? variantImageUrl(p.images, l.variant.colorName), size: l.variant.size,
    colorName: l.variant.colorName, unitPricePaise: unit, quantity: l.quantity, lineTotalPaise: unit * l.quantity,
    designId: l.designId, customLabel: l.design ? customPrintLabel(designSides(l.design)) : null,
  };
}

export async function getCheckoutView(userId: string, couponCode?: string | null): Promise<CheckoutView> {
  const [loaded, addresses, user, settings] = await Promise.all([
    loadCheckoutLines(userId), listAddresses(userId), db.user.findUnique({ where: { id: userId }, select: { email: true } }), getSettings(),
  ]);
  if (!user) throw new NotFoundError("User");
  const fees = customFeesOf(settings);
  const { rows, issues } = await reconcileCartStock(loaded, userId);
  const price = await quote({ lines: toPricingLines(rows, fees), couponCode, userId });
  return {
    lines: rows.map((l) => toLineView(l, fees)), addresses, price, stockIssues: issues, email: user.email,
    freeShippingThresholdPaise: settings.freeShippingThresholdPaise,
  };
}

/** Coupon checks are an oracle for which codes exist; cap them per user (UI action and API alike). */
export const COUPON_QUOTE_LIMIT = 20;
export const COUPON_QUOTE_WINDOW_MS = 10 * 60_000;

export function limitCouponQuotes(userId: string): void {
  const rl = rateLimit(`coupon-quote:${userId}`, COUPON_QUOTE_LIMIT, COUPON_QUOTE_WINDOW_MS);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
}

/**
 * React key for the checkout form: changes only when the server-side bag itself changes (an item's
 * price, quantity or presence) — never for the price/coupon summary alone. A `router.refresh()` after
 * a failed Pay remounts the form when the bag genuinely changed (stock moved, an item's price
 * changed), but a coupon-only price change (the code just hit its usage limit) is already corrected
 * client-side by `pay()`'s own fixup (clear the code, re-quote); keying on price too would remount the
 * form for that case and discard the shopper's chosen (possibly non-default) address and any typed
 * note — a wrong-address risk, not just a lost draft (see N1).
 */
export function checkoutFormKey(view: Pick<CheckoutView, "lines">): string {
  return view.lines.map((l) => `${bagLineKey(l.variantId, l.designId)}:${l.quantity}:${l.unitPricePaise}`).join(",");
}

export async function quoteForUser(userId: string, couponCode: string | null): Promise<PriceResult> {
  const [lines, fees] = await Promise.all([loadCheckoutLines(userId), getCustomFees()]);
  return quote({ lines: toPricingLines(lines, fees), couponCode, userId });
}

export async function previewCartPricing(ref: CartRef): Promise<CartPricingPreview> {
  const items = await db.cartItem.findMany({
    where: { cart: "userId" in ref ? { userId: ref.userId } : { guestToken: ref.guestToken } },
    include: {
      design: { select: { frontPrintKey: true, backPrintKey: true } },
      variant: { include: { product: { select: { basePricePaise: true, collections: { select: { collectionId: true } } } } } },
    },
  });
  const [settings, offers] = await Promise.all([getSettings(), items.length ? getLiveOffers() : Promise.resolve([])]);
  const fees = customFeesOf(settings);
  const lines = items.map((i) => ({
    unitPricePaise: customUnitPricePaise(i.variant.pricePaise ?? i.variant.product.basePricePaise, i.design ? designSides(i.design) : null, fees),
    quantity: i.quantity,
    collectionIds: i.variant.product.collections.map((c) => c.collectionId),
    custom: i.designId !== null,
  }));
  const r = priceCart(lines, { offers, coupon: null, settings, now: new Date() });
  return {
    offerLabel: r.applied === "offer" && r.offer ? r.offer.label : null,
    discountPaise: r.discountPaise, discountedSubtotalPaise: r.subtotalPaise - r.discountPaise,
    shippingPaise: r.shippingPaise, totalPaise: r.totalPaise, freeShippingThresholdPaise: settings.freeShippingThresholdPaise,
  };
}

export const verifyPaymentSchema = z.object({
  orderId: z.string().min(1).max(64),
  providerOrderId: z.string().min(1).max(100),
  paymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(200),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export async function getOwnedOrderRef(userId: string, orderId: string) {
  const o = await db.order.findFirst({
    where: { id: orderId, userId },
    select: { id: true, number: true, status: true, totalPaise: true, providerOrderId: true, paymentProvider: true },
  });
  if (!o) throw new NotFoundError("Order");
  return o;
}

export async function confirmClientPayment(userId: string, input: unknown): Promise<{ outcome: MarkPaidOutcome; number: string }> {
  const parsed = verifyPaymentSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodFieldErrors(parsed.error));
  const { orderId, providerOrderId, paymentId, signature } = parsed.data;
  const order = await getOwnedOrderRef(userId, orderId);
  if (order.providerOrderId !== providerOrderId) throw new ValidationError({ providerOrderId: ["This payment does not belong to this order"] });
  if (!getPaymentProvider().verifyPaymentSignature({ providerOrderId, paymentId, signature })) {
    await recordPaymentFailure(order.id, `Rejected a payment confirmation with an invalid signature (${paymentId})`, paymentId);
    throw new ForbiddenError("We could not verify this payment. If money was debited, it will be confirmed automatically within a few minutes.");
  }
  return markOrderPaid(order.id, paymentId, "client");
}

const entity = z.object({
  id: z.string(),
  order_id: z.string().nullish(),
  amount: z.number().int().optional(),
  amount_paid: z.number().int().optional(),
  error_description: z.string().nullish(),
}).passthrough();
const webhookSchema = z.object({
  event: z.string(),
  payload: z.object({ payment: z.object({ entity }).optional(), order: z.object({ entity }).optional() }).passthrough().optional(),
}).passthrough();

export type WebhookResult = { status: 200 | 400; handled: string };

export async function handleRazorpayWebhook(rawBody: string, signature: string | null): Promise<WebhookResult> {
  if (!signature || !getPaymentProvider().verifyWebhookSignature(rawBody, signature)) return { status: 400, handled: "bad-signature" };
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, handled: "bad-json" };
  }
  const parsed = webhookSchema.safeParse(json);
  if (!parsed.success) return { status: 200, handled: "ignored" };
  const { event, payload } = parsed.data;
  const payment = payload?.payment?.entity;
  const rzOrder = payload?.order?.entity;
  const providerOrderId = payment?.order_id ?? rzOrder?.id ?? null;
  if (!providerOrderId) return { status: 200, handled: "ignored" };
  const order = await findOrderByProviderOrderId(providerOrderId);
  if (!order) return { status: 200, handled: "unknown-order" };

  if (event === "payment.captured" || event === "order.paid") {
    if (!payment?.id) return { status: 200, handled: "ignored" };
    // A missing amount is treated as a mismatch (null), never as "matches".
    const amount = (event === "order.paid" ? (rzOrder?.amount_paid ?? payment.amount) : payment.amount) ?? null;
    const r = await markOrderPaid(order.id, payment.id, "webhook", { amountPaise: amount });
    return { status: 200, handled: r.outcome };
  }
  if (event === "payment.failed") {
    const paymentId = payment?.id ?? null;
    const reason = `${paymentId ? `Payment ${paymentId}` : "Payment"} failed${payment?.error_description ? `: ${payment.error_description}` : ""}`;
    const recorded = await recordPaymentFailure(order.id, reason, paymentId);
    return { status: 200, handled: recorded ? "payment-failed" : "ignored" };
  }
  return { status: 200, handled: "ignored" };
}
