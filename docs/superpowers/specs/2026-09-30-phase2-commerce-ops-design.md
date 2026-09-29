# Phase 2 — Commerce and Operations Design

Status: approved direction (owner: "everything done by morning; reduce admin workload; automate whatever can be automated"). Builds on Phase 1 spec `2026-09-29-phase1-storefront-foundation-design.md`; all its conventions bind (money in integer paise, services are the only importers of `@/server/db`, Server Actions + API routes for mobile, shadcn Base UI composition with `render`, rate limiting, `requireAdmin()` re-reading role, mobile-first responsive UI).

## 1. Scope

Checkout with saved addresses, Razorpay prepaid payment (plus a `mock` provider for dev/e2e), orders with price snapshots, stock reservation, order emails, customer order history with invoice, admin order management built for speed (print label / packing slip / invoice, bulk print, copy address, WhatsApp/call links, quick status actions, tracking, notes, timeline, CSV export), coupons, automatic bundle offers, customers admin, inventory quick edit, richer dashboard, store settings in DB, automations (unpaid-order expiry, low-stock alerts, daily summary, abandoned-cart reminder).

Out of scope: COD, Shiprocket API, phone OTP, GST filing.

## 2. Decisions

| Topic | Decision |
|---|---|
| Who can check out | Signed-in users only. `/checkout` redirects to `/login?next=/checkout`. Guest cart already merges on login. |
| Payment | Razorpay Orders API via `fetch` (no SDK) + Checkout.js on the client. `PAYMENT_PROVIDER=razorpay|mock`. `mock` is refused when `NODE_ENV=production`. |
| Stock | Reserved (conditional `stock >= qty` decrement) inside the transaction that creates the order. Released on expiry, payment failure after expiry, or cancel. |
| Unpaid expiry | `PENDING_PAYMENT` orders past `expiresAt` (30 min) become `EXPIRED` and release stock. Triggered by `/api/cron/[job]` (secret) and opportunistically when a user places an order. |
| Source of truth for paid | Signature-verified client callback OR the `payment.captured` / `order.paid` webhook — whichever arrives first; both idempotent. Amount must match. |
| Discounts | The best automatic offer and the entered coupon are both evaluated; the customer gets the larger of the two, never both. UI says which was applied. |
| Shipping | Flat `shippingFeePaise` (settings, default 7900) waived when the discounted subtotal ≥ `freeShippingThresholdPaise` (settings, default from BRAND). |
| Tax | Prices are GST-inclusive. Invoice shows inclusive breakup per line: `gstRateLowPct` (5) when unit price ≤ `gstThresholdPaise` (250000), else `gstRateHighPct` (18); HSN 6109. Seller state = ship state → CGST+SGST halves, else IGST. |
| Order number | `ORD-` + sequence starting 1001 (Postgres sequence via migration, read with `nextval`). |
| Emails | Existing email adapter (console|ses); add `smtp` driver (nodemailer; `SMTP_URL`). All dynamic text escaped with the existing helper. Failures logged and recorded as events, never block the flow. |

## 3. Data model (Prisma)

- `Address`: id, userId (cascade), fullName, phone (10 digits, starts 6–9), line1, line2?, landmark?, city, state (fixed list of Indian states/UTs in `src/lib/india-states.ts`), pincode (6 digits, not starting 0), isDefault, timestamps. Max 10 per user; exactly one default when any exist.
- `Order`: id, number (unique), userId, email, status enum `PENDING_PAYMENT | PAID | PROCESSING | SHIPPED | DELIVERED | CANCELLED | EXPIRED | REFUNDED`, needsAttention bool, ship snapshot (shipName, shipPhone, shipLine1, shipLine2?, shipLandmark?, shipCity, shipState, shipPincode), subtotalPaise, discountPaise, shippingPaise, totalPaise, couponCode?, offerLabel?, paymentProvider, providerOrderId? (unique), providerPaymentId?, paidAt?, processingAt?, shippedAt?, deliveredAt?, cancelledAt?, carrier?, trackingNumber?, trackingUrl?, adminNote?, customerNote? (≤300), expiresAt, timestamps. Indexes (status, createdAt), (userId, createdAt).
- `OrderItem`: id, orderId (cascade), productId? & variantId? (SetNull), productName, productSlug, size, colorName, imageUrl?, sku, unitPricePaise, quantity, lineTotalPaise.
- `OrderEvent`: id, orderId (cascade), type string (CREATED, PAID, PAYMENT_FAILED, STATUS_CHANGED, NOTE, EMAIL_SENT, EMAIL_FAILED, EXPIRED, TRACKING_UPDATED, REFUNDED, ATTENTION), message, actorId?, createdAt.
- `Coupon`: id, code (unique, stored uppercase), type `PERCENT | FLAT`, value (percent 1–90, or paise), minSubtotalPaise (default 0), maxDiscountPaise?, startsAt?, endsAt?, usageLimit?, perUserLimit?, active, timestamps. Usage counts orders with that code in PAID, PROCESSING, SHIPPED, DELIVERED.
- `Offer`: id, label, type `BUNDLE_PRICE` (every complete group of `minQty` eligible units costs `pricePaise`; groups repeat; units are grouped cheapest-first so the discount is conservative; a group never costs more than its units' normal price) | `QTY_PERCENT` (≥ `minQty` eligible units → `percent` off eligible units), collectionId? (null = all products), active, startsAt?, endsAt?, timestamps.
- `StoreSetting` singleton (id = 1, created lazily with defaults): shippingFeePaise 7900, freeShippingThresholdPaise 99900, lowStockThreshold 5, adminNotifyEmail?, sellerName, sellerAddress, sellerState, gstin?, gstRateLowPct 5, gstRateHighPct 18, gstThresholdPaise 250000, whatsappNumber?, dailySummaryEnabled true, abandonedCartEnabled true.
- `Cart` gains `remindedAt?`; `ProductVariant` gains `lowStockAlertedAt?`.

## 4. Pricing engine

Pure `priceCart(lines, { offers, coupon, settings, now, couponUsesTotal, couponUsesByUser })` in `src/lib/pricing.ts` → `{ subtotalPaise, offer: {label, discountPaise}|null, coupon: {code, discountPaise}|null, couponError?, applied: "offer"|"coupon"|null, discountPaise, shippingPaise, totalPaise }`. Lines carry unitPricePaise, quantity, collectionIds. Used by the cart drawer preview, checkout page and order creation (server always recomputes). Unit tested exhaustively: thresholds, caps, date windows, inactive, usage limits, bundle groups repeat and apply to the cheapest eligible units, percent rounding down to whole paise, total never negative, free shipping boundary equality.

## 5. Storefront

- `/checkout` (mobile-first, single page, sticky pay bar on mobile): address picker + new-address form, summary with thumbnails, coupon field (apply/remove, inline error), offer notice, price breakup, customer note, "Pay ₹X" button. Server re-validates stock; short lines → inline message, cart quantities adjusted.
- Pay flow: server action `placeOrder` → Order (PENDING_PAYMENT) + stock reservation + provider order in one flow (provider call failure → order cancelled and stock released) → client opens Razorpay Checkout (prefill name/email/phone) → POST `/api/payments/verify` → `/orders/[number]/success`. Dismiss → order stays pending with "Retry payment" until expiry.
- Mock provider: `/checkout/mock-pay/[orderId]` with Succeed / Fail buttons (only when PAYMENT_PROVIDER=mock and not production).
- Cart items for ordered variants are removed when the order becomes PAID.
- `/account/orders` list and `/account/orders/[number]` detail: status stepper, items, address, tracking link, invoice (print view) once paid, retry payment if pending. `/account/addresses` CRUD with default.
- JSON API mirror for the future app: addresses CRUD, POST checkout, POST verify, GET orders, GET order.
- The Phase 1 "Checkout arrives in Phase 2" placeholder is replaced.

## 6. Payments

- `src/server/payments/` provider interface: `createOrder({amountPaise, receipt, notes})`, `verifyPaymentSignature({providerOrderId, paymentId, signature})`, `verifyWebhookSignature(rawBody, signature)`, `refund(paymentId, amountPaise)`. Implementations `razorpay.ts` and `mock.ts`. HMAC-SHA256 hex with `timingSafeEqual`.
- Env: `PAYMENT_PROVIDER`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CRON_SECRET`, `SMTP_URL`.
- `markOrderPaid(orderId, paymentId, source)` idempotent; EXPIRED orders try to re-reserve stock, else PAID with `needsAttention` and an ATTENTION event.
- Webhook `/api/webhooks/razorpay`: raw body, verify, handle `payment.captured`, `order.paid`, `payment.failed`; 200 on duplicates/unknown.

## 7. Admin (fewest clicks)

1. **Orders list** `/admin/orders`: status tabs with counts ("To ship" = PAID + PROCESSING, default tab), search (number, name, email, phone, pincode), needs-attention filter, pagination 50, rows show number, date, customer, city, item count, total, status badge, age badge (amber when unshipped > 2 days). Checkbox bulk actions: Print labels, Print packing slips, Mark processing, Export CSV (also export current filter).
2. **Order detail** `/admin/orders/[id]`: customer card (tel: link, WhatsApp `https://wa.me/91XXXXXXXXXX?text=<prefilled with order number>`), address with Copy button, items with thumbnails/size/color/SKU/qty, breakup, payment ids, primary "next action" button (Mark processing → Mark shipped → Mark delivered), tracking form (carrier select Delhivery, DTDC, India Post, Blue Dart, Xpressbees, Ekart, Shadowfax, Other + number; tracking URL auto from template), admin note, timeline, Print Label / Slip / Invoice, Cancel & restock (confirm dialog; allowed before SHIPPED), Refund (Razorpay API when configured, else mark refunded manually).
3. **Print views** `/admin/orders/print?ids=…&doc=label|slip|invoice` outside the admin chrome: label `@page 4in 6in`, one per order, large ship-to block, phone, order number, Code128 barcode (small pure-TS SVG encoder, unit tested), from-address; slip A4 with item checklist; invoice A4 GST tax invoice (also reachable by the customer for their own paid order). A Print button plus auto `window.print()`.
4. **Customers** `/admin/customers` (orders count, total spent, last order, search) and detail (addresses, orders).
5. **Coupons** and **Offers** CRUD with usage counts.
6. **Inventory** `/admin/inventory`: all variants, inline stock edit, low-stock filter.
7. **Dashboard**: revenue today / 7 d / 30 d, to ship, needs attention, low-stock list, recent 10 orders, top 5 products (30 d), 14-day revenue bars (SVG).
8. **Settings** `/admin/settings`: StoreSetting form.
9. Nav badge with "to ship" count.

## 8. Automations

`src/server/jobs/*`, run by `POST /api/cron/[job]` with `Authorization: Bearer ${CRON_SECRET}` (crontab on EC2 in the deploy phase).

| Job | Schedule | Action |
|---|---|---|
| expire-orders | every 5 min | past-due PENDING_PAYMENT → EXPIRED, release stock, event |
| low-stock | hourly | variants at/below threshold with `lowStockAlertedAt` null → one digest email to admin, set alertedAt; stock edits above threshold reset it |
| daily-summary | 21:00 IST | admin email: today's orders, revenue, to-ship, needs-attention, low-stock count |
| abandoned-cart | hourly | signed-in carts with items, updated 3–48 h ago, no order since, `remindedAt` null → one reminder email |

Event-driven (best effort): paid → customer confirmation + admin notification; shipped → customer email with tracking; delivered → thank-you; cancelled/refunded → customer email. All jobs idempotent and integration tested.

## 9. Testing

Vitest integration tests (real test DB) for services, payments (mock + HMAC fixtures), coupons/offers, jobs, pricing, barcode. Playwright e2e: sign in → add to cart → checkout with new address → mock pay → account order → admin order, label print page renders, mark shipped with tracking; plus a 390×844 mobile checkout run. `npm run build`, `lint`, `typecheck`, `test` clean.
