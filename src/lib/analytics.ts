export interface AnalyticsItem { id: string; name: string; pricePaise: number; quantity?: number; variant?: string }

export type AnalyticsEvent =
  | { name: "view_item"; item: AnalyticsItem }
  | { name: "add_to_cart"; item: AnalyticsItem }
  | { name: "begin_checkout"; valuePaise: number; items: AnalyticsItem[] }
  | { name: "purchase"; transactionId: string; valuePaise: number; shippingPaise?: number; items: AnalyticsItem[] };

const GA_ID = /^G-[A-Z0-9]{4,20}$/;
const PIXEL_ID = /^\d{5,20}$/;

/** Ids are inlined into <script> tags, so only strictly formatted values are accepted. */
export function analyticsIds(env: { ga?: string; pixel?: string }): { ga: string | null; pixel: string | null } {
  const ga = env.ga?.trim() ?? "";
  const pixel = env.pixel?.trim() ?? "";
  return { ga: GA_ID.test(ga) ? ga : null, pixel: PIXEL_ID.test(pixel) ? pixel : null };
}

const rupees = (paise: number) => Math.round(paise) / 100;
const qty = (i: AnalyticsItem) => i.quantity ?? 1;
const itemsOf = (e: AnalyticsEvent) => ("item" in e ? [e.item] : e.items);
const valueOf = (e: AnalyticsEvent) => ("item" in e ? e.item.pricePaise * qty(e.item) : e.valuePaise);
const gaItem = (i: AnalyticsItem) => ({ item_id: i.id, item_name: i.name, price: rupees(i.pricePaise), quantity: qty(i), ...(i.variant ? { item_variant: i.variant } : {}) });

export function toGa4(e: AnalyticsEvent): [string, Record<string, unknown>] {
  const base = { currency: "INR", value: rupees(valueOf(e)), items: itemsOf(e).map(gaItem) };
  if (e.name === "purchase") return [e.name, { transaction_id: e.transactionId, ...base, shipping: rupees(e.shippingPaise ?? 0) }];
  return [e.name, base];
}

const PIXEL_NAME = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase" } as const;

export function toMetaPixel(e: AnalyticsEvent): [string, Record<string, unknown>] {
  const items = itemsOf(e);
  const base = { currency: "INR", value: rupees(valueOf(e)), content_type: "product", content_ids: items.map((i) => i.id), contents: items.map((i) => ({ id: i.id, quantity: qty(i) })) };
  const extra = "item" in e ? { content_name: e.item.name } : { num_items: items.reduce((s, i) => s + qty(i), 0) };
  return [PIXEL_NAME[e.name], { ...base, ...extra }];
}

type AnalyticsWindow = Window & { gtag?: (...args: unknown[]) => void; fbq?: (...args: unknown[]) => void };

/** Sends to GA4 and/or Meta Pixel when configured; waits up to ~3 s for the afterInteractive scripts. */
export function track(e: AnalyticsEvent, attempt = 0): void {
  if (typeof window === "undefined") return;
  const ids = analyticsIds({ ga: process.env.NEXT_PUBLIC_GA_ID, pixel: process.env.NEXT_PUBLIC_META_PIXEL_ID });
  if (!ids.ga && !ids.pixel) return;
  const w = window as AnalyticsWindow;
  const ready = (!ids.ga || typeof w.gtag === "function") && (!ids.pixel || typeof w.fbq === "function");
  if (!ready && attempt < 10) {
    window.setTimeout(() => track(e, attempt + 1), 300);
    return;
  }
  try {
    if (ids.ga && w.gtag) w.gtag("event", ...toGa4(e));
    if (ids.pixel && w.fbq) w.fbq("track", ...toMetaPixel(e));
  } catch (err) {
    console.warn("[analytics] event failed", err);
  }
}
