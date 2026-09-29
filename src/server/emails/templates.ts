import { BRAND } from "@/config/brand";
import { addressLines, formatPhone } from "@/lib/address-format";
import { escapeHtml as e } from "@/lib/escape-html";
import { formatPaise } from "@/lib/money";
import { isHttpUrl } from "@/lib/url";
import type { OrderView } from "@/server/services/order-records";

export interface RenderedEmail { subject: string; html: string; text: string }
export interface LowStockRow { productName: string; size: string; colorName: string; sku: string; stock: number }
export interface DailySummary { dateLabel: string; paidOrders: number; revenuePaise: number; toShip: number; needsAttention: number; lowStock: number }

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

function safeHttpUrl(u: string | null): string | null {
  return u && isHttpUrl(u) ? u : null;
}

function layout(heading: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:20px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;margin:0 0 16px">${e(BRAND.name)}</p>
<div style="background:#fff;border-radius:8px;padding:24px">
<h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">${e(heading)}</h1>
${body}
</div>
<p style="font-size:12px;color:#666;margin-top:16px">Questions? Reply to this email or write to ${e(BRAND.supportEmail)}.</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0 0"><a href="${e(href)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px">${e(label)}</a></p>`;
}

function itemsHtml(o: OrderView): string {
  const rows = o.items
    .map((i) => `<tr><td style="padding:6px 0">${e(i.productName)}<br><span style="color:#666;font-size:12px">${e(i.colorName)} / ${e(i.size)} × ${i.quantity}</span></td><td style="padding:6px 0;text-align:right;vertical-align:top">${e(formatPaise(i.lineTotalPaise))}</td></tr>`)
    .join("");
  const discount = o.discountPaise > 0 ? `<tr><td>Discount</td><td style="text-align:right">−${e(formatPaise(o.discountPaise))}</td></tr>` : "";
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
<tr><td style="padding-top:12px;border-top:1px solid #eee">Subtotal</td><td style="padding-top:12px;border-top:1px solid #eee;text-align:right">${e(formatPaise(o.subtotalPaise))}</td></tr>
${discount}<tr><td>Shipping</td><td style="text-align:right">${o.shippingPaise === 0 ? "Free" : e(formatPaise(o.shippingPaise))}</td></tr>
<tr><td style="font-weight:bold">Total (incl. GST)</td><td style="font-weight:bold;text-align:right">${e(formatPaise(o.totalPaise))}</td></tr></table>`;
}

function itemsText(o: OrderView): string {
  return [...o.items.map((i) => `- ${i.productName} (${i.colorName} / ${i.size}) x ${i.quantity}: ${formatPaise(i.lineTotalPaise)}`), `Total (incl. GST): ${formatPaise(o.totalPaise)}`].join("\n");
}

function addressHtml(o: OrderView): string {
  return [o.ship.name, ...addressLines(o.ship), `Phone: ${formatPhone(o.ship.phone)}`].map(e).join("<br>");
}

const orderLink = (o: OrderView) => `${siteUrl()}/account/orders/${encodeURIComponent(o.number)}`;

export function orderConfirmationEmail(o: OrderView): RenderedEmail {
  return {
    subject: oneLine(`Order ${o.number} confirmed`),
    html: layout(`Thanks, ${firstName(o.ship.name)}! Your order is confirmed.`,
      `<p>We have received your payment for order <strong>${e(o.number)}</strong> and will pack it soon.</p>${itemsHtml(o)}
<p style="margin:20px 0 4px;font-weight:bold">Delivering to</p><p style="margin:0">${addressHtml(o)}</p>${button(orderLink(o), "View your order")}`),
    text: `Order ${o.number} confirmed.\n\n${itemsText(o)}\n\nTrack it: ${orderLink(o)}`,
  };
}

export function adminNewOrderEmail(o: OrderView): RenderedEmail {
  const link = `${siteUrl()}/admin/orders/${encodeURIComponent(o.id)}`;
  const note = o.customerNote ? `<p><strong>Customer note:</strong> ${e(o.customerNote)}</p>` : "";
  return {
    subject: oneLine(`New order ${o.number} · ${formatPaise(o.totalPaise)}`),
    html: layout(`New paid order ${o.number}`, `${itemsHtml(o)}<p style="margin:20px 0 4px;font-weight:bold">Ship to</p><p style="margin:0">${addressHtml(o)}</p>${note}${button(link, "Open in admin")}`),
    text: `New paid order ${o.number}\n\n${itemsText(o)}\n\n${link}`,
  };
}

export function orderShippedEmail(o: OrderView): RenderedEmail {
  const url = safeHttpUrl(o.trackingUrl);
  const tracking = o.trackingNumber
    ? `<p>${e(o.carrier ?? "Courier")} tracking number: <strong>${e(o.trackingNumber)}</strong></p>${url ? button(url, "Track your parcel") : ""}`
    : "";
  return {
    subject: oneLine(`Order ${o.number} has shipped`),
    html: layout("Your order is on its way", `<p>Order <strong>${e(o.number)}</strong> has left our studio.</p>${tracking}${button(orderLink(o), "View your order")}`),
    text: `Order ${o.number} has shipped.${o.trackingNumber ? `\n${o.carrier ?? "Courier"} tracking: ${o.trackingNumber}` : ""}${url ? `\n${url}` : ""}\n${orderLink(o)}`,
  };
}

export function orderDeliveredEmail(o: OrderView): RenderedEmail {
  return {
    subject: oneLine(`Order ${o.number} was delivered`),
    html: layout(`Delivered. Enjoy, ${firstName(o.ship.name)}!`, `<p>Order <strong>${e(o.number)}</strong> has been delivered. Thank you for shopping with ${e(BRAND.name)}.</p>${button(orderLink(o), "View your order")}`),
    text: `Order ${o.number} was delivered. Thank you for shopping with ${BRAND.name}.`,
  };
}

export function orderCancelledEmail(o: OrderView): RenderedEmail {
  return {
    subject: oneLine(`Order ${o.number} was cancelled`),
    html: layout("Your order was cancelled", `<p>Order <strong>${e(o.number)}</strong> has been cancelled. If you paid for it, we will refund the full amount to your original payment method and email you when it is done.</p>`),
    text: `Order ${o.number} was cancelled. If you paid for it, we will refund you and email you when it is done.`,
  };
}

export function orderRefundedEmail(o: OrderView): RenderedEmail {
  return {
    subject: oneLine(`Refund for order ${o.number}`),
    html: layout("Your refund is on its way", `<p>We have refunded <strong>${e(formatPaise(o.totalPaise))}</strong> for order <strong>${e(o.number)}</strong> to your original payment method. Banks usually take 5–7 working days to show it.</p>`),
    text: `We have refunded ${formatPaise(o.totalPaise)} for order ${o.number}. Banks usually take 5-7 working days to show it.`,
  };
}

export function lowStockDigestEmail(rows: LowStockRow[], threshold: number): RenderedEmail {
  const table = rows.map((r) => `<tr><td style="padding:4px 0">${e(r.productName)}</td><td>${e(r.colorName)} / ${e(r.size)}</td><td>${e(r.sku)}</td><td style="text-align:right">${r.stock}</td></tr>`).join("");
  return {
    subject: oneLine(`Low stock: ${rows.length} ${rows.length === 1 ? "variant" : "variants"} at or below ${threshold}`),
    html: layout("Running low", `<table style="width:100%;font-size:14px;border-collapse:collapse"><tr style="color:#666;text-align:left"><th>Product</th><th>Variant</th><th>SKU</th><th style="text-align:right">Stock</th></tr>${table}</table>${button(`${siteUrl()}/admin/inventory?low=1`, "Open inventory")}`),
    text: rows.map((r) => `${r.productName} ${r.colorName}/${r.size} (${r.sku}): ${r.stock}`).join("\n"),
  };
}

export function dailySummaryEmail(s: DailySummary): RenderedEmail {
  const rows: [string, string][] = [
    ["Paid orders", String(s.paidOrders)], ["Revenue", formatPaise(s.revenuePaise)], ["To ship", String(s.toShip)],
    ["Needs attention", String(s.needsAttention)], ["Low-stock variants", String(s.lowStock)],
  ];
  return {
    subject: oneLine(`${BRAND.name} daily summary · ${s.dateLabel}`),
    html: layout(`Today, ${s.dateLabel}`, `<table style="width:100%;font-size:15px">${rows.map(([k, v]) => `<tr><td style="padding:4px 0">${e(k)}</td><td style="text-align:right;font-weight:bold">${e(v)}</td></tr>`).join("")}</table>${button(`${siteUrl()}/admin/orders`, "Open orders")}`),
    text: rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
  };
}

export function abandonedCartEmail(args: { name: string | null; items: { name: string; size: string; colorName: string }[] }): RenderedEmail {
  const list = args.items.map((i) => `<li>${e(i.name)} (${e(i.colorName)} / ${e(i.size)})</li>`).join("");
  return {
    subject: "You left something in your bag",
    html: layout(`Still thinking it over, ${firstName(args.name ?? "")}?`, `<p>Your bag is saved:</p><ul>${list}</ul><p>Sizes sell out fast. Pick up where you left off.</p>${button(`${siteUrl()}/cart`, "Back to your bag")}`),
    text: `Your bag is saved:\n${args.items.map((i) => `- ${i.name} (${i.colorName} / ${i.size})`).join("\n")}\n${siteUrl()}/cart`,
  };
}
