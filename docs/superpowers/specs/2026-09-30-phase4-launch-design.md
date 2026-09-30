# Phase 4 — Launch Readiness: Growth Features, Mobile Polish and AWS Deployment

Status: approved direction (owner: "when I wake up the whole website should be ready to deploy; only Razorpay keys and the SSH key remain; optimise for mobile"). Builds on Phases 1–3; all conventions bind.

## 1. Growth features

- **Homepage banners admin** `/admin/banners`: Banner model (id, title, subtitle?, ctaLabel?, ctaHref?, imageKey (desktop), mobileImageKey?, placement `HERO | STRIP`, sortOrder, active, startsAt?, endsAt?). Homepage hero/announcement strip read active banners, falling back to the current static content when none exist. Drag-free ordering via up/down buttons.
- **Announcement bar** text + link in StoreSetting (shown site-wide when set).
- **Wishlist**: WishlistItem (userId, productId, unique). Heart button on product cards and product page (guests → login prompt with next), `/account/wishlist`, API mirror. Admin product list shows wishlist count column.
- **Reviews**: Review (id, productId, userId, orderItemId unique, rating 1–5, title?, body ≤ 1000, status `PENDING | APPROVED | REJECTED`, createdAt). Only customers with a DELIVERED order item for the product can review (verified purchase). Product page shows average rating, count, approved reviews (paginated 10), JSON-LD aggregateRating. Admin `/admin/reviews` moderation queue with approve/reject (auto-approve toggle in settings, default on for 4–5 stars). Automation: `review-request` job emails customers 5 days after DELIVERED (once per order).
- **SEO**: `app/sitemap.ts` (home, collections, active products, pages), `app/robots.ts` (disallow /admin, /account, /checkout, /api), per-page metadata audit (title template, description, canonical, OG image = first product image), Product JSON-LD offers availability.
- **Analytics**: optional `NEXT_PUBLIC_GA_ID` and `NEXT_PUBLIC_META_PIXEL_ID`; scripts load only when set, via `next/script` afterInteractive; ecommerce events view_item, add_to_cart, begin_checkout, purchase.

## 2. Mobile polish (whole site)

Audit every storefront, account, checkout, studio and admin page at 360 × 740 and 390 × 844 with Playwright screenshots. Requirements: no horizontal scroll, tap targets ≥ 44 px, readable type (≥ 14 px body), bottom sticky CTA on product and checkout, filters as bottom sheet, admin tables collapse into cards below 768 px, admin nav becomes a drawer, inputs use correct `inputMode`/`autocomplete` (tel, postal-code, email), safe-area insets respected, images sized with `sizes`, animations lighter on mobile (reduced parallax), Lighthouse mobile performance ≥ 85 on home and product pages locally (production build).

## 3. AWS EC2 deployment kit (Phase 1D)

- `next.config.ts` `output: "standalone"`; `/api/health` (DB ping, returns version).
- `Dockerfile` multi-stage (node:22-alpine deps → build → runner as non-root, copies standalone, static, public, prisma, content); entrypoint runs `prisma migrate deploy` then starts. Uploads dir is a volume.
- `deploy/docker-compose.prod.yml`: `app`, `db` (postgres:16-alpine, volume, not exposed publicly), `caddy` (caddy:2-alpine, ports 80/443, automatic HTTPS for `${DOMAIN}`, gzip/zstd, security headers, 50 MB body limit), `backup` (daily `pg_dump` to a volume with 14-day retention; optional S3 sync when `BACKUP_S3_BUCKET` set).
- Cron: `deploy/crontab` executed by a tiny `cron` sidecar (alpine + curl) calling `/api/cron/<job>` with `CRON_SECRET` per the Phase 2/3/4 schedules.
- `deploy/.env.production.example` with every variable documented; `deploy/setup-ec2.sh` (Ubuntu 24.04: docker engine + compose plugin, 2 GB swap, ufw 22/80/443, unattended-upgrades); `deploy/deploy.sh` (git pull, `docker compose build`, `up -d`, prune, health check); `deploy/seed-admin.sh`.
- `docs/deploy/aws-ec2.md` runbook: launch t3.small (or t4g.small) Ubuntu 24.04 in ap-south-1, 30 GB gp3, security group 22 (your IP)/80/443, Elastic IP, DNS A record, SSH in, run setup, clone, fill env, deploy, create admin, set Razorpay webhook URL `https://DOMAIN/api/webhooks/razorpay` with events payment.captured, order.paid, payment.failed, switch Razorpay to live keys, SES/SMTP setup, verify checklist, backups/restore, rollback.
- `.github/workflows/ci.yml`: Postgres service, `npm ci`, prisma migrate, lint, typecheck, test, build.
- Security headers in `next.config.ts` (X-Frame-Options DENY except none needed, Referrer-Policy, Permissions-Policy, X-Content-Type-Options); CSP compatible with Razorpay checkout (`checkout.razorpay.com`, `api.razorpay.com`) and analytics hosts.

## 4. Final acceptance

`npm run lint`, `typecheck`, `test`, `build`, `test:e2e` (desktop + mobile projects) green; `docker compose -f deploy/docker-compose.prod.yml config` validates; a whole-project review with fixes; README "Go live in 2 steps" section: (1) add Razorpay keys + webhook secret to the server env, (2) give SSH access / run the runbook.
