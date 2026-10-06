# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** college students and young adults in India (roughly 18–28) who shop on their phones, follow streetwear and pop-culture drops, and compare against Veirdo, The Souled Store and Bewakoof. Their job: find or make a tee that says something about them, check fit and price quickly, and pay without friction.
- **Operators:** the tebox owner and a very small team running the store from the admin panel, often from a phone: packing and shipping orders, printing custom designs in-house, managing stock, promotions and reviews.

## Product Purpose

tebox is an Indian online T-shirt store. It sells its own streetwear tees and lets customers design their own tee (upload artwork, add text, front and back) and see it on the shirt before buying. Every order, ready-made or custom, is printed and shipped by tebox itself. Success means customers buy from a phone in a few taps, custom orders arrive looking exactly like the preview, and the small team can run fulfilment with as little manual work as possible.

## Positioning

The combination competitors don't offer together: a design-your-own-tee studio, in-house printing (quality control and quick custom turnaround), original designs and limited drops rather than licensed characters, and heavyweight quality at a fair price.

## Operating Context

- Customers browse, customise and check out mostly on phones; prepaid only (Razorpay), manual shipping with courier tracking numbers.
- Admin workflow: orders arrive → admin prints a 4×6 shipping label / packing slip / GST invoice → custom items go through the print queue (download print-ready files, mark printed) → mark shipped with tracking → delivered → automatic review-request email.
- Automations run on a schedule: unpaid-order expiry, low-stock alerts, daily sales summary, abandoned-cart reminders, payment reconciliation, design cleanup, review requests.
- A native mobile app is planned later; the backend is API-first (`/api/v1`) so the app can reuse it.

## Capabilities and Constraints

- Built: storefront, collections, product pages, cart, accounts (email + Google), saved addresses, checkout with Razorpay, order history and GST invoices, wishlist, verified-buyer reviews, homepage banners and announcement bar, custom design studio, full admin panel (products, orders, print queue, coupons, bundle offers, customers, inventory, banners, reviews, settings, dashboard), SEO and optional analytics.
- Money is stored in integer paise; prices are GST-inclusive.
- Hosting: one AWS EC2 server (Docker, Caddy, Postgres, nightly backups).
- Not offered (yet): cash on delivery, Shiprocket/courier API integration, phone OTP login, 3D preview.
- Undecided: support email address and social links (placeholders in `src/config/brand.ts`); seller legal name, address and GSTIN (entered later in Admin → Settings); logo.

## Brand Commitments

- Name: **tebox** (lowercase, as given by the owner). Domain: tebox.in.
- Voice: bold and playful — short, confident, a bit cheeky, streetwear energy; Hinglish is fine.
- Tagline currently in code: "Wear what you mean." (not yet confirmed as final).
- No logo yet.

## Evidence on Hand

- Real product catalogue and photography: not yet supplied (the seed data is placeholder).
- No testimonials, press, customer counts or reviews exist yet. Future work must not invent them; on-site reviews come only from verified buyers.

## Product Principles

1. Phone first: every customer and admin flow must be quick and comfortable on a small screen.
2. What you see is what you get: the custom preview, price and print file must match the delivered shirt.
3. Less work for a tiny team: automate or shorten every repeated admin task.
4. Honest and safe money flow: never charge twice, never oversell, never fake social proof.
5. Own the voice: original, bold and playful, not a copy of competitors.

## Accessibility & Inclusion

Target WCAG 2.1 AA on storefront and admin: 44 px tap targets, keyboard-operable controls, reduced-motion support, readable contrast. Many users are on mid-range Android phones and patchy mobile data, so pages must stay light and fast.
