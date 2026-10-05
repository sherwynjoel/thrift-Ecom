# T-Shirt Store (brand name pending)

Custom T-shirt e-commerce: animated storefront, persistent cart, accounts, admin panel, and (later) a design-your-own tool. Next.js 15, Prisma, PostgreSQL.

## Go live in 2 steps

Everything else is already built: the Docker image, the Compose stack (app, Postgres, Caddy with automatic HTTPS, daily backups, scheduled jobs) and a full runbook. Only two things are left for the store owner.

1. **Razorpay keys, plus an email sender.** In the Razorpay dashboard, create **Test mode** API keys and a webhook to `https://<your-domain>/api/webhooks/razorpay` for events **payment.captured**, **order.paid** and **payment.failed**. Also get SMTP credentials (or SES) for order emails. The store refuses to start without both. Put `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and the email settings into `deploy/.env` in step 2 below. Switch to **Live** keys and a live webhook after KYC ([docs/deploy/aws-ec2.md](docs/deploy/aws-ec2.md), step 10); `--restart` is for that later swap, not the first deploy.
2. **SSH access to a server.** Launch an Ubuntu 24.04 EC2 instance (Mumbai), point the domain at it, then `sudo bash deploy/setup-ec2.sh`, fill in `deploy/.env` (the keys and email settings from step 1), `bash deploy/deploy.sh`, `bash deploy/seed-admin.sh you@yourdomain.com`. Every click and command is in [docs/deploy/aws-ec2.md](docs/deploy/aws-ec2.md) (about 30–45 minutes, steps 2–9).

**Environment variables that must be set** (checked at server start — see [Environment variables](#environment-variables)): `AUTH_SECRET`; `PAYMENT_PROVIDER=razorpay` with `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; `CRON_SECRET` (32+ characters); `EMAIL_DRIVER=smtp` (with `SMTP_URL`, `EMAIL_FROM`) or `EMAIL_DRIVER=ses` (with `AWS_REGION`, `EMAIL_FROM`); `NEXT_PUBLIC_SITE_URL` as a real `https://` address. The server refuses to start in production if any of these is missing or wrong.

**Scheduled jobs:** the `cron` container already runs all 7 jobs (`expire-orders`, `low-stock`, `daily-summary`, `abandoned-cart`, `reconcile-payments`, `purge-designs`, `review-request`) on Indian time — the owner does nothing (see [Cron](#cron)).

**After each deploy, check:** the home page, a product page, the design studio, checkout with a Razorpay **test** card, admin login, printing a label, and `curl https://<domain>/api/health` → `"status":"ok"` (full checklist: [docs/deploy/aws-ec2.md](docs/deploy/aws-ec2.md), step 16).

**Before launch:**

- Brand name is set to `tbox`; support email is `tboxcbe@gmail.com`; add social links in `src/config/brand.ts` (empty for now). These are baked in at build time, so fixing them later needs `bash deploy/deploy.sh --no-pull`.
- Try the design studio's touch gestures on a real iPhone (Safari) and a real Android phone (Chrome) — see [Design studio and print queue](#design-studio-and-print-queue).
- Confirm each carrier's tracking URL with a real AWB (`src/lib/carriers.ts`).
- Fill in seller name, address, state and GSTIN in **Admin → Settings**.
- Confirm the GST slab basis (list price vs. discounted price) with your CA — see [Admin: daily order routine](#admin-daily-order-routine).
- If a reverse proxy sits in front of Caddy, it must allow request bodies ≥ 100 MB on `/api/designs` (Caddy already does; see `deploy/Caddyfile`).
- If using S3 storage, keep `designs/print/` out of the bucket's public policy.
- Use at least a **t3.small (2 GB RAM) with 2 GB swap** (`deploy/setup-ec2.sh` adds the swap).

## Local setup

1. `docker compose up -d` — Postgres on localhost:5432 (`thrift` and `thrift_test` databases)
2. `cp .env.example .env` and set `AUTH_SECRET` (`openssl rand -base64 32`)
3. `npm install`
4. `npm run db:migrate` then `npm run db:seed`
5. `npm run db:test:migrate` — applies migrations to the `thrift_test` database used by `npm test`
6. `npm run dev` — http://localhost:3000

Phase 4 needs no new local setup.

## Payments (Razorpay)

Checkout uses Razorpay's Orders API (called with `fetch`, no SDK) and Checkout.js in the browser. `PAYMENT_PROVIDER` selects the provider:

- `mock` (default when unset; used by `npm test` and e2e): after "Pay" you land on a test page with **Pay successfully** / **Fail the payment**. No money moves. The app refuses to start payments with `mock` when `NODE_ENV=production`.
- `razorpay`: real payments.

Set up Razorpay:

1. Create a Razorpay account and switch the dashboard to **Test mode**.
2. **Settings → API Keys → Generate key.** Put the key id and secret in `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. **Settings → Payment capture:** automatic capture (the store treats `payment.captured` / `order.paid` as paid).
4. **Settings → Webhooks → Add:** URL `https://<your-domain>/api/webhooks/razorpay`, a secret you generate (`openssl rand -hex 32`) stored in `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured`, `order.paid`, `payment.failed`.
5. Set `PAYMENT_PROVIDER="razorpay"` and restart. Pay with Razorpay's test cards/UPI ids.
6. Going live: repeat 2–4 in **Live mode** (live keys and a live webhook are separate) and redeploy.

An order is marked paid by whichever arrives first: the signed browser callback (`POST /api/payments/verify`) or the signed webhook. Both are idempotent and check the amount; the `reconcile-payments` cron job is the safety net for a lost webhook. Razorpay cannot reach `localhost`, so locally you rely on the browser callback (or use a tunnel). Unpaid orders hold stock for 30 minutes, then expire. Starting checkout again with the same bag reuses the open unpaid order; a changed bag replaces it. If the status page keeps saying "Confirming your payment…", it offers **Check again** and the support email (no retry there, so nobody pays twice).

Database connections: if `DATABASE_URL` sets Prisma's `connection_limit`, keep it at **5 or more**. Refunds hold a connection while they call Razorpay.

## Cron

Automations run through `POST /api/cron/<job>` with `Authorization: Bearer $CRON_SECRET`:

| Job | When | What |
|---|---|---|
| `expire-orders` | every 5 min | unpaid orders older than 30 min → Expired, stock released |
| `low-stock` | hourly | one email listing variants at or below the Settings threshold |
| `daily-summary` | 21:00 IST | today's orders, revenue, to-ship, needs-attention, low stock |
| `abandoned-cart` | hourly | one reminder to signed-in shoppers whose bag has been idle 3–48 h |
| `reconcile-payments` | every 30 min | asks Razorpay about unpaid orders from the last 48 h and marks captured payments paid (lost-webhook safety net) |
| `purge-designs` | daily, 03:30 IST | deletes designs older than 30 days that are in no bag and no order (with their files), and uploaded studio images older than 24 h that no design uses |
| `review-request` | daily, 11:00 IST | one email per delivered order, 5–30 days after delivery, asking the customer to rate the products they have not reviewed (Settings → Reviews can turn it off) |

Run one by hand:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://DOMAIN/api/cron/expire-orders
```

In production the `cron` container runs `deploy/crontab` (IST times) against the app over the internal network; no host crontab is needed. Every job is safe to run twice. Emails go to **Admin → Settings → Admin email**.

## Email

`EMAIL_DRIVER=console` prints emails to the server log (default). `EMAIL_DRIVER=smtp` sends through `SMTP_URL`, e.g. `smtps://you%40gmail.com:app-password@smtp.gmail.com:465` (use an app password), from `EMAIL_FROM`. `EMAIL_DRIVER=ses` uses Amazon SES. Email failures never block an order; they appear as "Email failed" on the order timeline.

## Admin: daily order routine

1. **Orders → To ship** (default tab, oldest first). Select the batch → **Print labels** and **Print slips** (4×6 labels, A4 slips; one document per page) → **Mark processing**.
2. Pack against the slip. On each order, **Copy** the address into the courier's booking page, enter the carrier and AWB, **Save & mark shipped**: the customer gets the tracking email.
3. **Needs attention** means "look at this order": a payment that arrived after expiry or with a wrong amount, a second payment for an already-paid (or refunded) order, money received for a cancelled order, a paid order you cancelled whose refund is still pending, a stock conflict when a late payment could not be re-reserved, or a refund that failed or needs checking.
4. Carrier tracking links are templates in `src/lib/carriers.ts`; check each carrier once with a real AWB before launch.
5. **Cancel** never moves money. Cancelling a paid order puts its stock back and flags it "refund pending" until you click **Refund** (or **Already refunded?** if you refunded in the Razorpay dashboard).
6. **Invoices** freeze the seller name, address, state, GSTIN and GST rates at the moment the order is paid, so later changes in **Settings** never alter an invoice that was already issued. Orders paid before this existed use the current settings. A refunded order's invoice is marked **REFUNDED** with the refund date.

**GST slab (confirm with your CA before launch):** the 5% / 18% slab is chosen from each item's list price before any discount. Under GST the slab may instead follow the discounted per-piece value shown on the invoice (for example a ₹2,700 tee sold at ₹2,430 after 10% off would fall in the lower slab). If your CA confirms that, the change is one line in `src/lib/gst.ts` (`buildInvoice`: rate from `(lineTotal − allocated discount) / quantity`).

## Design studio and print queue

- Customers design at `/customize` (any **active** product with **Customizable blank** ticked in the product editor; the seed marks the two blank tees). Front and back each have a 12 × 16 in print area. Uploads: PNG, JPG or WebP up to 10 MB. Text: Anton, Bebas Neue, Inter, Permanent Marker. Images below 150 DPI at their printed size show a warning (below 100 DPI: "may print blurry"); nothing is blocked.
- Price = tee price + **Front print fee** (if the front has a design) + **Back print fee** (if the back has one). Set both in **Admin → Settings → Custom prints** (defaults ₹0 and ₹149). Offers ignore custom tees unless the offer has **Include custom-printed tees** ticked; coupons always apply.
- On "Add to cart" the browser renders, per designed side, an 800 px preview (tee + design) and a transparent 3600 × 4800 px print PNG (300 DPI; phones that cannot allocate that canvas, or a detailed photo whose full-size file would pass 40 MB, send 3072 × 4096, 256 DPI). Limits: 40 MB per print file, 3 MB per preview, 90 MB per design request; a bag holds at most 10 custom designs. **Behind a reverse proxy, allow request bodies of at least 91 MB on `/api/designs`** (nginx: `client_max_body_size 91m;`), or photo designs fail with 413. Files live in storage under `designs/previews/`, `designs/print/` and `designs/assets/`. Print files are never served by the public `/api/uploads` route, only through the admin download in the print queue.
- `POST /api/designs` only reads, decodes and stores 2 uploads at a time (`src/server/upload-gate.ts`): a 3rd concurrent upload is queued *before* its body is read, so it holds no memory while it waits. A request still queued after 30s gets a 503 with `Retry-After` instead of piling up forever; if the client has already disconnected by the time its turn comes, the queued work is skipped. This is a single-process limit, so **a t3.small (2 GB RAM) needs at least 2 GB of swap** to handle a burst of large photo designs without OOM-killing the app; size up the instance or add swap before launch.
- **Print queue** (`/admin/print-queue`, badge in the nav): every custom item of a Paid or Processing order that is not printed yet, oldest first, optionally grouped by colour + size. Download the print files, print, then **Mark printed**; when every custom item of a Paid order is printed the order moves to **Processing** automatically. **Hold** (with a note) flags the order for attention and gives you a WhatsApp link to the customer; release the hold to continue.
- Order pages, the packing slip ("Custom print: front + back"), the invoice and the confirmation email show the design previews.
- **S3:** when `STORAGE_DRIVER=s3`, add a CORS rule on the bucket allowing `GET` from the site origin, otherwise the browser cannot export designs that contain uploaded images. Keep `designs/print/` out of any public bucket policy so print files stay admin-only.
- Cleanup: the `purge-designs` cron job (daily, e.g. 03:30 IST) deletes designs older than 30 days that are in no order and in no bag, or only in guest bags untouched for 30 days (those bag lines go too), with their files:
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/purge-designs`
- Deleting an archived customizable product also deletes the files of the designs made on it, except files an order still links to.
- The only new dependency is `fabric` (v6), loaded in the browser on the studio page only.
- **Before launch, try the studio on a real iPhone (Safari) and a real Android phone (Chrome):** one-finger drag on a design, two-finger pinch/rotate, and that swiping on the empty area around the shirt still scrolls the page. The e2e tests run in desktop Chromium with touch emulation and cannot prove real touch gestures.

## Deployment

The production stack (`deploy/docker-compose.prod.yml`) runs five containers on one EC2 box: `app` (the Next.js server), `db` (Postgres, with the `pgdata` volume), `caddy` (automatic HTTPS, fronting `app`), `cron` (a tiny alpine sidecar running `deploy/crontab` against `app` over the internal network) and `backup` (daily dumps of the database plus the `uploads` volume into the `backups` volume). Logs stay in each container's capped `json-file` log (10 MB × 3 files); backups live under the `backups` volume, listable with `bash deploy/restore.sh list`. Three commands cover everyday operations: `bash deploy/deploy.sh` (pull and deploy the latest commit on `main`), `bash deploy/deploy.sh --restart` (re-read `deploy/.env` and recreate `app`, `cron` and `backup` without rebuilding, e.g. after rotating a secret), and `bash deploy/deploy.sh --rollback <tag>` (run a previously built image). Full runbook: [docs/deploy/aws-ec2.md](docs/deploy/aws-ec2.md). `NEXT_PUBLIC_*` variables and `S3_PUBLIC_BASE_URL` are baked into the app image at build time, so changing any of them needs a rebuild: `bash deploy/deploy.sh --no-pull`.

## Mobile audit

`npm run audit:mobile` runs every storefront, customer and admin route at 360 × 740 and 390 × 844, writing a screenshot per route plus a `report.json` to `.audit/mobile/<viewport>/` (gitignored). `npx playwright test --project=mobile-360` is the enforced gate: it fails if any route scrolls sideways or has a tap target under 44 px.

## Analytics

Two optional, independent scripts: `NEXT_PUBLIC_GA_ID` (GA4) and `NEXT_PUBLIC_META_PIXEL_ID` (Meta Pixel). Each script loads only when its id is set, and only on the storefront — the admin is never tracked. Tracked events: `view_item`, `add_to_cart`, `begin_checkout`, `purchase` (Meta Pixel: `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`).

## Security headers

`src/lib/security-headers.ts` builds the Content-Security-Policy and the other hardening headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`) applied by `next.config.ts`; the CSP allows the Razorpay and configured analytics hosts and nothing else. HSTS is added by Caddy, not Next.js. `/api/health` is a plain uptime-check endpoint (no auth) for load balancers and monitors.

## Environment variables

In production (`NODE_ENV=production`, i.e. `npm run start`) the server **refuses to start** unless: `PAYMENT_PROVIDER=razorpay` with all three `RAZORPAY_*` values, `CRON_SECRET` of at least 32 characters, `EMAIL_DRIVER` of `smtp` (with `SMTP_URL`, `EMAIL_FROM`) or `ses` (with `AWS_REGION`, `EMAIL_FROM`), `NEXT_PUBLIC_SITE_URL` an `https://` address that is not localhost, and `AUTH_SECRET`. The log lists every missing item. `next build` and `npm run dev` are not checked (`src/instrumentation.ts`, `src/server/env-check.ts`).

| Name | Needed | Purpose |
|---|---|---|
| `DATABASE_URL` | always | PostgreSQL (`connection_limit` ≥ 5 if set) |
| `AUTH_SECRET`, `AUTH_TRUST_HOST` | always | Auth.js |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | Google sign-in |
| `NEXT_PUBLIC_SITE_URL` | always (production: `https://`, not localhost) | absolute links in emails and metadata |
| `STORAGE_DRIVER` (+ `AWS_REGION`, `S3_BUCKET`, `S3_PUBLIC_BASE_URL` for `s3`) | always | image storage |
| `EMAIL_DRIVER`, `EMAIL_FROM` (+ `SMTP_URL` for `smtp`, `AWS_REGION` for `ses`) | always (production: `smtp` or `ses`) | email |
| `PAYMENT_PROVIDER` | always in production (`razorpay`) | `mock` or `razorpay` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | with `razorpay` | Razorpay API and webhook |
| `CRON_SECRET` | production (≥ 32 characters) | protects `/api/cron/*` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | seeding, e2e | seeded admin |
| `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID` | optional (storefront only; baked in at build time) | GA4 / Meta Pixel ecommerce events |
| `APP_VERSION` | set automatically by `deploy.sh` | image tag shown by `/api/health` |
| `NEXT_OUTPUT` | set by the Dockerfile/CI | `standalone` build output |

Production values live in `deploy/.env`, documented in `deploy/.env.production.example`.

## Scripts

- `npm run dev` / `build` / `start`
- `npm run lint`, `npm run typecheck`, `npm test`
- `npm run db:migrate`, `npm run db:test:migrate`, `npm run db:seed`, `npm run db:studio`
- `npm run db:seed` is a development tool: it upserts the seed collections (overwriting their name, description, and flags) and skips products that already exist.

## End-to-end tests

`npm run test:e2e` runs Playwright against the dev server and the seeded dev database. Before the first run: `docker compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npx playwright install chromium`. Use `npm run test:e2e:ui` to watch them.

## Admin

Sign in with the seeded admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`) and open `/admin`. Products are edited with a size × color variant matrix (stock and optional per-variant price), images can be uploaded, tagged to a color, and reordered, and collections control the storefront's featured order. Only accounts whose role is `ADMIN` in the database can open the admin.

## Docs

- Design specs: `docs/superpowers/specs/`
- Implementation plans: `docs/superpowers/plans/`
