# Admin Panel & Automation Survey — thrift-Ecom

Context: solo/two-person shop, Next.js 15 + Prisma/Postgres, Razorpay prepaid only, manual shipping for now, in-house printing, single EC2 box. Catalog/admin (Products, Collections, Variants) already exists; Order/Payment models are not yet in the schema, so this survey is meant to shape that next build. Goal: every feature below exists because it removes a manual step for a 1–2 person team, not because competitors have it.

Priority: **P0** = needed at launch, **P1** = soon after, **P2** = later/nice-to-have. Effort: **S** (hours), **M** (a day or two), **L** (multi-day).

## 1. Admin panel features

### Orders & fulfilment

| Feature | Why it saves time | Effort | Priority |
|---|---|---|---|
| Order list with search/filter (status, date, customer, phone, order #, product) | Finding one order among hundreds without scrolling | S | P0 |
| Order detail page with timeline (created → paid → packed → shipped → delivered, with notes) | One glance answers "where is this order" without asking anyone | M | P0 |
| One-click packing slip print (address, items, sizes, order #) | No retyping address into a courier's system or a Word doc | S | P0 |
| Bulk print packing slips (select many orders → one print job) | Batches an evening's packing into one print run instead of N clicks | S | P0 |
| Copy address button (clipboard) | Paste straight into courier booking form/app | S | P0 |
| Order status quick-action buttons (Pack/Ship/Deliver/Cancel as single clicks, not a form+save) | Fulfilling 20 orders a day without a modal each time | S | P0 |
| WhatsApp click-to-chat on order/customer (`wa.me/<phone>?text=` prefilled with order #) | Customers already expect WhatsApp; no manual number lookup/typing | S | P0 |
| Manual tracking-number + carrier field | Triggers the "shipped" email/automation without a courier API | S | P0 |
| Internal order notes (admin-only) | Captures "customer wants XL not L" without a side notebook/chat | S | P0 |
| CSV export of orders | Feeds manual accounting, ad-hoc analysis, bulk courier upload | S | P0 |
| Refund/cancel button wired to Razorpay refund API | No switching to the Razorpay dashboard to refund | M | P1 |
| Keyboard shortcuts (j/k navigate, s ship, / search) | Meaningful once order volume is high enough to matter | M | P2 |
| Return/exchange tracking | Useful once return volume exists; premature at launch | M | P2 |

### Printing / production

| Feature | Why it saves time | Effort | Priority |
|---|---|---|---|
| Print-queue view: paid orders grouped by design + size | Turns "check every order" into one production sheet per run | M | P0 |
| Design-file download link per order line item | Printer gets the exact uploaded artwork without hunting through email/Drive | S | P0 |
| "Printed" checkbox per line item, separate from order status | Tracks production progress distinct from fulfilment status | S | P1 |
| Batch-export pending designs as a labelled ZIP | One download for a whole print run instead of per-file saves | M | P1 |
| Production checklist (cut/print/QC/pack) per order | Useful once a second person handles production | M | P2 |

### Catalog & inventory

| Feature | Why it saves time | Effort | Priority |
|---|---|---|---|
| Low-stock badge/threshold on product & variant list | Reordering blanks before you sell out, spotted at a glance | S | P0 |
| Out-of-stock variant auto-hide on storefront | Stops orders you can't fulfil without manually toggling visibility | S | P0 |
| Inline variant stock/price edit | Already built (variant matrix editor) | — | done |
| Duplicate product (clone for new colorway/design) | New designs without rebuilding sizes/prices from scratch | S | P1 |
| Bulk price/stock update via CSV import | Season-wide price change in one file instead of per-product edits | M | P1 |

### Customers & support

| Feature | Why it saves time | Effort | Priority |
|---|---|---|---|
| Search customer/order by phone, email or order # | Fastest path when a customer messages first, not the other way round | S | P0 |
| WhatsApp click-to-chat (shared with Orders above) | See above | S | P0 |
| Customer order-history view | Answers "has this person ordered before / any issues" instantly | S | P1 |
| Guest order-status lookup (order # + phone, no login) | Deflects "where's my order" DMs to a self-serve page | M | P1 |

### Marketing

| Feature | Why it saves time | Effort | Priority |
|---|---|---|---|
| Discount/coupon codes (flat/%, expiry, min order) | Run a sale without manually editing prices and reverting later | M | P1 |
| Abandoned-cart list view | Lets you manually nudge (or later automate) recoverable revenue | S | P1 |
| Manual "send update" email blast to past customers | Announce a drop without a marketing tool subscription | M | P2 |

### Finance / GST

| Feature | Why it saves time | Effort | Priority |
|---|---|---|---|
| Auto-generated GST invoice PDF per order (invoice #, GSTIN, HSN, CGST/SGST or IGST split) | Legally required in India; manual invoicing doesn't scale past a few orders/day | M | P0 |
| Daily/period sales summary (revenue, order count, AOV) in-panel | Replaces manually totalling orders each night | S | P0 |
| GST-return-ready order export (GSTR-1 style CSV) | Saves the accountant/owner re-formatting data every filing cycle | M | P1 |
| Razorpay settlement reconciliation view (payments vs. orders) | Catches missed webhooks/underpaid orders without spreadsheet diffing | M | P1 |

### Settings

| Feature | Why it saves time | Effort | Priority |
|---|---|---|---|
| Store settings (shipping fee, min order, business hours, banner text) | Change operational parameters without a deploy | S | P0 |
| Admin roles (owner vs. fulfilment-only staff) | Matters once a second person is hired; not for a 1-person shop | M | P2 |
| Editable email/WhatsApp message templates | Wording tweaks without touching code | M | P2 |

## 2. Automations (event → action)

| Event → Action | Priority | Effort | External service |
|---|---|---|---|
| Razorpay payment captured → mark order Paid, decrement variant stock, email confirmation, notify admin | P0 | M | Razorpay webhook + SMTP |
| Order created but unpaid 15–30 min → cancel order, release reserved stock | P0 | S | none (app cron) |
| Variant stock ≤ threshold → alert admin | P0 | S | SMTP (or WhatsApp/Telegram bot, free) |
| Order marked Shipped → email/WhatsApp customer with tracking # | P0 | S | SMTP |
| New paid order → admin notification (so they don't have to poll the dashboard) | P0 | S | SMTP, or free Telegram/WhatsApp bot |
| GST invoice generated + emailed on payment captured | P0 | M | PDF lib (self-hosted, e.g. pdf-lib/puppeteer) |
| Nightly DB backup (pg_dump, rotate last N) | P0 | S | disk, or S3 if already using one for images |
| Razorpay webhook reconciliation (nightly: compare Razorpay Payments API vs local orders, flag mismatches) | P1 | M | Razorpay API + cron |
| Order Delivered → schedule review-request email +7 days | P1 | M | SMTP + cron |
| Abandoned cart (inactive >2h, items present, email known) → reminder email | P1 | M | SMTP + cron |
| Daily sales-summary email to owner | P1 | S | SMTP + cron |
| Image optimization on upload (resize/compress product & design images) | P1 | S | sharp (in-process, no external service) |
| Failed payment → log, optional customer retry nudge | P2 | S | SMTP |
| Uploaded design file malware/type scan | P2 | M | clamAV or basic MIME/size validation only |

Note: since shipping is manual for now, Shiprocket-style automations (auto rate-shopping, label generation, courier tracking webhooks) are deliberately deferred — see "later" set below.

## 3. Recommended sets

**Launch set (P0) — buildable now with only Razorpay + an SMTP provider (e.g. Gmail SMTP or a free-tier transactional mail service), no other paid services:**

- Orders: searchable/filterable list, detail + timeline, one-click and bulk packing-slip print (browser print CSS, no label-printer API needed), copy-address button, status quick actions, WhatsApp click-to-chat (`wa.me` links are free), internal notes, CSV export.
- Production: print queue grouped by design/size, per-item design-file download.
- Catalog: low-stock badges, auto-hide out-of-stock (mostly reuses existing variant data).
- Automations: Razorpay webhook → paid + stock decrement + confirmation email + admin ping; unpaid-order auto-release cron; low-stock alert; shipped email; nightly pg_dump backup; self-hosted GST invoice PDF.
- Finance: GST invoice PDF, daily sales summary in-panel.

**Later set (P1/P2):**

- Coupons/discounts, abandoned-cart automation and manual list, customer order-history and guest lookup, review-request automation.
- Razorpay refund button, settlement reconciliation dashboard, GSTR-1 export.
- Shiprocket (or similar) integration once volume justifies it: auto label/tracking, rate shopping, courier status webhooks.
- WhatsApp Business API (paid, templated/automated messages) once `wa.me` manual chat becomes a bottleneck.
- Admin roles, editable message templates, keyboard shortcuts, bulk CSV catalog import, return/exchange flow, marketing email blasts.
