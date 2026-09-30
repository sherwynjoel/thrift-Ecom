# Phase 4: Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the store ready to deploy: homepage banners and a site-wide announcement bar managed from the admin, a wishlist, verified-purchase reviews with moderation and an automated review-request email, SEO (sitemap, robots, canonical/OG metadata, Product JSON-LD with ratings) and optional GA4/Meta Pixel events, security headers with a Razorpay-compatible CSP, a health endpoint and standalone output, a complete AWS EC2 deployment kit (Dockerfile, production Compose with Caddy HTTPS, backups and a cron sidecar, bootstrap/deploy/admin/restore scripts, runbook, GitHub Actions CI), and a whole-site mobile polish pass verified by screenshots and automated no-sideways-scroll / tap-target checks. After this phase the owner only has to add Razorpay keys and give SSH access.

**Architecture:** Same layering as Phases 1–3. Pure, client-safe helpers in `src/lib/*` (safe links, banner schedule, rating maths, JSON-LD builders, SEO metadata builders, analytics event mapping, security headers). Database access only in `src/server/services/*` (banners, wishlist, reviews, admin-reviews, seo, health) and `src/server/jobs/*` (new `review-request` job registered in the Phase 2 `JOBS` map and run by `POST /api/cron/[job]`). Storefront pages are Server Components that call services; small client islands (hero carousel, wishlist heart via a context provider, review form, analytics events). Admin pages follow the Phase 1C/2 pattern. Deployment is a single EC2 box running `docker compose` with five services: `app` (Next.js standalone image, runs `prisma migrate deploy` on start), `db` (Postgres 16, internal only), `caddy` (TLS + compression + HSTS + 50 MB body limit), `backup` (daily `pg_dump` + uploads tarball, 14-day retention, optional S3 copy), `cron` (busybox crond calling the cron route over the internal network).

**Tech Stack:** Next.js 15 App Router (standalone output, `next/og`, `next/script`, `getImageProps`, Metadata API `sitemap`/`robots`), React 19, Prisma 6 / PostgreSQL 16, Zod 3, shadcn/ui on Base UI, Vitest against the real test database, Playwright; Docker (node:22-alpine, postgres:16-alpine, caddy:2-alpine, alpine:3.20), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-30-phase4-launch-design.md` is binding in full. The conventions of the Phase 1 spec and the Phase 2 and Phase 3 specs (money in integer paise, error mapping, API envelope, services own `@/server/db`, mobile-first, reduced motion, admin guard) still apply.

**Builds on:** `docs/superpowers/plans/2026-09-30-phase2-commerce-ops.md` (implemented first; every Phase 2 symbol used below is listed in "Existing interfaces") and Phase 3 (`docs/superpowers/plans/2026-09-30-phase3-design-studio.md`). From Phase 3 this plan relies only on the route names `/customize`, `/customize/[slug]` and `/admin/print-queue`, the cron job name `purge-designs` being present in `JOBS`, and the `printQueueCount` prop of `AdminNav`. Lines marked **(Phase 3)** are skipped if Phase 3 has not been merged when the task runs, and the task report says so.

## Global Constraints

- Node 22, npm 11, Git Bash on Windows; the repo is OneDrive-synced (slow installs and file ops; wait, retry once only on a real error). C: drive is low on space; on ENOSPC stop and report **BLOCKED** with the command that failed.
- Money is integer paise in the database, services, pricing and the API. Prices are **GST-inclusive** everywhere. Admin inputs are typed in rupees and converted only at the UI boundary with `rupeesToPaise`/`paiseToRupees` from `@/lib/money`; display uses `formatPaise`. Analytics events convert paise to rupees only inside `src/lib/analytics.ts`.
- Only `src/server/services/*` and `src/server/jobs/*` import `@/server/db`. Pages, actions and route handlers call services. Client components import only types (`import type`) from `@/server/*`, and may import from `@/lib/*` (everything in `src/lib` stays client-safe: no `node:` imports, no db).
- Every admin page calls `requireAdminPage()` (`src/app/admin/guard.ts`); every admin Server Action and admin route handler calls `requireAdmin()` from `@/server/admin-guard` before doing anything else. Storefront actions resolve the user with `requireUserId()` from `@/server/session-user`.
- After any admin mutation call `revalidatePath("/", "layout")` (storefront banners/announcement and the admin nav badges depend on it).
- shadcn primitives are the Base UI variant: compose with `render={<Link href="…" />}` plus `nativeButton={false}`, never `asChild`. Available primitives: accordion, badge, button, dialog, input, label, select, separator, sheet, skeleton, sonner, tabs. Use native `<textarea>`, `<input type="checkbox">`, `<input type="radio">`, `<select>` styled with Tailwind tokens (`bg-surface`, `bg-surface-raised`, `border-border`, `text-text-muted`, `text-danger`, `bg-brand`, `text-brand-ink`) where no primitive exists.
- **Mobile-first:** every new page is designed at 360 px first and must be usable at 360 px wide with **no horizontal page scroll** (wide lists become stacked cards, or scroll inside their own `overflow-x-auto` container). Every tap target is **at least 44 × 44 px**: buttons carry `className="h-11"` (or `min-h-11`, `size-11` for icon buttons), links used as buttons get `min-h-11 inline-flex items-center`, and checkbox/radio hit areas are wrapped in a `<label className="min-h-11 …">`. Inputs use `h-11`, the right `type`/`inputMode`/`autoComplete`, and visible `<label>`s. Fixed bottom bars use the `pb-safe` utility once Task 9 adds it.
- **Dependencies:** **no new npm dependencies in Phase 4.** The OG image uses `next/og` (bundled with Next), analytics uses `next/script`, the carousel, star input and CSP are hand-written. The Docker image installs the Prisma CLI and `bcryptjs` into `/opt/tools` inside the image only (pinned to the installed versions, checked by `tests/unit/deploy-kit.test.ts`).
- **Payments:** unchanged from Phase 2. `PAYMENT_PROVIDER` stays `mock` in `.env.example`, `.env.test` and e2e; production uses `razorpay`.
- **Docker:** never run `docker build`, `docker compose build`, `docker compose up` or `docker compose pull` for the production stack on this machine (disk is tight). Validate the stack with `cp deploy/.env.production.example deploy/.env && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env config -q; rm -f deploy/.env` (needs only the Docker CLI: no daemon, no images) and validate scripts with `bash -n` (host scripts) / `sh -n` (container scripts) plus `shellcheck` when installed (`command -v shellcheck`); otherwise review each script against the shell rules below and say so in the report. The image is built for real by the CI `docker` job (Task 8) and on the server.
- **Shell scripts:** LF line endings (enforced by `.gitattributes`, Task 7, and asserted by `tests/unit/deploy-kit.test.ts`). Host scripts (`deploy/*.sh`) start with `#!/usr/bin/env bash` and `set -Eeuo pipefail`; scripts that run inside alpine containers (`docker/entrypoint.sh`, `deploy/cron/*.sh`, `deploy/backup/*.sh`) are POSIX/busybox `sh` with `set -eu`. Quote every expansion, no `eval`, never echo secrets. Windows cannot `chmod`: stage host scripts with `git add <file> && git update-index --chmod=+x <file>`; container scripts are always invoked as `sh <file>` so their mode never matters; the runbook invokes host scripts as `bash deploy/<script>.sh`.
- Never run anything on port 3000 (the owner's preview server). Manual checks use `npx next dev -p 3001` with `NEXT_PUBLIC_SITE_URL=http://localhost:3001` set only in that shell; stop it afterwards and confirm nothing listens on 3001. E2E runs through `npm run test:e2e` (already on port 3001). Revert `tsconfig.json`/`next-env.d.ts` churn from `next dev`/`next build` before committing (never stage them).
- Phase 3 studio internals (`src/components/studio/**`, `src/server/services/designs*`, `src/app/api/designs/**`) are not changed in this phase except for pure layout/tap-target fixes found by the Task 9 audit.
- Stage files explicitly by path (never `git add -A` / `git add .`). Never commit `deploy/.env`, `.audit/`, `.next-standalone/` or `.next-lh/`.
- Every task ends with `npm run lint && npm run typecheck && npm test && npm run build` green. Task 1 also runs `npm run db:test:migrate` before `npm test`. Tasks 7 and 8 also run the Compose `config` validation above. Tasks 9 and 10 also run `npm run test:e2e`.
- Commit messages end with exactly these two lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB`

---

## Existing interfaces this plan consumes

```ts
// ---- Phase 1
// @/server/db: db (PrismaClient)
// @/server/auth: auth() → session with user.id, user.role
// @/server/admin-guard: requireAdmin(): Promise<{ userId: string }>
// src/app/admin/guard.ts: requireAdminPage(): Promise<{ userId: string }>
// @/server/errors: DomainError, NotFoundError(what), ForbiddenError(msg?), UnauthorizedError(msg?), ConflictError(msg),
//   ValidationError(fieldErrors, msg?), RateLimitedError(sec), toHttp(err)
// @/server/action-result: ActionResult<T>, actionError(err), zodFieldErrors(zodError)
// @/server/api: handle(fn), ok(data, init?), parseJson(req, schema), requireApiUser(req) (Authorization: Bearer <token>), RouteCtx
// @/server/api-token: signApiToken({ id, role }): Promise<string>
// @/server/rate-limit: rateLimit(key, limit, windowMs): { ok, retryAfterSec }
// @/server/uploads: storeImage(file, prefix): Promise<{ url, key }>, validateImage(bytes)
// @/server/adapters/storage: getStorage(): StorageAdapter { put(key, bytes, type), delete(key), getPublicUrl(key) }; LOCAL_UPLOAD_ROOT = <cwd>/storage/uploads
// @/server/adapters/storage/local-disk: LocalDiskStorage(root, publicPrefix)   (tests mock getStorage with a tmp root, see tests/unit/admin-images.test.ts)
// @/server/content: readPage(slug) — reads content/pages/<slug>.md
// @/server/services/catalog: ProductCard, ProductDetail, Page<T>, CollectionSummary, getProductBySlug, getCollectionBySlug,
//   listProducts; private cardInclude/toCard (Task 3 adds an exported helper next to them)
// @/server/services/admin-products: AdminProductRow, listAdminProducts(args)
// @/lib/json-ld: jsonLdScript(data)            @/lib/uploads: imageFileError(file), MAX_UPLOAD_BYTES
// @/lib/money: formatPaise, rupeesToPaise, paiseToRupees        @/lib/utils: cn
// @/config/brand: BRAND { name, tagline, supportEmail, social, ... }     @/config/site: SITE_NAV, FOOTER_LINKS
// @/components/motion: useReducedMotionSafe(), Parallax, Marquee, MagneticLink, LenisProvider
// src/components/storefront/{product-card,product-grid,product-purchase,load-more,header,footer,mobile-nav,cart-trigger,filter-rail,gallery}.tsx
// src/components/storefront/home/{hero,ticker,featured-collections,new-drops,customize-teaser,brand-story}.tsx
// src/components/admin/{admin-nav,products-table,hero-uploader,status-badge,field-error}.tsx
// tests/helpers/db: resetDb() (TABLES list)   tests/helpers/fixtures: createCollection, createProduct(over) (variants, images, status)
// tests/e2e/helpers: register(page, email, name?), login(page, email, password?), addFirstProductToBag(page), uniqueEmail(prefix), PASSWORD

// ---- Phase 2 (docs/superpowers/plans/2026-09-30-phase2-commerce-ops.md)
// prisma: Order (status, email, number, shipName, deliveredAt, items), OrderItem (productId?, productName, productSlug, size, colorName,
//   sku, unitPricePaise, quantity, lineTotalPaise), OrderStatus enum (… SHIPPED, DELIVERED …), StoreSetting (id = 1)
// @/lib/validation/common: optionalText(max), phoneSchema         @/lib/validation/settings: settingsInputSchema (z.object), SettingsInput
// @/server/services/settings: getSettings(), updateSettings(input), StoreSettings
// @/server/session-user: requireUserId(): Promise<string>
// @/server/services/order-records: addOrderEvent(tx, orderId, type, message, actorId?), OrderView (items: OrderItemView[])
// @/server/emails/templates: RenderedEmail, siteUrl(); private helpers layout/button/firstName/oneLine and `escapeHtml as e` in the same file
// @/server/services/notifications: sendEmailSafely(msg): Promise<boolean>
// @/server/adapters/email: getEmail(), ConsoleEmail (.sent[])
// @/server/jobs: JOBS, JobName, isJobName, runJob            route POST /api/cron/[job] (Bearer CRON_SECRET)
// @/lib/dates: formatDateIst(date)
// @/server/services/admin-orders: countToShip()
// src/components/admin/admin-nav.tsx: AdminNav({ toShipCount }); Phase 3 makes it AdminNav({ toShipCount, printQueueCount }) with countPrintQueue() in the layout
// src/components/admin/settings-form.tsx: SettingsForm({ settings }) — fieldsets, one "Save settings" button (h-11), toast on success
// src/components/admin/delete-button.tsx: DeleteButton({ label, confirmText, onConfirm, redirectTo })
// src/components/storefront/account/account-nav.tsx: AccountNav() (Overview, Orders, Addresses)
// src/app/(storefront)/checkout/page.tsx (CheckoutView lines, pay bar `pay-button`), src/app/(storefront)/orders/[number]/success/page.tsx
// tests/helpers/fixtures: createUser(over), createOrderRow(userId, over)  (no items; email buyer<n>@example.test)
// tests/e2e/helpers: fillAddressForm(page), checkoutWithMockPayment(page, outcome?), hasNoHorizontalScroll(page)
// e2e test ids: order-row, admin-order, order-status, next-action ("Mark processing" / "Mark shipped" / "Mark delivered"),
//   labels "Carrier", "Tracking number", button "Save & mark shipped"; playwright projects desktop (testIgnore /checkout-mobile/),
//   mobile, reduced-motion, mobile-checkout; playwright.config loads .env via dotenv; webServer env PAYMENT_PROVIDER=mock

// ---- Phase 3 (spec docs/superpowers/specs/2026-09-30-phase3-design-studio-design.md)
// routes /customize, /customize/[slug], /admin/print-queue; cron job "purge-designs" in JOBS (03:30 IST); StoreSetting custom fee fields
//   (added to settingsInputSchema as .optional() keys, so the schema stays a z.object); countPrintQueue(); fabric v6 loaded client-side;
// POST /api/designs accepts up to 30 MB (so Caddy's 50 MB body limit covers it)
```

## File structure

| Path | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify), `prisma/migrations/<ts>_phase4_launch/migration.sql` | Banner, WishlistItem, Review, enums, `Order.reviewRequestedAt`, four `StoreSetting` fields, rating CHECK |
| `src/lib/safe-href.ts`, `src/lib/validation/common.ts` (modify), `src/lib/validation/settings.ts` (modify) | safe link validation, `blankToNull`, new settings fields |
| `src/lib/validation/banner.ts`, `src/lib/banner-schedule.ts`, `src/server/services/banners.ts` | banners and the announcement read |
| `src/app/admin/banners/**`, `src/components/admin/{banner-form,banner-image-uploader,banner-list}.tsx` | banners admin |
| `src/components/storefront/home/hero-banners.tsx`, `src/components/storefront/announcement-bar.tsx`, `src/components/storefront/home/ticker.tsx` (modify), `src/app/(storefront)/page.tsx` (modify), `src/app/(storefront)/layout.tsx` (modify) | storefront banners |
| `src/server/services/wishlist.ts`, `src/server/services/catalog.ts` (modify), `src/app/(storefront)/account/wishlist/**`, `src/app/api/v1/wishlist/**`, `src/components/storefront/{wishlist-context,wishlist-button}.tsx` | wishlist |
| `src/lib/validation/review.ts`, `src/lib/rating.ts`, `src/lib/site-url.ts`, `src/lib/json-ld.ts` (modify), `src/server/services/{reviews,admin-reviews}.ts`, `src/server/jobs/review-request.ts` | reviews and the review-request job |
| `src/components/storefront/reviews/*`, `src/app/(storefront)/products/[slug]/{page.tsx,review-actions.ts}`, `src/app/api/v1/products/[slug]/reviews/route.ts`, `src/app/admin/reviews/**`, `src/components/admin/review-moderation-card.tsx` | reviews UI and API |
| `src/lib/seo.ts`, `src/server/services/seo.ts`, `src/app/{sitemap,robots}.ts`, `src/app/brand-og/route.tsx`, page metadata (modify) | SEO |
| `src/lib/analytics.ts`, `src/components/analytics/{analytics-scripts,track-event,pixel-page-view}.tsx` | optional GA4 / Meta Pixel |
| `src/lib/security-headers.ts`, `next.config.ts` (modify), `src/server/services/health.ts`, `src/app/api/health/route.ts` | headers, CSP, health, standalone |
| `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, `deploy/create-admin.mjs`, `deploy/docker-compose.prod.yml`, `deploy/Caddyfile`, `deploy/crontab`, `deploy/cron/{start,run-job}.sh`, `deploy/backup/backup.sh`, `deploy/.env.production.example`, `.gitattributes`, `.gitignore` (modify) | container stack |
| `deploy/{setup-ec2,deploy,seed-admin,restore}.sh`, `docs/deploy/aws-ec2.md`, `.github/workflows/ci.yml` | server scripts, runbook, CI |
| `tests/e2e/{routes.ts,mobile-layout.spec.ts}`, `tests/audit/mobile-screenshots.spec.ts`, `playwright.audit.config.ts`, `playwright.config.ts` (modify), UI fixes across `src/components/**` and `src/app/**`, `src/app/globals.css` | mobile audit and polish |
| `tests/unit/*` (new), `tests/helpers/{db,fixtures}.ts` (modify), `tests/e2e/growth.spec.ts`, `README.md`, `.env.example` | tests and docs |

---

### Task 1: Schema, migration, settings fields, safe links, fixtures

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/validation/common.ts`, `src/lib/validation/settings.ts`, `tests/helpers/db.ts`, `tests/helpers/fixtures.ts`
- Create: `prisma/migrations/<timestamp>_phase4_launch/migration.sql` (generated, then edited), `src/lib/safe-href.ts`
- Test: `tests/unit/safe-href.test.ts`, `tests/unit/settings-launch.test.ts`, `tests/unit/launch-schema.test.ts`

**Interfaces:**
- Consumes: `optionalText`, `settingsInputSchema`, `getSettings`, `updateSettings` (Phase 2), `createUser`, `createOrderRow`, `createProduct` fixtures, `db`.
- Produces:

```ts
// @/lib/validation/common (added export; Phase 2's private copy in settings.ts is replaced by this import)
export function blankToNull(v: unknown): unknown;                    // undefined / null / "" / whitespace → null
// @/lib/safe-href
export function isSafeHref(href: string): boolean;                   // "/path…" (not "//") or absolute http(s) URL
export function isExternalHref(href: string): boolean;               // anything not starting with "/"
export const safeHrefSchema: ZodType<string>;
// @/lib/validation/settings (added keys; all optional in the input: omitted = unchanged)
//   announcementText: string | null (≤ 140), announcementHref: safe href | null, autoApproveReviews: boolean, reviewRequestsEnabled: boolean
// tests/helpers/fixtures (added)
export function settingsInputFrom(row: StoreSetting): Record<string, unknown>;   // every settingsInputSchema key, read from the row
export function createDeliveredPurchase(userId: string, productId: string, over?: { deliveredAt?: Date; status?: OrderStatus; quantity?: number }):
  Promise<{ order: Order; item: OrderItem }>;
```

- [ ] **Step 1: Schema**

In `prisma/schema.prisma` add the enums and models below and these fields to existing models:
- `User`: `wishlistItems WishlistItem[]` and `reviews Review[]`
- `Product`: `wishlistItems WishlistItem[]` and `reviews Review[]`
- `OrderItem`: `review Review?`
- `Order`: `reviewRequestedAt DateTime?` and `@@index([status, deliveredAt])`
- `StoreSetting`: `announcementText String?`, `announcementHref String?`, `autoApproveReviews Boolean @default(true)`, `reviewRequestsEnabled Boolean @default(true)`

```prisma
enum BannerPlacement {
  HERO
  STRIP
}

enum ReviewStatus {
  PENDING
  APPROVED
  REJECTED
}

model Banner {
  id             String          @id @default(cuid())
  title          String
  subtitle       String?
  ctaLabel       String?
  ctaHref        String?
  imageKey       String?
  mobileImageKey String?
  placement      BannerPlacement @default(HERO)
  sortOrder      Int             @default(0)
  active         Boolean         @default(false)
  startsAt       DateTime?
  endsAt         DateTime?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@index([placement, active, sortOrder])
}

model WishlistItem {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([userId, productId])
  @@index([productId])
}

model Review {
  id          String       @id @default(cuid())
  productId   String
  product     Product      @relation(fields: [productId], references: [id], onDelete: Cascade)
  userId      String
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  orderItemId String       @unique
  orderItem   OrderItem    @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  rating      Int
  title       String?
  body        String       @default("")
  status      ReviewStatus @default(PENDING)
  moderatedAt DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@unique([productId, userId])
  @@index([productId, status, createdAt])
  @@index([status, createdAt])
}
```

Notes: `Banner.imageKey` is a storage key (not a URL), resolved with `getStorage().getPublicUrl(key)` at read time, so switching `STORAGE_DRIVER` later only needs the files copied. It is nullable because STRIP banners are text-only ticker lines; the service requires it before a HERO banner can be switched on (spec: "imageKey (desktop)"). `Review` keeps the spec's `orderItemId @unique` (verified purchase) and adds `@@unique([productId, userId])` so one customer has one review per product even after buying it twice. Cascades: deleting a product deletes its reviews and wishlist rows; users with orders cannot be deleted (Phase 2 `Restrict`), so review authorship is stable.

- [ ] **Step 2: Migration with the rating CHECK**

```bash
npx prisma migrate dev --name phase4_launch --create-only
```

Append to the generated `prisma/migrations/<timestamp>_phase4_launch/migration.sql`:

```sql
-- Ratings are 1–5 stars; enforced in the database as well as in Zod.
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
```

Apply and regenerate:

```bash
npx prisma migrate dev
npm run db:test:migrate
```

(Prisma does not model CHECK constraints, so `migrate dev` reports no drift for it, same as the Phase 2 sequence.)

In `tests/helpers/db.ts` add `"Review", "WishlistItem", "Banner"` at the **front** of `TABLES` (reviews reference order items).

- [ ] **Step 3: Failing tests**

Create `tests/unit/safe-href.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isExternalHref, isSafeHref, safeHrefSchema } from "@/lib/safe-href";

describe("safe links", () => {
  it("accepts internal paths and http(s) URLs", () => {
    for (const ok of ["/", "/collections/new-drops", "/products/a?color=Black#reviews", "https://instagram.com/brand", "http://example.com"]) {
      expect(isSafeHref(ok)).toBe(true);
    }
  });

  it("rejects scripts, protocol-relative and malformed links", () => {
    for (const bad of ["javascript:alert(1)", "//evil.test", "/\\evil.test", "data:text/html,hi", "mailto:a@b.c", "collections", "/a b", "https://"]) {
      expect(isSafeHref(bad)).toBe(false);
    }
  });

  it("classifies external links and trims in the schema", () => {
    expect(isExternalHref("/x")).toBe(false);
    expect(isExternalHref("https://x.test")).toBe(true);
    expect(safeHrefSchema.parse("  /collections/new-drops ")).toBe("/collections/new-drops");
    expect(safeHrefSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });
});
```

Create `tests/unit/settings-launch.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { settingsInputFrom } from "../helpers/fixtures";
import { getSettings, updateSettings } from "@/server/services/settings";
import { ValidationError } from "@/server/errors";

describe("launch settings", () => {
  beforeEach(resetDb);

  it("defaults to no announcement and review automation on", async () => {
    expect(await getSettings()).toMatchObject({ announcementText: null, announcementHref: null, autoApproveReviews: true, reviewRequestsEnabled: true });
  });

  it("saves, trims and clears the announcement", async () => {
    const base = settingsInputFrom(await getSettings());
    const saved = await updateSettings({ ...base, announcementText: "  Free shipping this week  ", announcementHref: " /collections/new-drops ", autoApproveReviews: false });
    expect(saved).toMatchObject({ announcementText: "Free shipping this week", announcementHref: "/collections/new-drops", autoApproveReviews: false, reviewRequestsEnabled: true });
    const cleared = await updateSettings({ ...settingsInputFrom(saved), announcementText: "", announcementHref: "" });
    expect(cleared).toMatchObject({ announcementText: null, announcementHref: null });
  });

  it("leaves the new fields alone when an older form omits them", async () => {
    const s = await getSettings();
    await updateSettings({ ...settingsInputFrom(s), announcementText: "Hello", reviewRequestsEnabled: false });
    const { announcementText, announcementHref, autoApproveReviews, reviewRequestsEnabled, ...older } = settingsInputFrom(await getSettings());
    void announcementText; void announcementHref; void autoApproveReviews; void reviewRequestsEnabled;
    expect(await updateSettings(older)).toMatchObject({ announcementText: "Hello", reviewRequestsEnabled: false });
  });

  it("rejects unsafe or oversized announcement values", async () => {
    const base = settingsInputFrom(await getSettings());
    await expect(updateSettings({ ...base, announcementHref: "javascript:alert(1)" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ ...base, announcementText: "x".repeat(141) })).rejects.toBeInstanceOf(ValidationError);
  });
});
```

Create `tests/unit/launch-schema.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDeliveredPurchase, createProduct, createUser } from "../helpers/fixtures";

describe("phase 4 schema", () => {
  beforeEach(resetDb);

  it("enforces 1–5 ratings and one review per order item", async () => {
    const u = await createUser();
    const p = await createProduct();
    const { item, order } = await createDeliveredPurchase(u.id, p.id);
    expect(order.status).toBe("DELIVERED");
    expect(order.deliveredAt).toBeInstanceOf(Date);
    await expect(db.review.create({ data: { productId: p.id, userId: u.id, orderItemId: item.id, rating: 6 } })).rejects.toThrow();
    await expect(db.review.create({ data: { productId: p.id, userId: u.id, orderItemId: item.id, rating: 0 } })).rejects.toThrow();
    await db.review.create({ data: { productId: p.id, userId: u.id, orderItemId: item.id, rating: 5 } });
    await expect(db.review.create({ data: { productId: p.id, userId: u.id, orderItemId: item.id, rating: 4 } })).rejects.toThrow();
  });

  it("keeps one wishlist row per user and product and cascades product deletes", async () => {
    const u = await createUser();
    const p = await createProduct();
    await db.wishlistItem.create({ data: { userId: u.id, productId: p.id } });
    await expect(db.wishlistItem.create({ data: { userId: u.id, productId: p.id } })).rejects.toThrow();
    await db.product.delete({ where: { id: p.id } });
    expect(await db.wishlistItem.count()).toBe(0);
  });
});
```

Run: `npm test -- tests/unit/safe-href.test.ts tests/unit/settings-launch.test.ts tests/unit/launch-schema.test.ts`
Expected: FAIL (modules and fixtures missing).

- [ ] **Step 4: Implement**

Create `src/lib/safe-href.ts`:

```ts
import { z } from "zod";

/** Internal paths ("/collections/x?y=1#z") or absolute http(s) URLs. Never javascript:, data:, mailto: or protocol-relative "//host". */
export function isSafeHref(href: string): boolean {
  const s = href.trim();
  if (s.startsWith("/")) return !s.startsWith("//") && !s.startsWith("/\\") && !/[\s<>"'`]/.test(s);
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isExternalHref(href: string): boolean {
  return !href.trim().startsWith("/");
}

export const safeHrefSchema = z
  .string()
  .trim()
  .max(300, "Keep links under 300 characters")
  .refine(isSafeHref, "Use a path like /collections/new-drops or a full https:// link");
```

In `src/lib/validation/common.ts` add (and delete the private `blankToNull` const from `src/lib/validation/settings.ts`, importing this one instead):

```ts
/** Form helper: undefined, null, "" and whitespace-only strings become null. */
export function blankToNull(v: unknown): unknown {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;
}
```

In `src/lib/validation/settings.ts` import `safeHrefSchema` and `optionalText`/`blankToNull`, and add these keys inside the existing `z.object({ … })` (keep Phase 2 and Phase 3 keys as they are; `.optional()` wraps each so an omitted key leaves the column unchanged, because `ZodOptional` returns `undefined` before the inner preprocess runs):

```ts
  announcementText: optionalText(140).optional(),
  announcementHref: z.preprocess(blankToNull, safeHrefSchema.nullable()).optional(),
  autoApproveReviews: z.boolean().optional(),
  reviewRequestsEnabled: z.boolean().optional(),
```

`updateSettings` needs no change (Prisma ignores `undefined` keys in `data`).

Append to `tests/helpers/fixtures.ts` (add `Order`, `OrderItem`, `OrderStatus`, `StoreSetting` to the `@prisma/client` type import and import `settingsInputSchema`):

```ts
/** A complete, valid settings input built from a stored row (robust to keys added by later phases). */
export function settingsInputFrom(row: StoreSetting): Record<string, unknown> {
  const keys = Object.keys(settingsInputSchema.shape) as (keyof StoreSetting)[];
  return Object.fromEntries(keys.map((k) => [k, row[k]]));
}

/** An order (default DELIVERED, delivered now) with one item for the product's first variant. */
export async function createDeliveredPurchase(
  userId: string,
  productId: string,
  over: { deliveredAt?: Date; status?: OrderStatus; quantity?: number } = {},
): Promise<{ order: Order; item: OrderItem }> {
  const product = await db.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: { orderBy: { sortOrder: "asc" }, take: 1 } } });
  const status = over.status ?? "DELIVERED";
  const created = await createOrderRow(userId, { status });
  const deliveredAt = status === "DELIVERED" ? over.deliveredAt ?? new Date() : null;
  const order = await db.order.update({ where: { id: created.id }, data: { deliveredAt, shippedAt: deliveredAt } });
  const v = product.variants[0];
  const quantity = over.quantity ?? 1;
  const unit = v?.pricePaise ?? product.basePricePaise;
  const item = await db.orderItem.create({
    data: {
      orderId: order.id, productId, variantId: v?.id ?? null, productName: product.name, productSlug: product.slug,
      size: v?.size ?? "M", colorName: v?.colorName ?? "Black", sku: v?.sku ?? `SKU-${order.id}`,
      unitPricePaise: unit, quantity, lineTotalPaise: unit * quantity,
    },
  });
  return { order, item };
}
```

(If Phase 3 wrapped `settingsInputSchema` in `.superRefine`, read the keys from `settingsInputSchema._def.schema.shape` instead.)

- [ ] **Step 5: Verify and commit**

Run the three test files (GREEN), then `npm run lint && npm run typecheck && npm test && npm run build`.

```bash
git add prisma/schema.prisma prisma/migrations src/lib/safe-href.ts src/lib/validation/common.ts src/lib/validation/settings.ts tests/helpers/db.ts tests/helpers/fixtures.ts tests/unit/safe-href.test.ts tests/unit/settings-launch.test.ts tests/unit/launch-schema.test.ts
git commit -m "feat(launch): add banner, wishlist and review schema with announcement and review settings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 2: Homepage banners admin, hero carousel, ticker strip, announcement bar

**Files:**
- Create: `src/lib/validation/banner.ts`, `src/lib/banner-schedule.ts`, `src/server/services/banners.ts`, `src/app/admin/banners/page.tsx`, `src/app/admin/banners/new/page.tsx`, `src/app/admin/banners/[id]/page.tsx`, `src/app/admin/banners/actions.ts`, `src/components/admin/banner-form.tsx`, `src/components/admin/banner-image-uploader.tsx`, `src/components/admin/banner-list.tsx`, `src/components/storefront/home/hero-banners.tsx`, `src/components/storefront/announcement-bar.tsx`
- Modify: `src/app/(storefront)/page.tsx`, `src/components/storefront/home/ticker.tsx`, `src/app/(storefront)/layout.tsx`, `src/components/admin/admin-nav.tsx` (Banners item), `src/components/admin/settings-form.tsx` (Storefront fieldset)
- Test: `tests/unit/banner-schedule.test.ts`, `tests/unit/banners.test.ts`

**Interfaces:**
- Consumes: `blankToNull`, `optionalText`, `safeHrefSchema`, `isExternalHref` (Task 1), `storeImage`, `getStorage`, `zodFieldErrors`, `ValidationError`, `NotFoundError`, `requireAdmin`, `requireAdminPage`, `actionError`, `DeleteButton`, `FieldError`, `imageFileError`, `useReducedMotionSafe`, `Marquee`.
- Produces:

```ts
// @/lib/validation/banner
export const BANNER_PLACEMENTS: readonly ["HERO", "STRIP"];
export const bannerInputSchema: ZodType;  export type BannerInput = z.input<typeof bannerInputSchema>;
// @/lib/banner-schedule
export type BannerState = "live" | "scheduled" | "expired" | "off";
export function bannerState(b: { active: boolean; startsAt: Date | null; endsAt: Date | null }, now?: Date): BannerState;
export const BANNER_STATE_LABEL: Record<BannerState, string>;
// @/server/services/banners
export type BannerSlot = "desktop" | "mobile";
export interface BannerView { id: string; title: string; subtitle: string | null; ctaLabel: string | null; ctaHref: string | null;
  imageUrl: string | null; mobileImageUrl: string | null; placement: "HERO" | "STRIP" }
export interface AdminBannerRow extends BannerView { active: boolean; sortOrder: number; startsAt: Date | null; endsAt: Date | null; state: BannerState }
export interface Announcement { text: string; href: string | null }
export function getLiveBanners(now?: Date): Promise<{ hero: BannerView[]; strip: BannerView[] }>;
export function getAnnouncement(): Promise<Announcement | null>;
export function listAdminBanners(now?: Date): Promise<AdminBannerRow[]>;
export function getAdminBanner(id: string): Promise<AdminBannerRow>;
export function createBanner(input: unknown): Promise<{ id: string }>;
export function updateBanner(id: string, input: unknown): Promise<void>;
export function deleteBanner(id: string): Promise<void>;
export function moveBanner(id: string, direction: "up" | "down"): Promise<void>;
export function setBannerImage(id: string, slot: BannerSlot, file: File | null): Promise<{ url: string | null }>;
// src/app/admin/banners/actions.ts (all: requireAdmin, service, revalidatePath("/", "layout"), ActionResult)
export function saveBannerAction(id: string | null, input: BannerInput): Promise<ActionResult<{ id: string }>>;
export function deleteBannerAction(id: string): Promise<ActionResult<null>>;
export function moveBannerAction(id: string, direction: "up" | "down"): Promise<ActionResult<null>>;
export function setBannerImageAction(id: string, slot: BannerSlot, formData: FormData | null): Promise<ActionResult<{ url: string | null }>>;
// components
export function HeroBanners(props: { banners: BannerView[] }): JSX.Element;          // client
export function AnnouncementBar(props: { announcement: Announcement }): JSX.Element;  // server
export function Ticker(props: { items?: string[] }): JSX.Element;                      // default = current static items
export function BannerForm(props: { banner: AdminBannerRow | null }): JSX.Element;
export function BannerImageUploader(props: { bannerId: string; slot: BannerSlot; url: string | null; label: string; hint: string }): JSX.Element;
export function BannerList(props: { rows: AdminBannerRow[]; empty: string }): JSX.Element;
```

Rules: **HERO** banners are image slides in the homepage hero carousel (title, optional subtitle, optional button); a HERO banner can only be active once it has a desktop image; the phone image is optional (falls back to the desktop image). **STRIP** banners are short text lines that replace the static items of the scrolling ticker under the hero (image and button fields are hidden in the form and stored as null). A banner is live when `active` and `startsAt ≤ now < endsAt` (both optional). Ordering is per placement with Up/Down buttons (no drag). When no live HERO banner exists the current static `<Hero />` renders unchanged; when no live STRIP banner exists the ticker shows its current static items. The announcement bar (text + optional link from Settings) renders above the header on every storefront page when the text is set.

- [ ] **Step 1: Failing tests**

Create `tests/unit/banner-schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bannerState } from "@/lib/banner-schedule";

const now = new Date("2026-10-10T10:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * 3_600_000);

describe("bannerState", () => {
  it("is off when inactive regardless of dates", () => {
    expect(bannerState({ active: false, startsAt: null, endsAt: null }, now)).toBe("off");
  });
  it("respects the start and end window (end exclusive)", () => {
    expect(bannerState({ active: true, startsAt: null, endsAt: null }, now)).toBe("live");
    expect(bannerState({ active: true, startsAt: at(1), endsAt: null }, now)).toBe("scheduled");
    expect(bannerState({ active: true, startsAt: at(-1), endsAt: at(1) }, now)).toBe("live");
    expect(bannerState({ active: true, startsAt: null, endsAt: now }, now)).toBe("expired");
  });
});
```

Create `tests/unit/banners.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

const root = mkdtempSync(join(tmpdir(), "banners-"));
const storage = new LocalDiskStorage(root, "/api/uploads");
vi.mock("@/server/adapters/storage", async (orig) => ({ ...(await orig<typeof import("@/server/adapters/storage")>()), getStorage: () => storage }));

import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import {
  createBanner, deleteBanner, getAnnouncement, getLiveBanners, listAdminBanners, moveBanner, setBannerImage, updateBanner,
} from "@/server/services/banners";
import { ValidationError } from "@/server/errors";

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "a.png", { type: "image/png" });
const hero = (over: Record<string, unknown> = {}) => ({ title: "Monsoon drop", subtitle: "", ctaLabel: "Shop now", ctaHref: "/collections/new-drops", placement: "HERO", active: false, startsAt: "", endsAt: "", ...over });
const strip = (title: string, over: Record<string, unknown> = {}) => ({ title, placement: "STRIP", active: true, startsAt: null, endsAt: null, ...over });
const fileOf = (url: string) => join(root, url.replace("/api/uploads/", ""));

describe("banners service", () => {
  beforeEach(resetDb);

  it("validates input", async () => {
    await expect(createBanner(hero({ ctaHref: "javascript:alert(1)" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createBanner(hero({ ctaHref: "" }))).rejects.toBeInstanceOf(ValidationError);   // label without link
    await expect(createBanner(hero({ startsAt: "2026-10-10T10:00:00Z", endsAt: "2026-10-09T10:00:00Z" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createBanner(hero({ title: "x" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("needs a desktop image before a hero slide can go live", async () => {
    await expect(createBanner(hero({ active: true }))).rejects.toBeInstanceOf(ValidationError);
    const { id } = await createBanner(hero());
    await expect(updateBanner(id, hero({ active: true }))).rejects.toBeInstanceOf(ValidationError);
    const { url } = await setBannerImage(id, "desktop", png());
    expect(url).toMatch(new RegExp(`^/api/uploads/banners/${id}/`));
    expect(existsSync(fileOf(url!))).toBe(true);
    await updateBanner(id, hero({ active: true }));
    const { hero: slides } = await getLiveBanners();
    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({ title: "Monsoon drop", imageUrl: url, mobileImageUrl: null, ctaHref: "/collections/new-drops" });
    await expect(setBannerImage(id, "desktop", null)).rejects.toBeInstanceOf(ValidationError);
  });

  it("replaces and removes stored files", async () => {
    const { id } = await createBanner(hero());
    const first = (await setBannerImage(id, "mobile", png())).url!;
    const second = (await setBannerImage(id, "mobile", png())).url!;
    expect(existsSync(fileOf(first))).toBe(false);
    expect(existsSync(fileOf(second))).toBe(true);
    expect(await setBannerImage(id, "mobile", null)).toEqual({ url: null });
    expect(existsSync(fileOf(second))).toBe(false);
    const desktop = (await setBannerImage(id, "desktop", png())).url!;
    await deleteBanner(id);
    expect(existsSync(fileOf(desktop))).toBe(false);
    expect(await db.banner.count()).toBe(0);
  });

  it("shows only live banners, strip lines without images, in order", async () => {
    const now = new Date();
    await createBanner(strip("Free delivery over ₹999"));
    await createBanner(strip("Hidden", { active: false }));
    await createBanner(strip("Later", { startsAt: new Date(now.getTime() + 3_600_000).toISOString() }));
    await createBanner(strip("Ended", { endsAt: new Date(now.getTime() - 1000).toISOString() }));
    await createBanner(strip("Second line"));
    const { strip: lines, hero: slides } = await getLiveBanners(now);
    expect(lines.map((b) => b.title)).toEqual(["Free delivery over ₹999", "Second line"]);
    expect(slides).toEqual([]);
    expect((await listAdminBanners(now)).map((b) => b.state)).toEqual(["live", "off", "scheduled", "expired", "live"]);
  });

  it("moves banners within their placement and ignores moves past the ends", async () => {
    const a = await createBanner(strip("A"));
    const b = await createBanner(strip("B"));
    const c = await createBanner(strip("C"));
    await moveBanner(c.id, "up");
    await moveBanner(a.id, "up");
    const titles = async () => (await getLiveBanners()).strip.map((x) => x.title);
    expect(await titles()).toEqual(["A", "C", "B"]);
    await moveBanner(b.id, "down");
    expect(await titles()).toEqual(["A", "C", "B"]);
  });

  it("reads the announcement from settings", async () => {
    expect(await getAnnouncement()).toBeNull();
    await db.storeSetting.upsert({ where: { id: 1 }, update: { announcementText: "Sale", announcementHref: "/collections/new-drops" }, create: { id: 1, announcementText: "Sale", announcementHref: "/collections/new-drops" } });
    expect(await getAnnouncement()).toEqual({ text: "Sale", href: "/collections/new-drops" });
  });
});
```

Run: `npm test -- tests/unit/banner-schedule.test.ts tests/unit/banners.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Validation, schedule and service**

Create `src/lib/validation/banner.ts`:

```ts
import { z } from "zod";
import { safeHrefSchema } from "@/lib/safe-href";
import { blankToNull, optionalText } from "@/lib/validation/common";

export const BANNER_PLACEMENTS = ["HERO", "STRIP"] as const;

const when = z.preprocess(blankToNull, z.coerce.date({ invalid_type_error: "Enter a valid date" }).nullable());

export const bannerInputSchema = z
  .object({
    title: z.string().trim().min(2, "Enter a title").max(80, "Keep the title under 80 characters"),
    subtitle: optionalText(160),
    ctaLabel: optionalText(30),
    ctaHref: z.preprocess(blankToNull, safeHrefSchema.nullable()),
    placement: z.enum(BANNER_PLACEMENTS),
    active: z.boolean(),
    startsAt: when,
    endsAt: when,
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
    }
    if (v.placement === "HERO" && Boolean(v.ctaLabel) !== Boolean(v.ctaHref)) {
      ctx.addIssue({ code: "custom", path: [v.ctaLabel ? "ctaHref" : "ctaLabel"], message: v.ctaLabel ? "Add a link for the button" : "Add a label for the button" });
    }
  });

export type BannerInput = z.input<typeof bannerInputSchema>;
```

Create `src/lib/banner-schedule.ts`:

```ts
export type BannerState = "live" | "scheduled" | "expired" | "off";

export const BANNER_STATE_LABEL: Record<BannerState, string> = { live: "Live", scheduled: "Scheduled", expired: "Ended", off: "Off" };

export function bannerState(b: { active: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date = new Date()): BannerState {
  if (!b.active) return "off";
  if (b.startsAt && b.startsAt > now) return "scheduled";
  if (b.endsAt && b.endsAt <= now) return "expired";
  return "live";
}
```

Create `src/server/services/banners.ts`:

```ts
import type { Banner, BannerPlacement } from "@prisma/client";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getStorage } from "@/server/adapters/storage";
import { storeImage } from "@/server/uploads";
import { bannerState, type BannerState } from "@/lib/banner-schedule";
import { bannerInputSchema } from "@/lib/validation/banner";

export type BannerSlot = "desktop" | "mobile";

export interface BannerView {
  id: string; title: string; subtitle: string | null; ctaLabel: string | null; ctaHref: string | null;
  imageUrl: string | null; mobileImageUrl: string | null; placement: BannerPlacement;
}
export interface AdminBannerRow extends BannerView { active: boolean; sortOrder: number; startsAt: Date | null; endsAt: Date | null; state: BannerState }
export interface Announcement { text: string; href: string | null }

const publicUrl = (key: string | null) => (key ? getStorage().getPublicUrl(key) : null);

function toView(b: Banner): BannerView {
  return {
    id: b.id, title: b.title, subtitle: b.subtitle, ctaLabel: b.ctaLabel, ctaHref: b.ctaHref,
    imageUrl: publicUrl(b.imageKey), mobileImageUrl: publicUrl(b.mobileImageKey), placement: b.placement,
  };
}

function toAdmin(b: Banner, now: Date): AdminBannerRow {
  return { ...toView(b), active: b.active, sortOrder: b.sortOrder, startsAt: b.startsAt, endsAt: b.endsAt, state: bannerState(b, now) };
}

function parse(input: unknown) {
  const r = bannerInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  const d = r.data;
  // Strip lines are text-only ticker items.
  return d.placement === "STRIP" ? { ...d, subtitle: null, ctaLabel: null, ctaHref: null } : d;
}

function assertActivatable(placement: BannerPlacement, active: boolean, imageKey: string | null): void {
  if (placement === "HERO" && active && !imageKey) {
    throw new ValidationError({ active: ["Upload a desktop image before switching this slide on"] }, "Upload a desktop image before switching this slide on");
  }
}

async function nextSortOrder(placement: BannerPlacement): Promise<number> {
  const max = await db.banner.aggregate({ where: { placement }, _max: { sortOrder: true } });
  return (max._max.sortOrder ?? -1) + 1;
}

async function removeFiles(keys: (string | null)[]): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      await getStorage().delete(key);
    } catch (err) {
      console.error("[banners] could not delete stored file", key, err);
    }
  }
}

export async function getLiveBanners(now: Date = new Date()): Promise<{ hero: BannerView[]; strip: BannerView[] }> {
  const rows = await db.banner.findMany({
    where: {
      active: true,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return {
    hero: rows.filter((b) => b.placement === "HERO" && b.imageKey).map(toView),
    strip: rows.filter((b) => b.placement === "STRIP").map(toView),
  };
}

/** Read-only (no lazy create): the storefront layout calls this on every request. */
export async function getAnnouncement(): Promise<Announcement | null> {
  const s = await db.storeSetting.findUnique({ where: { id: 1 }, select: { announcementText: true, announcementHref: true } });
  return s?.announcementText ? { text: s.announcementText, href: s.announcementHref } : null;
}

export async function listAdminBanners(now: Date = new Date()): Promise<AdminBannerRow[]> {
  const rows = await db.banner.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map((b) => toAdmin(b, now));
}

export async function getAdminBanner(id: string): Promise<AdminBannerRow> {
  const b = await db.banner.findUnique({ where: { id } });
  if (!b) throw new NotFoundError("Banner");
  return toAdmin(b, new Date());
}

export async function createBanner(input: unknown): Promise<{ id: string }> {
  const data = parse(input);
  assertActivatable(data.placement, data.active, null);
  const row = await db.banner.create({ data: { ...data, sortOrder: await nextSortOrder(data.placement) } });
  return { id: row.id };
}

export async function updateBanner(id: string, input: unknown): Promise<void> {
  const data = parse(input);
  const current = await db.banner.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Banner");
  assertActivatable(data.placement, data.active, current.imageKey);
  const sortOrder = data.placement === current.placement ? current.sortOrder : await nextSortOrder(data.placement);
  await db.banner.update({ where: { id }, data: { ...data, sortOrder } });
}

export async function deleteBanner(id: string): Promise<void> {
  const b = await db.banner.findUnique({ where: { id } });
  if (!b) throw new NotFoundError("Banner");
  await db.banner.delete({ where: { id } });
  await removeFiles([b.imageKey, b.mobileImageKey]);
}

export async function moveBanner(id: string, direction: "up" | "down"): Promise<void> {
  const b = await db.banner.findUnique({ where: { id }, select: { placement: true } });
  if (!b) throw new NotFoundError("Banner");
  const ids = (await db.banner.findMany({ where: { placement: b.placement }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } })).map((s) => s.id);
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await db.$transaction(ids.map((bannerId, index) => db.banner.update({ where: { id: bannerId }, data: { sortOrder: index } })));
}

export async function setBannerImage(id: string, slot: BannerSlot, file: File | null): Promise<{ url: string | null }> {
  const b = await db.banner.findUnique({ where: { id } });
  if (!b) throw new NotFoundError("Banner");
  const previous = slot === "desktop" ? b.imageKey : b.mobileImageKey;
  const field = slot === "desktop" ? "imageKey" : "mobileImageKey";
  if (!file) {
    if (slot === "desktop" && b.placement === "HERO" && b.active) {
      throw new ValidationError({ file: ["Switch the slide off before removing its desktop image"] }, "Switch the slide off before removing its desktop image");
    }
    await db.banner.update({ where: { id }, data: { [field]: null } });
    await removeFiles([previous]);
    return { url: null };
  }
  const { key } = await storeImage(file, `banners/${id}`);
  try {
    await db.banner.update({ where: { id }, data: { [field]: key } });
  } catch (err) {
    await removeFiles([key]);
    throw err;
  }
  await removeFiles([previous]);
  return { url: publicUrl(key) };
}
```

Run the two test files: GREEN.

- [ ] **Step 3: Admin actions and pages**

Create `src/app/admin/banners/actions.ts` (`"use server"`) with the four signatures under Interfaces, copying the shape of `src/app/admin/products/actions.ts`: `await requireAdmin()` first, the service call, `revalidatePath("/", "layout")`, `{ ok: true, data }`, `catch (err) { return actionError(err); }`. `saveBannerAction` returns `{ id }` (`id ? (await updateBanner(id, input), { id }) : await createBanner(input)`). `setBannerImageAction` reads `formData?.get("file")`; when `formData` is non-null and the value is not a `File`, throw `new ValidationError({ file: ["Choose an image"] })`; then `setBannerImage(id, slot, file ?? null)`. `slot` is checked with `slot === "desktop" || slot === "mobile"` (else `ValidationError`), `direction` likewise.

`src/app/admin/banners/page.tsx` (server; `export const metadata = { title: "Banners" }`): `await requireAdminPage()`, `const rows = await listAdminBanners()`. Header row: `h1 className="text-4xl sm:text-5xl"` "Banners" and a **New banner** button (`h-11`, `render={<Link href="/admin/banners/new" />}` + `nativeButton={false}`, `data-testid="new-banner"`). Two sections, each `h2 className="text-2xl"` + one muted sentence:
- **Hero slides** — "Full-width image slides at the top of the homepage. With none live, the homepage shows the default hero." → `<BannerList rows={rows.filter((r) => r.placement === "HERO")} empty="No hero slides yet." />`
- **Ticker lines** — "Short lines in the scrolling strip under the hero. With none live, the default lines show." → `<BannerList rows={rows.filter((r) => r.placement === "STRIP")} empty="No ticker lines yet." />`

`src/components/admin/banner-list.tsx` (client): `<ul className="divide-y divide-border rounded-md border border-border">`, one `<li data-testid="banner-row" className="flex items-center gap-3 p-3">` per row: a 64 × 40 thumbnail (`next/image`, `sizes="64px"`, `object-cover`; for STRIP a neutral block with the `Type` lucide icon), then `min-w-0 flex-1` with the title (`truncate font-medium`) and a second line: a state pill (`BANNER_STATE_LABEL[row.state]`, `bg-brand text-brand-ink` for live, `bg-surface-raised` for scheduled, muted border for off/ended) plus the window (`formatDateIst(startsAt)`–`formatDateIst(endsAt)` when set). Right side: two icon buttons `size-11` with `ChevronUp`/`ChevronDown`, `aria-label={`Move ${row.title} up`}` / `…down`, disabled at the ends, calling `moveBannerAction` in `useTransition` then `router.refresh()` (toast the error message on failure); and an **Edit** link (`min-h-11 inline-flex items-center px-3`, `href={`/admin/banners/${row.id}`}`). Empty list: `<p className="rounded-md border border-dashed border-border p-6 text-sm text-text-muted">{empty}</p>`.

`src/app/admin/banners/new/page.tsx`: guard, `h1` "New banner", `<BannerForm banner={null} />`.

`src/app/admin/banners/[id]/page.tsx`: guard, `getAdminBanner(id)` (`notFound()` on `NotFoundError`), `h1` = the title, `<BannerForm banner={banner} />`; for HERO banners two uploaders side by side on `md` (stacked on phones):
`<BannerImageUploader bannerId={banner.id} slot="desktop" url={banner.imageUrl} label="Desktop image" hint="1920 × 820 px, PNG/JPG/WebP up to 5 MB. Required before the slide can go live." />` and `<BannerImageUploader … slot="mobile" url={banner.mobileImageUrl} label="Phone image (optional)" hint="1080 × 1350 px portrait. Without it phones get a crop of the desktop image." />`; then `<DeleteButton label="Delete banner" confirmText={`Delete “${banner.title}”? This cannot be undone.`} onConfirm={deleteBannerAction.bind(null, banner.id)} redirectTo="/admin/banners" />`.

`src/components/admin/banner-image-uploader.tsx` (client): copy `src/components/admin/hero-uploader.tsx` exactly (hidden file input, `imageFileError` pre-flight, FormData with `file`, toast, `router.refresh()`), calling `setBannerImageAction(bannerId, slot, fd)`; preview box `aspect-[1920/820]` for desktop and `aspect-[4/5] max-w-40` for mobile; `data-testid={`banner-image-${slot}`}`; Upload/Replace and Remove buttons `h-11`.

`src/components/admin/banner-form.tsx` (client), `data-testid="banner-form"`, one `useState` object of values, submit → `saveBannerAction(banner?.id ?? null, values)` inside `useTransition`; on success: new banner → `toast.success(values.placement === "HERO" ? "Slide created. Upload an image to switch it on." : "Ticker line created")` and `router.push(`/admin/banners/${id}`)`; existing → `toast.success("Banner saved")` + `router.refresh()`; on failure show `FieldError`s per field and `toast.error(message)`. Fields, in order (all inputs `h-11`, labels visible):
1. **Placement** — `<fieldset>` with two radio options wrapped in `<label className="flex min-h-11 items-center gap-3">`: "Hero slide (image)" (`HERO`) and "Ticker line (text)" (`STRIP`).
2. **Title** (`maxLength={80}`), hint "Big headline on the slide" / "The ticker text".
3. HERO only: **Subtitle** (`maxLength={160}`), **Button label** (`maxLength={30}`), **Button link** (`inputMode="url"`, placeholder `/collections/new-drops`).
4. **Starts** and **Ends** — `type="datetime-local"`, optional; converted on submit with `value ? new Date(value).toISOString() : null` (browser local time → ISO, as Phase 2 does for coupons); prefilled from `startsAt`/`endsAt` with a local `toLocalInputValue(date)` helper (`yyyy-MM-ddTHH:mm` from local getters).
5. **Show on the site** — checkbox in a `min-h-11` label. For a HERO banner without `imageUrl` render it disabled with the hint "Upload a desktop image first".
6. **Save banner** (`h-11 w-full sm:w-auto`), sticky at the bottom on phones (`sticky bottom-0 -mx-4 border-t border-border bg-bg p-4 pb-safe sm:static sm:m-0 sm:border-0 sm:p-0`; `pb-safe` is added in Task 9, so until then it is a harmless unknown class).

`src/components/admin/admin-nav.tsx`: add `{ href: "/admin/banners", label: "Banners", icon: Images }` (lucide `Images`) directly before **Settings**.

`src/components/admin/settings-form.tsx`: add a `<fieldset>` **Storefront** (before *Notifications*) with **Announcement text** (`maxLength={140}`, live counter `{n}/140`, hint "Shown in a bar above the header on every page. Leave empty to hide it.") and **Announcement link** (optional, `inputMode="url"`, placeholder `/collections/new-drops`); add both keys to the form's value state (from `settings.announcementText ?? ""` / `settings.announcementHref ?? ""`) and to the object sent to `saveSettingsAction`.

- [ ] **Step 4: Storefront**

`src/components/storefront/home/ticker.tsx`: rename the constant to `DEFAULT_TICKER_ITEMS` and change the signature to `export function Ticker({ items = DEFAULT_TICKER_ITEMS }: { items?: string[] })`, mapping `items` exactly as today (keys by index + text since admin text may repeat).

Create `src/components/storefront/announcement-bar.tsx`:

```tsx
import Link from "next/link";
import { isExternalHref } from "@/lib/safe-href";
import type { Announcement } from "@/server/services/banners";

const BAR = "container-x flex min-h-11 items-center justify-center py-2 text-center text-sm font-medium";

export function AnnouncementBar({ announcement }: { announcement: Announcement }) {
  const text = <span className="line-clamp-2">{announcement.text}</span>;
  const { href } = announcement;
  return (
    <div className="bg-brand text-brand-ink" data-testid="announcement-bar">
      {!href ? (
        <p className={BAR}>{text}</p>
      ) : isExternalHref(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`${BAR} underline-offset-4 hover:underline`}>{text}</a>
      ) : (
        <Link href={href} className={`${BAR} underline-offset-4 hover:underline`}>{text}</Link>
      )}
    </div>
  );
}
```

`src/app/(storefront)/layout.tsx`: add `getAnnouncement()` to the existing `Promise.all` and render `{announcement && <AnnouncementBar announcement={announcement} />}` immediately before `<Header …/>` (the bar scrolls away; the header stays sticky).

Create `src/components/storefront/home/hero-banners.tsx` (client). Art direction uses `getImageProps` + `<picture>` (Next's documented pattern) so phones download only the phone image; the first slide is `priority`:

```tsx
"use client";

import { getImageProps } from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotionSafe } from "@/components/motion";
import { isExternalHref } from "@/lib/safe-href";
import { cn } from "@/lib/utils";
import type { BannerView } from "@/server/services/banners";

const AUTO_ADVANCE_MS = 6000;
const CTA = "mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-8 py-3 font-display text-xl tracking-wide text-brand-ink transition-colors hover:bg-[#e6ff7a]";

function Slide({ banner, index, total }: { banner: BannerView; index: number; total: number }) {
  const common = { alt: "", sizes: "100vw", priority: index === 0, quality: 80 };
  const desktop = getImageProps({ ...common, src: banner.imageUrl!, width: 1920, height: 820 }).props;
  const mobile = getImageProps({ ...common, src: banner.mobileImageUrl ?? banner.imageUrl!, width: 1080, height: 1350 }).props;
  const cta = banner.ctaHref && banner.ctaLabel ? { href: banner.ctaHref, label: banner.ctaLabel } : null;
  const testId = index === 0 ? "hero-cta" : undefined;
  return (
    <div role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${total}`} className="relative h-full w-full shrink-0 snap-start" data-testid="hero-slide">
      <picture>
        <source media="(min-width: 768px)" srcSet={desktop.srcSet} sizes="100vw" />
        {/* eslint-disable-next-line @next/next/no-img-element -- art-directed <picture> built with getImageProps */}
        <img {...mobile} alt="" className="absolute inset-0 size-full object-cover" />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" aria-hidden="true" />
      <div className="container-x relative flex h-full flex-col justify-end pb-16 md:pb-20">
        <h2 className="max-w-3xl text-[14vw] leading-[0.85] sm:text-7xl lg:text-8xl">{banner.title}</h2>
        {banner.subtitle && <p className="mt-3 max-w-md text-base text-text-muted md:text-lg">{banner.subtitle}</p>}
        {cta && (isExternalHref(cta.href)
          ? <a href={cta.href} target="_blank" rel="noopener noreferrer" className={CTA} data-testid={testId}>{cta.label}</a>
          : <Link href={cta.href} className={CTA} data-testid={testId}>{cta.label}</Link>)}
      </div>
    </div>
  );
}

export function HeroBanners({ banners }: { banners: BannerView[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotionSafe();

  const go = useCallback((i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  }, [reduced]);

  useEffect(() => {
    if (reduced || paused || banners.length < 2) return;
    const t = window.setTimeout(() => go((active + 1) % banners.length), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [active, paused, reduced, banners.length, go]);

  const onScroll = () => {
    const el = track.current;
    if (el) setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative border-b border-border"
      data-testid="hero"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div
        ref={track}
        onScroll={onScroll}
        className="flex h-[78dvh] max-h-[760px] min-h-[480px] snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-live={paused || reduced ? "polite" : "off"}
      >
        {banners.map((b, i) => <Slide key={b.id} banner={b} index={i} total={banners.length} />)}
      </div>
      {banners.length > 1 && (
        <div className="absolute inset-x-0 bottom-1 flex justify-center">
          {banners.map((b, i) => (
            <button key={b.id} type="button" onClick={() => go(i)} aria-label={`Show slide ${i + 1}`} aria-current={i === active ? "true" : undefined} className="flex size-11 items-center justify-center">
              <span className={cn("block h-1.5 rounded-full transition-all", i === active ? "w-6 bg-text" : "w-1.5 bg-text/40")} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
```

`src/app/(storefront)/page.tsx` becomes async; keep the metadata; render:

```tsx
export default async function HomePage() {
  const { hero, strip } = await getLiveBanners();
  return (
    <>
      {hero.length > 0 ? (
        <>
          <h1 className="sr-only">{BRAND.name} — {BRAND.tagline}</h1>
          <HeroBanners banners={hero} />
        </>
      ) : (
        <Hero />
      )}
      <Ticker items={strip.length > 0 ? strip.map((b) => b.title) : undefined} />
      <FeaturedCollections />
      <NewDrops />
      <CustomizeTeaser />
      <BrandStory />
    </>
  );
}
```

(The existing `home.spec.ts` keeps passing: the sr-only `h1` contains the tagline "Wear what you mean.", `hero`/`hero-cta` test ids are kept on the carousel.)

- [ ] **Step 5: Verify and commit**

Run the two test files, then the full gate. Manual check on port 3001 as admin: create a HERO slide, upload a desktop image, switch it on → the homepage shows the slide (at 360 px the phone crop fills the hero, the dots are 44 px targets, no sideways page scroll); add a second slide → auto-advance every 6 s, pauses on touch; reorder with Up/Down; add a ticker line → the ticker shows only admin lines; set an announcement in Settings → the bar shows above the header on every storefront page and its link works; delete everything and clear the announcement → the static hero and ticker are back. Stop the server.

```bash
git add src/lib/validation/banner.ts src/lib/banner-schedule.ts src/server/services/banners.ts src/app/admin/banners src/components/admin/banner-form.tsx src/components/admin/banner-image-uploader.tsx src/components/admin/banner-list.tsx src/components/admin/admin-nav.tsx src/components/admin/settings-form.tsx src/components/storefront/home/hero-banners.tsx src/components/storefront/home/ticker.tsx src/components/storefront/announcement-bar.tsx "src/app/(storefront)/page.tsx" "src/app/(storefront)/layout.tsx" tests/unit/banner-schedule.test.ts tests/unit/banners.test.ts
git commit -m "feat(storefront): add admin-managed hero slides, ticker lines and announcement bar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 3: Wishlist — service, heart button, account page, API, admin count

**Files:**
- Create: `src/server/services/wishlist.ts`, `src/app/(storefront)/account/wishlist/page.tsx`, `src/app/(storefront)/account/wishlist/actions.ts`, `src/components/storefront/wishlist-context.tsx`, `src/components/storefront/wishlist-button.tsx`, `src/app/api/v1/wishlist/route.ts`, `src/app/api/v1/wishlist/[productId]/route.ts`
- Modify: `src/server/services/catalog.ts` (add `getProductCardsByIds`), `src/components/storefront/product-card.tsx`, `src/components/storefront/product-purchase.tsx`, `src/app/(storefront)/layout.tsx`, `src/components/storefront/account/account-nav.tsx`, `src/server/services/admin-products.ts`, `src/components/admin/products-table.tsx`
- Test: `tests/unit/wishlist.test.ts`, `tests/unit/wishlist-api.test.ts`

**Interfaces:**
- Consumes: `ProductCard`, `cardInclude`/`toCard` (catalog, private), `requireUserId`, `requireApiUser`, `handle`, `ok`, `parseJson`, `signApiToken`, `NotFoundError`, `ValidationError`, `ProductGrid`, `AccountNav`.
- Produces:

```ts
// @/server/services/catalog (added)
export function getProductCardsByIds(ids: string[]): Promise<ProductCard[]>;   // ACTIVE only, in the order of ids
// @/server/services/wishlist
export const MAX_WISHLIST_ITEMS = 200;
export function listWishlistProductIds(userId: string): Promise<string[]>;     // newest first (includes inactive products)
export function listWishlist(userId: string): Promise<ProductCard[]>;          // newest first, ACTIVE products only
export function addToWishlist(userId: string, productId: string): Promise<{ added: boolean }>;   // idempotent; NotFoundError unless ACTIVE
export function removeFromWishlist(userId: string, productId: string): Promise<void>;           // idempotent
// src/app/(storefront)/account/wishlist/actions.ts
export function toggleWishlistAction(productId: string, on: boolean): Promise<ActionResult<{ wishlisted: boolean }>>;
// components (client)
export function WishlistProvider(props: { loggedIn: boolean; initialIds: string[]; children: React.ReactNode }): JSX.Element;
export function useWishlist(): { loggedIn: boolean; has(productId: string): boolean; toggle(productId: string): Promise<boolean | null> };
export function WishlistButton(props: { productId: string; productName: string; className?: string }): JSX.Element;   // data-testid="wishlist-button"
// API: GET /api/v1/wishlist → { data: { items: ProductCard[] } }; POST { productId } → 201 { added: true } | 200 { added: false };
//      DELETE /api/v1/wishlist/:productId → { data: null }. All require a Bearer token (401 otherwise).
// @/server/services/admin-products: AdminProductRow gains wishlistCount: number
```

- [ ] **Step 1: Failing tests**

Create `tests/unit/wishlist.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { addToWishlist, listWishlist, listWishlistProductIds, removeFromWishlist } from "@/server/services/wishlist";
import { listAdminProducts } from "@/server/services/admin-products";
import { NotFoundError, ValidationError } from "@/server/errors";

describe("wishlist service", () => {
  beforeEach(resetDb);
  afterEach(() => vi.restoreAllMocks());

  it("adds idempotently and lists newest first", async () => {
    const u = await createUser();
    const a = await createProduct({ name: "Alpha Tee" });
    const b = await createProduct({ name: "Beta Tee" });
    expect(await addToWishlist(u.id, a.id)).toEqual({ added: true });
    expect(await addToWishlist(u.id, a.id)).toEqual({ added: false });
    await addToWishlist(u.id, b.id);
    expect((await listWishlist(u.id)).map((p) => p.name)).toEqual(["Beta Tee", "Alpha Tee"]);
    expect(await listWishlistProductIds(u.id)).toEqual([b.id, a.id]);
  });

  it("refuses unknown or unpublished products and hides products archived later", async () => {
    const u = await createUser();
    const draft = await createProduct({ status: "DRAFT" });
    await expect(addToWishlist(u.id, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addToWishlist(u.id, "nope")).rejects.toBeInstanceOf(NotFoundError);
    const p = await createProduct();
    await addToWishlist(u.id, p.id);
    await db.product.update({ where: { id: p.id }, data: { status: "ARCHIVED" } });
    expect(await listWishlist(u.id)).toEqual([]);
    expect(await listWishlistProductIds(u.id)).toEqual([p.id]);
  });

  it("removes idempotently and only for that user", async () => {
    const [u, v] = [await createUser(), await createUser()];
    const p = await createProduct();
    await addToWishlist(u.id, p.id);
    await addToWishlist(v.id, p.id);
    await removeFromWishlist(u.id, p.id);
    await removeFromWishlist(u.id, p.id);
    expect(await listWishlistProductIds(u.id)).toEqual([]);
    expect(await listWishlistProductIds(v.id)).toEqual([p.id]);
  });

  it("caps the list size", async () => {
    const u = await createUser();
    const p = await createProduct();
    vi.spyOn(db.wishlistItem, "count").mockResolvedValueOnce(200);
    await expect(addToWishlist(u.id, p.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("shows how many customers saved each product in the admin list", async () => {
    const p = await createProduct({ name: "Saved Tee" });
    for (const u of [await createUser(), await createUser()]) await addToWishlist(u.id, p.id);
    const row = (await listAdminProducts({ q: "saved" })).items[0];
    expect(row.wishlistCount).toBe(2);
  });
});
```

Create `tests/unit/wishlist-api.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { signApiToken } from "@/server/api-token";
import { GET, POST } from "@/app/api/v1/wishlist/route";
import { DELETE } from "@/app/api/v1/wishlist/[productId]/route";

const BASE = "http://localhost:3000/api/v1/wishlist";
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

describe("/api/v1/wishlist", () => {
  beforeEach(resetDb);

  it("requires a token", async () => {
    expect((await GET(new NextRequest(BASE), params({}))).status).toBe(401);
  });

  it("adds, lists and removes", async () => {
    const u = await createUser();
    const p = await createProduct({ name: "Api Tee" });
    const auth = { authorization: `Bearer ${await signApiToken({ id: u.id, role: "CUSTOMER" })}` };
    const post = () => POST(new NextRequest(BASE, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ productId: p.id }) }), params({}));
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(200);
    const list = await (await GET(new NextRequest(BASE, { headers: auth }), params({}))).json();
    expect(list.data.items.map((i: { name: string }) => i.name)).toEqual(["Api Tee"]);
    expect((await DELETE(new NextRequest(`${BASE}/${p.id}`, { method: "DELETE", headers: auth }), params({ productId: p.id }))).status).toBe(200);
    const after = await (await GET(new NextRequest(BASE, { headers: auth }), params({}))).json();
    expect(after.data.items).toEqual([]);
  });
});
```

Run: `npm test -- tests/unit/wishlist.test.ts tests/unit/wishlist-api.test.ts`
Expected: FAIL.

- [ ] **Step 2: Services and API**

Append to `src/server/services/catalog.ts` (next to `pageProducts`, reusing the private `cardInclude`/`toCard`):

```ts
/** Active products as cards, in the order of `ids`; unknown or unpublished ids are skipped. */
export async function getProductCardsByIds(ids: string[]): Promise<ProductCard[]> {
  if (ids.length === 0) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, include: cardInclude });
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
```

Create `src/server/services/wishlist.ts`:

```ts
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getProductCardsByIds, type ProductCard } from "@/server/services/catalog";

export const MAX_WISHLIST_ITEMS = 200;

export async function listWishlistProductIds(userId: string): Promise<string[]> {
  const rows = await db.wishlistItem.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { productId: true } });
  return rows.map((r) => r.productId);
}

export async function listWishlist(userId: string): Promise<ProductCard[]> {
  return getProductCardsByIds(await listWishlistProductIds(userId));
}

export async function addToWishlist(userId: string, productId: string): Promise<{ added: boolean }> {
  const product = await db.product.findFirst({ where: { id: productId, status: "ACTIVE" }, select: { id: true } });
  if (!product) throw new NotFoundError("Product");
  const existing = await db.wishlistItem.findUnique({ where: { userId_productId: { userId, productId } }, select: { id: true } });
  if (existing) return { added: false };
  if ((await db.wishlistItem.count({ where: { userId } })) >= MAX_WISHLIST_ITEMS) {
    const msg = `Your wishlist holds up to ${MAX_WISHLIST_ITEMS} products`;
    throw new ValidationError({ productId: [msg] }, msg);
  }
  try {
    await db.wishlistItem.create({ data: { userId, productId } });
    return { added: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { added: false };
    throw err;
  }
}

export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  await db.wishlistItem.deleteMany({ where: { userId, productId } });
}
```

(Two rows created in the same millisecond order by `id desc` as a tiebreak; cuids are time-ordered enough for this, and the test inserts sequentially.)

Create `src/app/api/v1/wishlist/route.ts`:

```ts
import { z } from "zod";
import { handle, ok, parseJson, requireApiUser } from "@/server/api";
import { addToWishlist, listWishlist } from "@/server/services/wishlist";

const bodySchema = z.object({ productId: z.string().trim().min(1).max(64) });

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  return ok({ items: await listWishlist(user.id) });
});

export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const { productId } = await parseJson(req, bodySchema);
  const result = await addToWishlist(user.id, productId);
  return ok(result, { status: result.added ? 201 : 200 });
});
```

Create `src/app/api/v1/wishlist/[productId]/route.ts`:

```ts
import { handle, ok, requireApiUser } from "@/server/api";
import { removeFromWishlist } from "@/server/services/wishlist";

export const DELETE = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { productId } = await ctx.params;
  await removeFromWishlist(user.id, productId);
  return ok(null);
});
```

In `src/server/services/admin-products.ts`: add `wishlistCount: number` to `AdminProductRow`, add `_count: { select: { wishlistItems: true } }` to the `include` of `listAdminProducts`, and map `wishlistCount: p._count.wishlistItems`. If existing admin-products tests compare whole rows with `toEqual`, add `wishlistCount: 0` to their expectations.

Run the two test files: GREEN.

- [ ] **Step 3: Storefront**

Create `src/app/(storefront)/account/wishlist/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { actionError, type ActionResult } from "@/server/action-result";
import { ValidationError } from "@/server/errors";
import { requireUserId } from "@/server/session-user";
import { addToWishlist, removeFromWishlist } from "@/server/services/wishlist";

export async function toggleWishlistAction(productId: string, on: boolean): Promise<ActionResult<{ wishlisted: boolean }>> {
  try {
    const userId = await requireUserId();
    if (typeof productId !== "string" || productId.length === 0 || productId.length > 64) throw new ValidationError({ productId: ["Unknown product"] });
    if (on) await addToWishlist(userId, productId);
    else await removeFromWishlist(userId, productId);
    revalidatePath("/account/wishlist");
    return { ok: true, data: { wishlisted: on } };
  } catch (err) {
    return actionError(err);
  }
}
```

Create `src/components/storefront/wishlist-context.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import { toggleWishlistAction } from "@/app/(storefront)/account/wishlist/actions";

interface WishlistApi {
  loggedIn: boolean;
  has(productId: string): boolean;
  /** Optimistic toggle; resolves to the new state, or null when the server refused (state reverted, error toasted). */
  toggle(productId: string): Promise<boolean | null>;
}

const GUEST: WishlistApi = { loggedIn: false, has: () => false, toggle: async () => null };
const Ctx = createContext<WishlistApi>(GUEST);

export function WishlistProvider({ loggedIn, initialIds, children }: { loggedIn: boolean; initialIds: string[]; children: React.ReactNode }) {
  const [ids, setIds] = useState(() => new Set(initialIds));
  const flip = (productId: string, on: boolean) =>
    setIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(productId);
      else next.delete(productId);
      return next;
    });
  const toggle = useCallback(async (productId: string) => {
    const on = !ids.has(productId);
    flip(productId, on);
    const r = await toggleWishlistAction(productId, on);
    if (!r.ok) {
      flip(productId, !on);
      toast.error(r.message);
      return null;
    }
    return on;
  }, [ids]);
  const api = useMemo<WishlistApi>(() => ({ loggedIn, has: (id) => ids.has(id), toggle }), [loggedIn, ids, toggle]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useWishlist(): WishlistApi {
  return useContext(Ctx);
}
```

Create `src/components/storefront/wishlist-button.tsx`:

```tsx
"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWishlist } from "./wishlist-context";

export function WishlistButton({ productId, productName, className }: { productId: string; productName: string; className?: string }) {
  const wishlist = useWishlist();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const on = wishlist.has(productId);

  const click = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!wishlist.loggedIn) {
      toast("Log in to save favourites");
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setBusy(true);
    const result = await wishlist.toggle(productId);
    setBusy(false);
    if (result !== null) toast.success(result ? "Saved to your wishlist" : "Removed from your wishlist");
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      className={cn("inline-flex size-11 items-center justify-center rounded-full transition-colors disabled:opacity-60", className)}
      data-testid="wishlist-button"
    >
      <Heart className={cn("size-5", on && "fill-current text-brand")} aria-hidden="true" />
    </button>
  );
}
```

`src/app/(storefront)/layout.tsx`: resolve the session first, then fetch in parallel: `const session = await auth(); const userId = session?.user?.id ?? null; const [cart, announcement, wishlistIds] = await Promise.all([getCurrentCart(), getAnnouncement(), userId ? listWishlistProductIds(userId) : Promise.resolve([] as string[])]);`. Wrap everything inside `<LenisProvider>` in `<WishlistProvider key={userId ?? "guest"} loggedIn={Boolean(userId)} initialIds={wishlistIds}>…</WishlistProvider>` (the `key` remounts it on login/logout so the hearts never show another user's state).

`src/components/storefront/product-card.tsx`: give the `<article>` `className="group relative"` and render, **after** the `<Link>` (a button inside an anchor is invalid HTML), `<WishlistButton productId={product.id} productName={product.name} className="absolute right-1 top-1 z-10 bg-bg/70 backdrop-blur hover:bg-bg" />`. The card stays usable inside the client `LoadMore` (the provider is above it).

`src/components/storefront/product-purchase.tsx`: in the quantity/Add-to-bag row add `<WishlistButton productId={product.id} productName={product.name} className="shrink-0 border border-border" />` after the Add to bag button.

Create `src/app/(storefront)/account/wishlist/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/storefront/account/account-nav";
import { ProductGrid } from "@/components/storefront/product-grid";
import { auth } from "@/server/auth";
import { listWishlist } from "@/server/services/wishlist";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false, follow: false } };

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=%2Faccount%2Fwishlist");
  const items = await listWishlist(session.user.id);
  return (
    <div className="container-x space-y-6 py-10" data-testid="wishlist-page">
      <h1 className="text-5xl md:text-7xl">Wishlist</h1>
      <AccountNav />
      {items.length > 0 ? (
        <ProductGrid products={items} />
      ) : (
        <div className="rounded-md border border-dashed border-border bg-surface p-8" data-testid="wishlist-empty">
          <p className="font-display text-2xl">Nothing saved yet</p>
          <p className="mt-1 text-text-muted">Tap the heart on any tee to keep it here.</p>
          <Link href="/collections/new-drops" className="mt-4 inline-flex min-h-11 items-center underline-offset-4 hover:underline">Browse new drops</Link>
        </div>
      )}
    </div>
  );
}
```

Removing a heart on this page calls the action, whose `revalidatePath("/account/wishlist")` refreshes the page, so the card disappears.

`src/components/storefront/account/account-nav.tsx`: add **Wishlist** `/account/wishlist` after **Orders**.

`src/components/admin/products-table.tsx`: add a **Saves** column (right-aligned, `wishlistCount`; header has `<Heart className="inline size-4" aria-hidden /> <span>Saves</span>`). (Task 9 turns this table into cards on phones and keeps the count.)

- [ ] **Step 4: Verify and commit**

Run the two test files, then the full gate. Manual check on port 3001: as a guest tap a card heart → redirected to `/login?next=%2Fcollections%2F…`; log in → hearts reflect saved items; save from a card and from the product page (toast, filled heart), open `/account/wishlist` at 360 px (grid, hearts filled), unsave → card disappears; admin products list shows the Saves count. Stop the server.

```bash
git add src/server/services/wishlist.ts src/server/services/catalog.ts src/server/services/admin-products.ts "src/app/(storefront)/account/wishlist" "src/app/(storefront)/layout.tsx" src/app/api/v1/wishlist src/components/storefront/wishlist-context.tsx src/components/storefront/wishlist-button.tsx src/components/storefront/product-card.tsx src/components/storefront/product-purchase.tsx src/components/storefront/account/account-nav.tsx src/components/admin/products-table.tsx tests/unit/wishlist.test.ts tests/unit/wishlist-api.test.ts
git commit -m "feat(storefront): add wishlist with heart buttons, account page, API and admin save counts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

(Add `tests/unit/admin-products.test.ts` to the `git add` line if its expectations changed.)

---

### Task 4: Reviews — verified purchase, product page, moderation, JSON-LD rating, review-request job

**Files:**
- Create: `src/lib/validation/review.ts`, `src/lib/rating.ts`, `src/lib/site-url.ts`, `src/server/services/reviews.ts`, `src/server/services/admin-reviews.ts`, `src/server/jobs/review-request.ts`, `src/app/(storefront)/products/[slug]/review-actions.ts`, `src/app/api/v1/products/[slug]/reviews/route.ts`, `src/app/admin/reviews/page.tsx`, `src/app/admin/reviews/actions.ts`, `src/components/admin/review-moderation-card.tsx`, `src/components/storefront/reviews/rating-stars.tsx`, `src/components/storefront/reviews/rating-summary.tsx`, `src/components/storefront/reviews/review-list.tsx`, `src/components/storefront/reviews/more-reviews.tsx`, `src/components/storefront/reviews/review-form.tsx`, `src/components/storefront/reviews/product-reviews.tsx`
- Modify: `src/lib/json-ld.ts` (add `productJsonLd`), `src/app/(storefront)/products/[slug]/page.tsx`, `src/components/storefront/product-purchase.tsx` (rating link), `src/server/emails/templates.ts` (add `reviewRequestEmail`), `src/server/jobs/index.ts` (register `review-request`), `src/components/admin/admin-nav.tsx` + `src/app/admin/layout.tsx` (Reviews item + pending badge), `src/components/admin/settings-form.tsx` (Reviews fieldset)
- Test: `tests/unit/rating.test.ts`, `tests/unit/reviews.test.ts`, `tests/unit/product-json-ld.test.ts`, `tests/unit/review-request-job.test.ts`

**Interfaces:**
- Consumes: `createDeliveredPurchase`, `settingsInputFrom` (Task 1), `getSettings`, `sendEmailSafely`, `siteUrl` (templates), `addOrderEvent`, `formatDateIst`, `optionalText`, `rateLimit`, `requireUserId`, `requireAdmin`, `requireAdminPage`, `handle`, `ok`, `requireApiUser`, `ProductDetail`, `Page`, `JOBS`.
- Produces:

```ts
// @/lib/validation/review
export const REVIEW_BODY_MAX = 1000; export const REVIEWS_PAGE_SIZE = 10;
export const REVIEW_STATUSES: readonly ["PENDING", "APPROVED", "REJECTED"];
export const reviewInputSchema; export type ReviewInput = z.input<typeof reviewInputSchema>;   // { rating 1–5, title? ≤ 80, body ≤ 1000 }
// @/lib/rating
export function roundRating(avg: number): number;          // one decimal
export function formatRating(avg: number): string;         // "4.5"
export function ratingLabel(avg: number): string;          // "4.5 out of 5 stars"
export function reviewerName(name: string | null): string; // "Asha R." | "Asha" | "Verified buyer"
export function autoApproves(rating: number, autoApprove: boolean): boolean;   // autoApprove && rating >= 4
// @/lib/site-url
export function siteUrl(): string;                          // NEXT_PUBLIC_SITE_URL without trailing slash (client-safe twin of the templates helper)
export function absoluteUrl(path: string): string;          // absolute URLs pass through unchanged
// @/lib/json-ld (added)
export function productJsonLd(args: { product: ProductDetail; url: string; brandName: string; summary: RatingSummary; reviews: ReviewView[] }): Record<string, unknown>;
// @/server/services/reviews
export interface ReviewView { id: string; rating: number; title: string | null; body: string; authorName: string; createdAt: Date }
export interface RatingSummary { average: number; count: number; histogram: Record<1 | 2 | 3 | 4 | 5, number> }
export type ReviewBlocker = "signed-out" | "not-delivered" | "already-reviewed";
export interface ReviewEligibility { canReview: boolean; blocker: ReviewBlocker | null }
export function getRatingSummary(productId: string): Promise<RatingSummary>;                       // APPROVED only
export function listApprovedReviews(productId: string, page?: number): Promise<Page<ReviewView>>;   // newest first, 10 per page
export function getProductReviewsBySlug(slug: string, page?: number): Promise<{ summary: RatingSummary; reviews: Page<ReviewView> }>;
export function getReviewEligibility(userId: string | null, productId: string): Promise<ReviewEligibility>;
export function createReview(userId: string, productId: string, input: unknown): Promise<{ id: string; status: ReviewStatus }>;
export function createReviewBySlug(userId: string, slug: string, input: unknown): Promise<{ id: string; status: ReviewStatus }>;
// @/server/services/admin-reviews
export interface AdminReviewRow { id: string; rating: number; title: string | null; body: string; status: ReviewStatus; createdAt: Date;
  productName: string; productSlug: string; authorName: string | null; authorEmail: string; orderId: string; orderNumber: string }
export function listAdminReviews(args?: { status?: ReviewStatus; page?: number }): Promise<Page<AdminReviewRow>>;   // default PENDING, oldest first
export function moderateReview(id: string, status: "APPROVED" | "REJECTED"): Promise<void>;
export function countPendingReviews(): Promise<number>;
// @/server/emails/templates (added)
export interface ReviewRequestItem { name: string; url: string }
export function reviewRequestEmail(args: { name: string | null; orderNumber: string; items: ReviewRequestItem[] }): RenderedEmail;
// @/server/jobs/review-request
export const REVIEW_REQUEST_DELAY_DAYS = 5; export const REVIEW_REQUEST_WINDOW_DAYS = 30;
export function runReviewRequest(now?: Date): Promise<{ sent: number; reason?: "disabled" }>;
// actions
export function createReviewAction(productId: string, input: ReviewInput): Promise<ActionResult<{ status: ReviewStatus }>>;   // storefront
export function moderateReviewAction(id: string, status: "APPROVED" | "REJECTED"): Promise<ActionResult<null>>;              // admin
// API: GET /api/v1/products/:slug/reviews?page=n → { data: { summary, items, total, page, pageSize, hasMore } };
//      POST /api/v1/products/:slug/reviews (Bearer) { rating, title?, body? } → 201 { id, status }
// components
export function RatingStars(props: { rating: number; className?: string }): JSX.Element;   // role="img", aria-label ratingLabel
export function ProductReviews(props: { productId: string; slug: string; summary: RatingSummary; firstPage: Page<ReviewView>; eligibility: ReviewEligibility }): JSX.Element;
// AdminNav gains pendingReviewCount: number
```

Rules (spec §1): only a customer with a **DELIVERED** order item for the product can review (the oldest unreviewed delivered item is linked); one review per customer per product; rating 1–5, optional title ≤ 80, body ≤ 1000. With **Settings → Publish 4★ and 5★ reviews immediately** on (default), 4–5★ reviews are APPROVED at once; everything else is PENDING until an admin approves it. Product pages show the average and count of APPROVED reviews, a 5→1 histogram, 10 reviews per page, and Product JSON-LD `aggregateRating` + up to 5 `review` entries only when at least one review is approved. The `review-request` job emails each customer once per order, 5–30 days after delivery, listing that order's products they have not reviewed; it claims the order with a conditional `reviewRequestedAt` update before sending and releases it if sending fails (same pattern as Phase 2's abandoned-cart job). Review creation is rate limited to 5 per user per hour.

- [ ] **Step 1: Failing tests**

Create `tests/unit/rating.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { autoApproves, formatRating, ratingLabel, reviewerName, roundRating } from "@/lib/rating";

describe("rating helpers", () => {
  it("rounds and formats averages", () => {
    expect(roundRating(4.349)).toBe(4.3);
    expect(roundRating(4.35)).toBe(4.4);
    expect(formatRating(5)).toBe("5.0");
    expect(ratingLabel(4.25)).toBe("4.3 out of 5 stars");
  });
  it("shortens reviewer names", () => {
    expect(reviewerName("Asha Rao")).toBe("Asha R.");
    expect(reviewerName("  ravi   kumar singh ")).toBe("ravi S.");
    expect(reviewerName("Asha")).toBe("Asha");
    expect(reviewerName(null)).toBe("Verified buyer");
    expect(reviewerName("   ")).toBe("Verified buyer");
  });
  it("auto-approves only 4 and 5 stars when enabled", () => {
    expect(autoApproves(5, true)).toBe(true);
    expect(autoApproves(4, true)).toBe(true);
    expect(autoApproves(3, true)).toBe(false);
    expect(autoApproves(5, false)).toBe(false);
  });
});
```

Create `tests/unit/reviews.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDeliveredPurchase, createProduct, createUser } from "../helpers/fixtures";
import {
  createReview, getProductReviewsBySlug, getRatingSummary, getReviewEligibility, listApprovedReviews,
} from "@/server/services/reviews";
import { countPendingReviews, listAdminReviews, moderateReview } from "@/server/services/admin-reviews";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import { signApiToken } from "@/server/api-token";
import { GET, POST } from "@/app/api/v1/products/[slug]/reviews/route";

async function buyer(productId: string, name = "Asha Rao") {
  const u = await createUser({ name });
  await createDeliveredPurchase(u.id, productId);
  return u;
}

describe("reviews service", () => {
  beforeEach(resetDb);

  it("works out who may review", async () => {
    const p = await createProduct();
    expect(await getReviewEligibility(null, p.id)).toEqual({ canReview: false, blocker: "signed-out" });
    const shipped = await createUser();
    await createDeliveredPurchase(shipped.id, p.id, { status: "SHIPPED" });
    expect(await getReviewEligibility(shipped.id, p.id)).toEqual({ canReview: false, blocker: "not-delivered" });
    const u = await buyer(p.id);
    expect(await getReviewEligibility(u.id, p.id)).toEqual({ canReview: true, blocker: null });
    await createReview(u.id, p.id, { rating: 5, body: "Great" });
    expect(await getReviewEligibility(u.id, p.id)).toEqual({ canReview: false, blocker: "already-reviewed" });
  });

  it("auto-approves 4–5 stars, holds the rest, and honours the setting", async () => {
    const p = await createProduct();
    expect((await createReview((await buyer(p.id)).id, p.id, { rating: 5, title: " Love it ", body: "Soft and heavy." })).status).toBe("APPROVED");
    expect((await createReview((await buyer(p.id)).id, p.id, { rating: 3, body: "" })).status).toBe("PENDING");
    await db.storeSetting.upsert({ where: { id: 1 }, update: { autoApproveReviews: false }, create: { id: 1, autoApproveReviews: false } });
    expect((await createReview((await buyer(p.id)).id, p.id, { rating: 5 })).status).toBe("PENDING");
    const saved = await db.review.findFirstOrThrow({ where: { rating: 5, status: "APPROVED" } });
    expect(saved).toMatchObject({ title: "Love it", body: "Soft and heavy." });
    expect(await countPendingReviews()).toBe(2);
  });

  it("refuses non-buyers, duplicates and bad input", async () => {
    const p = await createProduct();
    const stranger = await createUser();
    await expect(createReview(stranger.id, p.id, { rating: 5 })).rejects.toBeInstanceOf(ForbiddenError);
    const u = await buyer(p.id);
    await expect(createReview(u.id, p.id, { rating: 6 })).rejects.toBeInstanceOf(ValidationError);
    await expect(createReview(u.id, p.id, { rating: 4, body: "x".repeat(1001) })).rejects.toBeInstanceOf(ValidationError);
    await createReview(u.id, p.id, { rating: 4 });
    await createDeliveredPurchase(u.id, p.id);   // bought it again
    await expect(createReview(u.id, p.id, { rating: 5 })).rejects.toBeInstanceOf(ConflictError);
  });

  it("summarises and pages approved reviews only", async () => {
    const p = await createProduct({ name: "Summary Tee" });
    for (const r of [5, 5, 4, 4, 4, 5, 5, 4, 5, 5, 4]) await createReview((await buyer(p.id)).id, p.id, { rating: r });
    await createReview((await buyer(p.id)).id, p.id, { rating: 1 });   // pending, not counted
    const s = await getRatingSummary(p.id);
    expect(s).toEqual({ average: 4.5, count: 11, histogram: { 1: 0, 2: 0, 3: 0, 4: 5, 5: 6 } });
    const page1 = await listApprovedReviews(p.id, 1);
    expect(page1).toMatchObject({ total: 11, pageSize: 10, hasMore: true });
    expect(page1.items).toHaveLength(10);
    expect(page1.items[0].authorName).toBe("Asha R.");
    expect((await listApprovedReviews(p.id, 2)).items).toHaveLength(1);
    expect((await getProductReviewsBySlug("summary-tee")).summary.count).toBe(11);
  });

  it("lets admins moderate", async () => {
    const p = await createProduct({ name: "Moderated Tee" });
    const { id } = await createReview((await buyer(p.id, "Ravi K")).id, p.id, { rating: 2, title: "Too tight" });
    const pending = await listAdminReviews();
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]).toMatchObject({ id, productName: "Moderated Tee", authorName: "Ravi K", status: "PENDING" });
    expect(pending.items[0].orderNumber).toBeTruthy();
    await moderateReview(id, "APPROVED");
    expect((await getRatingSummary(p.id)).count).toBe(1);
    await moderateReview(id, "REJECTED");
    expect((await getRatingSummary(p.id)).count).toBe(0);
    expect((await listAdminReviews({ status: "REJECTED" })).items.map((r) => r.id)).toEqual([id]);
  });

  it("serves the API", async () => {
    const p = await createProduct({ name: "Api Review Tee" });
    const u = await buyer(p.id);
    const base = "http://localhost:3000/api/v1/products/api-review-tee/reviews";
    const params = { params: Promise.resolve({ slug: "api-review-tee" }) };
    const auth = { authorization: `Bearer ${await signApiToken({ id: u.id, role: "CUSTOMER" })}`, "content-type": "application/json" };
    const created = await POST(new NextRequest(base, { method: "POST", headers: auth, body: JSON.stringify({ rating: 5, body: "Nice" }) }), params);
    expect(created.status).toBe(201);
    const listed = await (await GET(new NextRequest(`${base}?page=1`), params)).json();
    expect(listed.data).toMatchObject({ summary: { count: 1, average: 5 }, total: 1, hasMore: false });
    const stranger = await createUser();
    const other = { ...auth, authorization: `Bearer ${await signApiToken({ id: stranger.id, role: "CUSTOMER" })}` };
    expect((await POST(new NextRequest(base, { method: "POST", headers: other, body: JSON.stringify({ rating: 5 }) }), params)).status).toBe(403);
    expect((await GET(new NextRequest("http://localhost:3000/api/v1/products/nope/reviews"), { params: Promise.resolve({ slug: "nope" }) })).status).toBe(404);
  });
});
```

Create `tests/unit/product-json-ld.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { jsonLdScript, productJsonLd } from "@/lib/json-ld";
import type { ProductDetail } from "@/server/services/catalog";

const product = {
  id: "p1", slug: "alpha-tee", name: "Alpha Tee", fit: "OVERSIZED", pricePaise: 59900, compareAtPricePaise: null,
  images: [{ url: "/api/uploads/products/p1/a.png", alt: "Alpha", colorName: null }, { url: "https://cdn.example.com/b.png", alt: "", colorName: null }],
  colors: [], lowStock: false, soldOut: false, isCustomizable: false, createdAt: new Date("2026-01-01"),
  description: "Heavy tee </script>", fabric: "100% Cotton",
  variants: [{ id: "v1", sku: "ALPHA-BLACK-M", size: "M", colorName: "Black", colorHex: "#000", pricePaise: 59900, stock: 3 }],
  collections: [],
} as ProductDetail;
const noReviews = { average: 0, count: 0, histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

describe("productJsonLd", () => {
  it("describes the offer with absolute urls and no rating when there are no reviews", () => {
    const ld = productJsonLd({ product, url: "https://shop.example.com/products/alpha-tee", brandName: "Brand", summary: noReviews, reviews: [] });
    expect(ld).toMatchObject({
      "@type": "Product", name: "Alpha Tee", sku: "ALPHA-BLACK-M", url: "https://shop.example.com/products/alpha-tee",
      image: ["https://shop.example.com/api/uploads/products/p1/a.png", "https://cdn.example.com/b.png"],
      offers: { "@type": "Offer", price: "599.00", priceCurrency: "INR", availability: "https://schema.org/InStock", url: "https://shop.example.com/products/alpha-tee" },
    });
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(jsonLdScript(ld)).not.toContain("</script>");
  });

  it("adds aggregateRating and up to five reviews", () => {
    const reviews = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, rating: 5, title: i === 0 ? "Great" : null, body: "Nice", authorName: "Asha R.", createdAt: new Date("2026-10-01T10:00:00Z") }));
    const ld = productJsonLd({ product: { ...product, soldOut: true }, url: "https://shop.example.com/products/alpha-tee", brandName: "Brand", summary: { average: 4.5, count: 12, histogram: { 1: 0, 2: 0, 3: 1, 4: 3, 5: 8 } }, reviews });
    expect(ld.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: "4.5", reviewCount: 12, bestRating: 5, worstRating: 1 });
    expect(ld.review).toHaveLength(5);
    expect((ld.review as Record<string, unknown>[])[0]).toMatchObject({ "@type": "Review", name: "Great", author: { "@type": "Person", name: "Asha R." }, datePublished: "2026-10-01" });
    expect((ld.offers as Record<string, string>).availability).toBe("https://schema.org/OutOfStock");
  });
});
```

Create `tests/unit/review-request-job.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDeliveredPurchase, createProduct, createUser } from "../helpers/fixtures";
import { getEmail, type ConsoleEmail } from "@/server/adapters/email";
import { isJobName } from "@/server/jobs";
import { createReview } from "@/server/services/reviews";
import { runReviewRequest } from "@/server/jobs/review-request";

const DAY = 86_400_000;
const outbox = () => getEmail() as ConsoleEmail;

describe("review-request job", () => {
  beforeEach(async () => {
    await resetDb();
    outbox().sent.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it("is registered for the cron route", () => {
    expect(isJobName("review-request")).toBe(true);
  });

  it("emails once per order, 5–30 days after delivery", async () => {
    const now = new Date();
    const p = await createProduct({ name: "Alpha Tee" });
    const due = await createDeliveredPurchase((await createUser({ name: "Asha Rao" })).id, p.id, { deliveredAt: new Date(now.getTime() - 6 * DAY) });
    await createDeliveredPurchase((await createUser()).id, p.id, { deliveredAt: new Date(now.getTime() - 2 * DAY) });
    await createDeliveredPurchase((await createUser()).id, p.id, { deliveredAt: new Date(now.getTime() - 40 * DAY) });
    await createDeliveredPurchase((await createUser()).id, p.id, { status: "SHIPPED" });
    expect(await runReviewRequest(now)).toEqual({ sent: 1 });
    expect(outbox().sent).toHaveLength(1);
    expect(outbox().sent[0]).toMatchObject({ to: due.order.email, subject: `How is your order ${due.order.number}?` });
    expect(outbox().sent[0].html).toContain("/products/alpha-tee#write-review");
    expect(await runReviewRequest(now)).toEqual({ sent: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: due.order.id } })).reviewRequestedAt).not.toBeNull();
    expect(await db.orderEvent.count({ where: { orderId: due.order.id, type: "EMAIL_SENT" } })).toBe(1);
  });

  it("stamps without emailing when everything is already reviewed", async () => {
    const now = new Date();
    const u = await createUser();
    const p = await createProduct();
    const { order } = await createDeliveredPurchase(u.id, p.id, { deliveredAt: new Date(now.getTime() - 6 * DAY) });
    await createReview(u.id, p.id, { rating: 5 });
    expect(await runReviewRequest(now)).toEqual({ sent: 0 });
    expect(outbox().sent).toHaveLength(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).reviewRequestedAt).not.toBeNull();
  });

  it("releases the claim when sending fails, and respects the setting", async () => {
    const now = new Date();
    const p = await createProduct();
    const { order } = await createDeliveredPurchase((await createUser()).id, p.id, { deliveredAt: new Date(now.getTime() - 6 * DAY) });
    vi.spyOn(outbox(), "send").mockRejectedValueOnce(new Error("smtp down"));
    expect(await runReviewRequest(now)).toEqual({ sent: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).reviewRequestedAt).toBeNull();
    await db.storeSetting.upsert({ where: { id: 1 }, update: { reviewRequestsEnabled: false }, create: { id: 1, reviewRequestsEnabled: false } });
    expect(await runReviewRequest(now)).toEqual({ sent: 0, reason: "disabled" });
    await db.storeSetting.update({ where: { id: 1 }, data: { reviewRequestsEnabled: true } });
    expect(await runReviewRequest(now)).toEqual({ sent: 1 });
  });
});
```

Run: `npm test -- tests/unit/rating.test.ts tests/unit/reviews.test.ts tests/unit/product-json-ld.test.ts tests/unit/review-request-job.test.ts`
Expected: FAIL.

- [ ] **Step 2: Pure helpers**

Create `src/lib/validation/review.ts`:

```ts
import { z } from "zod";
import { optionalText } from "@/lib/validation/common";

export const REVIEW_BODY_MAX = 1000;
export const REVIEWS_PAGE_SIZE = 10;
export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export const reviewInputSchema = z.object({
  rating: z.number({ required_error: "Pick a rating", invalid_type_error: "Pick a rating" }).int().min(1, "Pick a rating").max(5, "Pick a rating"),
  title: optionalText(80),
  body: z.string().trim().max(REVIEW_BODY_MAX, `Keep your review under ${REVIEW_BODY_MAX} characters`).default(""),
});

export type ReviewInput = z.input<typeof reviewInputSchema>;
```

Create `src/lib/rating.ts`:

```ts
export function roundRating(avg: number): number {
  return Math.round(avg * 10 + Number.EPSILON) / 10;
}

export function formatRating(avg: number): string {
  return roundRating(avg).toFixed(1);
}

export function ratingLabel(avg: number): string {
  return `${formatRating(avg)} out of 5 stars`;
}

/** "Asha Rao" → "Asha R."; a single name stays as is; blank → "Verified buyer". */
export function reviewerName(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Verified buyer";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function autoApproves(rating: number, autoApprove: boolean): boolean {
  return autoApprove && rating >= 4;
}
```

Create `src/lib/site-url.ts`:

```ts
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Resolves a site path against NEXT_PUBLIC_SITE_URL; absolute URLs (e.g. S3 images) pass through unchanged. */
export function absoluteUrl(path: string): string {
  return new URL(path, `${siteUrl()}/`).toString();
}
```

Append to `src/lib/json-ld.ts`:

```ts
import type { ProductDetail } from "@/server/services/catalog";
import type { RatingSummary, ReviewView } from "@/server/services/reviews";

export function productJsonLd(args: { product: ProductDetail; url: string; brandName: string; summary: RatingSummary; reviews: ReviewView[] }): Record<string, unknown> {
  const { product: p, url, summary } = args;
  const abs = (u: string) => new URL(u, url).toString();
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    url,
    image: p.images.map((i) => abs(i.url)),
    description: p.description,
    sku: p.variants[0]?.sku,
    brand: { "@type": "Brand", name: args.brandName },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: (p.pricePaise / 100).toFixed(2),
      availability: p.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  if (summary.count > 0) {
    ld.aggregateRating = { "@type": "AggregateRating", ratingValue: summary.average.toFixed(1), reviewCount: summary.count, bestRating: 5, worstRating: 1 };
    ld.review = args.reviews.slice(0, 5).map((r) => ({
      "@type": "Review",
      ...(r.title ? { name: r.title } : {}),
      reviewBody: r.body,
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      author: { "@type": "Person", name: r.authorName },
      datePublished: r.createdAt.toISOString().slice(0, 10),
    }));
  }
  return ld;
}
```

(Type-only imports keep `src/lib` client-safe.)

- [ ] **Step 3: Services, job and API**

Create `src/server/services/reviews.ts`:

```ts
import { Prisma, type ReviewStatus } from "@prisma/client";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitedError, ValidationError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { getSettings } from "@/server/services/settings";
import type { Page } from "@/server/services/catalog";
import { autoApproves, reviewerName, roundRating } from "@/lib/rating";
import { REVIEWS_PAGE_SIZE, reviewInputSchema } from "@/lib/validation/review";

export interface ReviewView { id: string; rating: number; title: string | null; body: string; authorName: string; createdAt: Date }
export interface RatingSummary { average: number; count: number; histogram: Record<1 | 2 | 3 | 4 | 5, number> }
export type ReviewBlocker = "signed-out" | "not-delivered" | "already-reviewed";
export interface ReviewEligibility { canReview: boolean; blocker: ReviewBlocker | null }

const HOUR = 3_600_000;

function toView(r: { id: string; rating: number; title: string | null; body: string; createdAt: Date; user: { name: string | null } }): ReviewView {
  return { id: r.id, rating: r.rating, title: r.title, body: r.body, authorName: reviewerName(r.user.name), createdAt: r.createdAt };
}

async function activeProductId(slug: string): Promise<string> {
  const p = await db.product.findFirst({ where: { slug, status: "ACTIVE" }, select: { id: true } });
  if (!p) throw new NotFoundError("Product");
  return p.id;
}

export async function getRatingSummary(productId: string): Promise<RatingSummary> {
  const groups = await db.review.groupBy({ by: ["rating"], where: { productId, status: "APPROVED" }, _count: { _all: true } });
  const histogram: RatingSummary["histogram"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let total = 0;
  for (const g of groups) {
    histogram[g.rating as 1 | 2 | 3 | 4 | 5] = g._count._all;
    count += g._count._all;
    total += g.rating * g._count._all;
  }
  return { average: count ? roundRating(total / count) : 0, count, histogram };
}

export async function listApprovedReviews(productId: string, page = 1): Promise<Page<ReviewView>> {
  const p = Math.max(1, Math.floor(page) || 1);
  const where = { productId, status: "APPROVED" as const };
  const [total, rows] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (p - 1) * REVIEWS_PAGE_SIZE, take: REVIEWS_PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
  ]);
  return { items: rows.map(toView), total, page: p, pageSize: REVIEWS_PAGE_SIZE, hasMore: p * REVIEWS_PAGE_SIZE < total };
}

export async function getProductReviewsBySlug(slug: string, page = 1): Promise<{ summary: RatingSummary; reviews: Page<ReviewView> }> {
  const productId = await activeProductId(slug);
  const [summary, reviews] = await Promise.all([getRatingSummary(productId), listApprovedReviews(productId, page)]);
  return { summary, reviews };
}

function eligibleItem(userId: string, productId: string) {
  return db.orderItem.findFirst({
    where: { productId, review: { is: null }, order: { userId, status: "DELIVERED" } },
    orderBy: { order: { deliveredAt: "asc" } },
    select: { id: true },
  });
}

export async function getReviewEligibility(userId: string | null, productId: string): Promise<ReviewEligibility> {
  if (!userId) return { canReview: false, blocker: "signed-out" };
  const existing = await db.review.findUnique({ where: { productId_userId: { productId, userId } }, select: { id: true } });
  if (existing) return { canReview: false, blocker: "already-reviewed" };
  return (await eligibleItem(userId, productId)) ? { canReview: true, blocker: null } : { canReview: false, blocker: "not-delivered" };
}

export async function createReview(userId: string, productId: string, input: unknown): Promise<{ id: string; status: ReviewStatus }> {
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodFieldErrors(parsed.error));
  const limit = rateLimit(`review:${userId}`, 5, HOUR);
  if (!limit.ok) throw new RateLimitedError(limit.retryAfterSec);
  const eligibility = await getReviewEligibility(userId, productId);
  if (eligibility.blocker === "already-reviewed") throw new ConflictError("You have already reviewed this product");
  const item = await eligibleItem(userId, productId);
  if (!item) throw new ForbiddenError("Only customers whose order was delivered can review this product");
  const { autoApproveReviews } = await getSettings();
  const status: ReviewStatus = autoApproves(parsed.data.rating, autoApproveReviews) ? "APPROVED" : "PENDING";
  try {
    const row = await db.review.create({
      data: {
        productId, userId, orderItemId: item.id, rating: parsed.data.rating, title: parsed.data.title, body: parsed.data.body,
        status, moderatedAt: status === "APPROVED" ? new Date() : null,
      },
    });
    return { id: row.id, status: row.status };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConflictError("You have already reviewed this product");
    throw err;
  }
}

export async function createReviewBySlug(userId: string, slug: string, input: unknown): Promise<{ id: string; status: ReviewStatus }> {
  return createReview(userId, await activeProductId(slug), input);
}
```

(The rate limiter is in-memory per process; tests create at most a few reviews per user, well under 5.)

Create `src/server/services/admin-reviews.ts`:

```ts
import type { ReviewStatus } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import type { Page } from "@/server/services/catalog";

export interface AdminReviewRow {
  id: string; rating: number; title: string | null; body: string; status: ReviewStatus; createdAt: Date;
  productName: string; productSlug: string; authorName: string | null; authorEmail: string; orderId: string; orderNumber: string;
}

const PAGE_SIZE = 20;

export async function listAdminReviews(args: { status?: ReviewStatus; page?: number } = {}): Promise<Page<AdminReviewRow>> {
  const status = args.status ?? "PENDING";
  const page = Math.max(1, Math.floor(args.page ?? 1) || 1);
  const where = { status };
  const [total, rows] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: { select: { name: true, slug: true } },
        user: { select: { name: true, email: true } },
        orderItem: { select: { order: { select: { id: true, number: true } } } },
      },
    }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id, rating: r.rating, title: r.title, body: r.body, status: r.status, createdAt: r.createdAt,
      productName: r.product.name, productSlug: r.product.slug, authorName: r.user.name, authorEmail: r.user.email,
      orderId: r.orderItem.order.id, orderNumber: r.orderItem.order.number,
    })),
    total, page, pageSize: PAGE_SIZE, hasMore: page * PAGE_SIZE < total,
  };
}

export async function moderateReview(id: string, status: "APPROVED" | "REJECTED"): Promise<void> {
  const r = await db.review.updateMany({ where: { id }, data: { status, moderatedAt: new Date() } });
  if (r.count === 0) throw new NotFoundError("Review");
}

export function countPendingReviews(): Promise<number> {
  return db.review.count({ where: { status: "PENDING" } });
}
```

Append to `src/server/emails/templates.ts` (uses the file's private `layout`, `button`, `firstName`, `oneLine`, `e`):

```ts
export interface ReviewRequestItem { name: string; url: string }

export function reviewRequestEmail(args: { name: string | null; orderNumber: string; items: ReviewRequestItem[] }): RenderedEmail {
  const list = args.items.map((i) => `<li style="margin:0 0 8px"><a href="${e(i.url)}" style="color:#111">${e(i.name)}</a></li>`).join("");
  return {
    subject: oneLine(`How is your order ${args.orderNumber}?`),
    html: layout(
      `How are you liking it, ${firstName(args.name ?? "")}?`,
      `<p>Your order <strong>${e(args.orderNumber)}</strong> arrived a few days ago. A quick star rating helps other shoppers pick the right tee.</p><ul style="padding-left:18px">${list}</ul>${button(args.items[0].url, "Rate your order")}`,
    ),
    text: `Your order ${args.orderNumber} arrived a few days ago. Rate it:\n${args.items.map((i) => `- ${i.name}: ${i.url}`).join("\n")}`,
  };
}
```

Create `src/server/jobs/review-request.ts`:

```ts
import { db } from "@/server/db";
import { reviewRequestEmail, siteUrl } from "@/server/emails/templates";
import { sendEmailSafely } from "@/server/services/notifications";
import { addOrderEvent } from "@/server/services/order-records";
import { getSettings } from "@/server/services/settings";

export const REVIEW_REQUEST_DELAY_DAYS = 5;
export const REVIEW_REQUEST_WINDOW_DAYS = 30;
const DAY = 86_400_000;

export async function runReviewRequest(now: Date = new Date()): Promise<{ sent: number; reason?: "disabled" }> {
  const { reviewRequestsEnabled } = await getSettings();
  if (!reviewRequestsEnabled) return { sent: 0, reason: "disabled" };
  const orders = await db.order.findMany({
    where: {
      status: "DELIVERED",
      reviewRequestedAt: null,
      deliveredAt: { lte: new Date(now.getTime() - REVIEW_REQUEST_DELAY_DAYS * DAY), gte: new Date(now.getTime() - REVIEW_REQUEST_WINDOW_DAYS * DAY) },
    },
    include: {
      user: { select: { name: true, reviews: { select: { productId: true } } } },
      items: { include: { product: { select: { slug: true, status: true } } } },
    },
    orderBy: { deliveredAt: "asc" },
    take: 200,
  });
  let sent = 0;
  for (const o of orders) {
    const claim = await db.order.updateMany({ where: { id: o.id, reviewRequestedAt: null }, data: { reviewRequestedAt: now } });
    if (claim.count !== 1) continue;
    const reviewed = new Set(o.user.reviews.map((r) => r.productId));
    const seen = new Set<string>();
    const items = o.items.flatMap((i) => {
      if (!i.productId || !i.product || i.product.status !== "ACTIVE" || reviewed.has(i.productId) || seen.has(i.productId)) return [];
      seen.add(i.productId);
      return [{ name: i.productName, url: `${siteUrl()}/products/${encodeURIComponent(i.product.slug)}#write-review` }];
    });
    if (items.length === 0) continue;   // stays stamped: nothing left to ask about
    const ok = await sendEmailSafely({ to: o.email, ...reviewRequestEmail({ name: o.user.name ?? o.shipName, orderNumber: o.number, items }) });
    if (ok) {
      sent++;
      await addOrderEvent(db, o.id, "EMAIL_SENT", `Review request email sent → ${o.email}`);
    } else {
      await db.order.update({ where: { id: o.id }, data: { reviewRequestedAt: null } });
      await addOrderEvent(db, o.id, "EMAIL_FAILED", `Review request email failed → ${o.email}`);
    }
  }
  return { sent };
}
```

In `src/server/jobs/index.ts` import `runReviewRequest` and add `"review-request": runReviewRequest,` to `JOBS`.

Create `src/app/api/v1/products/[slug]/reviews/route.ts`:

```ts
import { handle, ok, requireApiUser } from "@/server/api";
import { ValidationError } from "@/server/errors";
import { createReviewBySlug, getProductReviewsBySlug } from "@/server/services/reviews";

export const GET = handle(async (req, ctx) => {
  const { slug } = await ctx.params;
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const { summary, reviews } = await getProductReviewsBySlug(slug, Number.isFinite(page) ? page : 1);
  return ok({ summary, ...reviews });
});

export const POST = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { slug } = await ctx.params;
  const body: unknown = await req.json().catch(() => {
    throw new ValidationError({ body: ["Send a JSON body"] });
  });
  return ok(await createReviewBySlug(user.id, slug, body), { status: 201 });
});
```

Run the four test files: GREEN.

- [ ] **Step 4: Product page UI**

Create `src/app/(storefront)/products/[slug]/review-actions.ts`:

```ts
"use server";

import type { ReviewStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { actionError, type ActionResult } from "@/server/action-result";
import { requireUserId } from "@/server/session-user";
import { createReview } from "@/server/services/reviews";
import type { ReviewInput } from "@/lib/validation/review";

export async function createReviewAction(productId: string, input: ReviewInput): Promise<ActionResult<{ status: ReviewStatus }>> {
  try {
    const userId = await requireUserId();
    const { status } = await createReview(userId, productId, input);
    revalidatePath("/", "layout");   // product page, and the admin pending badge
    return { ok: true, data: { status } };
  } catch (err) {
    return actionError(err);
  }
}
```

Create `src/components/storefront/reviews/rating-stars.tsx` (no hooks, usable from server and client components):

```tsx
import { Star } from "lucide-react";
import { ratingLabel } from "@/lib/rating";
import { cn } from "@/lib/utils";

export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const row = (cls: string) => (
    <span className={cn("flex", cls)}>
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="size-4 shrink-0" aria-hidden="true" />)}
    </span>
  );
  return (
    <span role="img" aria-label={ratingLabel(rating)} className={cn("relative inline-flex", className)}>
      {row("text-border")}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>{row("fill-brand text-brand")}</span>
    </span>
  );
}
```

Create `src/components/storefront/reviews/rating-summary.tsx` (server): `data-testid="rating-summary"`; left: `font-display text-6xl` `formatRating(summary.average)`, `<RatingStars rating={summary.average} />`, "Based on {count} review(s)"; right: five rows 5→1, each `grid grid-cols-[3ch_1fr_4ch] items-center gap-2 text-sm`: "5★", a bar (`h-2 rounded-full bg-surface-raised` with an inner `bg-brand` div `style={{ width: `${pct}%` }}`), count. Stacks on phones (`grid gap-6 sm:grid-cols-[auto_1fr]`).

Create `src/components/storefront/reviews/review-list.tsx` (no hooks): `<ul className="divide-y divide-border">` of `<li><article data-testid="review" className="space-y-2 py-5">` with `RatingStars`, the title (`font-medium`, when set), the body (`whitespace-pre-line text-sm leading-relaxed` — 14 px), and a muted meta line `{authorName} · Verified buyer · {formatDateIst(createdAt)}`. Props `{ reviews: ReviewView[] }`.

Create `src/components/storefront/reviews/more-reviews.tsx` (client): props `{ slug: string; initialPage: number; hasMore: boolean }`; state `items: ReviewView[]`, `page`, `more`, `loading`, `error`; **Show more reviews** (`h-11 w-full sm:w-auto`, variant secondary) fetches `/api/v1/products/${encodeURIComponent(slug)}/reviews?page=${page + 1}`, maps `createdAt: new Date(r.createdAt)` (JSON dates are strings), appends and renders `<ReviewList reviews={items} />` above the button; errors show inline in `text-danger` with the button kept for retry.

Create `src/components/storefront/reviews/review-form.tsx` (client), `data-testid="review-form"`, props `{ productId: string }`:
- **Your rating**: `<fieldset>` + `<legend className="text-sm">Your rating</legend>`; five `<label className="inline-flex size-11 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">` each containing `<input type="radio" name="rating" value={n} className="sr-only" checked={rating === n} onChange={() => setRating(n)} />`, a `Star` icon `size-7` filled (`fill-brand text-brand`) when `n <= (hover ?? rating ?? 0)` (hover via `onPointerEnter`/`onPointerLeave` on the label), and `<span className="sr-only">{n} star{n > 1 ? "s" : ""}</span>`.
- **Title (optional)** — `<Input className="h-11" maxLength={80} autoComplete="off" />` with a visible `<Label>` "Title".
- **Your review** — `<textarea rows={5} maxLength={REVIEW_BODY_MAX} className="w-full rounded-md border border-border bg-surface p-3 text-base md:text-sm" />` with a live counter `{body.length}/1000`.
- **Post review** (`h-11 w-full sm:w-auto`), disabled while pending or when no rating is picked. Submit → `createReviewAction(productId, { rating, title, body })` in `useTransition`; success → `toast.success(status === "APPROVED" ? "Thanks! Your review is live." : "Thanks! Your review will appear after a quick check.")` then `router.refresh()`; failure → `FieldError`s (`rating`, `title`, `body`) and `toast.error(message)`.

Create `src/components/storefront/reviews/product-reviews.tsx` (server), rendered as `<section id="reviews" className="scroll-mt-24 border-t border-border py-10" data-testid="reviews">`:
- `h2 className="text-3xl md:text-4xl"` "Reviews".
- `summary.count > 0` → `<RatingSummary summary={summary} />`; else `<p className="text-text-muted">No reviews yet.</p>`.
- `<div id="write-review" className="scroll-mt-24 mt-8">` by `eligibility`: `canReview` → `h3` "Write a review" + `<ReviewForm productId={productId} />`; `blocker === "signed-out"` → "Bought this tee?" + `<Link href={`/login?next=${encodeURIComponent(`/products/${slug}#write-review`)}`} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Log in to write a review</Link>`; `"not-delivered"` → muted "Reviews come from customers whose order has been delivered."; `"already-reviewed"` → muted "Thanks for reviewing this tee."
- `<ReviewList reviews={firstPage.items} />` then `<MoreReviews slug={slug} initialPage={firstPage.page} hasMore={firstPage.hasMore} />`.

`src/app/(storefront)/products/[slug]/page.tsx`: after `load(slug)`, `const session = await auth();` and extend the existing `Promise.all` with `getRatingSummary(product.id)`, `listApprovedReviews(product.id, 1)`, `getReviewEligibility(session?.user?.id ?? null, product.id)`. Replace the inline `jsonLd` object with `productJsonLd({ product, url: absoluteUrl(`/products/${product.slug}`), brandName: BRAND.name, summary, reviews: firstPage.items })`. Pass `rating={summary.count > 0 ? { average: summary.average, count: summary.count } : null}` to `ProductPurchase`, and render `<ProductReviews productId={product.id} slug={product.slug} summary={summary} firstPage={firstPage} eligibility={eligibility} />` between `ProductAccordions` and `RelatedProducts`.

`src/components/storefront/product-purchase.tsx`: accept `rating: { average: number; count: number } | null`; under the price row render, when set, `<a href="#reviews" className="inline-flex min-h-11 items-center gap-2 text-sm text-text-muted hover:text-text" data-testid="rating-link"><RatingStars rating={rating.average} /> {formatRating(rating.average)} ({rating.count})</a>`.

- [ ] **Step 5: Admin moderation, nav badge, settings**

Create `src/app/admin/reviews/actions.ts` (`"use server"`): `moderateReviewAction(id, status)` → `await requireAdmin()`, reject any `status` other than `"APPROVED"`/`"REJECTED"` with `ValidationError`, `moderateReview(id, status)`, `revalidatePath("/", "layout")`, `{ ok: true, data: null }`, `actionError(err)`.

`src/app/admin/reviews/page.tsx` (server, `metadata.title = "Reviews"`): guard; `status` from `?status=` validated against `REVIEW_STATUSES` (default `PENDING`), `page` from `?page=`; `listAdminReviews({ status, page })` and `countPendingReviews()`. Heading `h1` "Reviews"; tab links (`min-h-11 inline-flex items-center rounded-full px-4 text-sm`, active `bg-surface-raised` + `aria-current="page"`, in a horizontally scrollable row) **Pending (n)**, **Approved**, **Rejected**; then `<ul className="space-y-3">` of `ReviewModerationCard`; empty state per tab ("Nothing waiting for approval." etc.); Newer/Older pagination links `min-h-11`.

`src/components/admin/review-moderation-card.tsx` (client), `<li data-testid="review-card" className="rounded-md border border-border bg-surface p-4">`: `RatingStars` + rating number, title (`font-medium`), body (`whitespace-pre-line text-sm`), meta line with a link to the product (`/products/{slug}`, `target="_blank"`), the customer name/email, and the order number linking to `/admin/orders/{orderId}`, plus `formatDateIst(createdAt)`. Actions row (`flex flex-wrap gap-2`): **Approve** (primary, `h-11`) when status ≠ APPROVED, **Reject** (outline, `h-11`) when status ≠ REJECTED → `moderateReviewAction` in `useTransition`, `toast.success("Review approved" | "Review rejected")`, `router.refresh()`.

`src/app/admin/layout.tsx`: fetch `countPendingReviews()` alongside `countToShip()` (`Promise.all`) and pass `pendingReviewCount` to `AdminNav`. `src/components/admin/admin-nav.tsx`: accept `pendingReviewCount: number` (keep `toShipCount` and Phase 3's `printQueueCount`; the layout awaits `countToShip()`, `countPrintQueue()` and `countPendingReviews()` in one `Promise.all`); add `{ href: "/admin/reviews", label: "Reviews", icon: Star }` after **Customers**, with the same badge markup as the Orders badge when the count > 0 (`data-testid="reviews-badge"`, `<span className="sr-only">Waiting for approval: </span>{n}`).

`src/components/admin/settings-form.tsx`: add a `<fieldset>` **Reviews** with two checkboxes (in `min-h-11` labels): **Publish 4★ and 5★ reviews immediately (others wait for approval)** → `autoApproveReviews`; **Email customers for a review 5 days after delivery** → `reviewRequestsEnabled`; include both in the saved values.

- [ ] **Step 6: Verify and commit**

Run the four test files, then the full gate. Manual check on port 3001 with the mock provider: place an order as a new customer, move it to Delivered in admin, open the product at 360 px → "Write a review" shows; the star radios are 44 px and keyboard-operable (Tab to the group, arrow keys change the rating); post a 5★ review → it appears with "Verified buyer", the rating link under the price jumps to `#reviews`, and the page source JSON-LD has `aggregateRating`; post a 2★ review as another delivered customer → "after a quick check", the admin nav shows the Reviews badge, approve it from `/admin/reviews` → it appears. `curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/review-request` returns `{ "data": { "job": "review-request", … } }`. Stop the server.

```bash
git add src/lib/validation/review.ts src/lib/rating.ts src/lib/site-url.ts src/lib/json-ld.ts src/server/services/reviews.ts src/server/services/admin-reviews.ts src/server/jobs/review-request.ts src/server/jobs/index.ts src/server/emails/templates.ts "src/app/(storefront)/products/[slug]" "src/app/api/v1/products/[slug]/reviews" src/app/admin/reviews src/app/admin/layout.tsx src/components/admin/review-moderation-card.tsx src/components/admin/admin-nav.tsx src/components/admin/settings-form.tsx src/components/storefront/reviews src/components/storefront/product-purchase.tsx tests/unit/rating.test.ts tests/unit/reviews.test.ts tests/unit/product-json-ld.test.ts tests/unit/review-request-job.test.ts
git commit -m "feat(reviews): add verified-purchase reviews with moderation, ratings JSON-LD and review-request emails

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 5: SEO (sitemap, robots, metadata audit, default OG image) and optional analytics events

**Files:**
- Create: `src/lib/seo.ts`, `src/server/services/seo.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/brand-og/route.tsx`, `src/lib/analytics.ts`, `src/components/analytics/analytics-scripts.tsx`, `src/components/analytics/track-event.tsx`, `src/components/analytics/pixel-page-view.tsx`
- Modify: `src/server/content.ts` (add `listPageSlugs`), `src/app/layout.tsx` (default OG/Twitter metadata), `src/app/(storefront)/layout.tsx` (analytics), `src/app/(storefront)/page.tsx` (canonical + WebSite/Organization JSON-LD), `src/app/(storefront)/collections/page.tsx`, `src/app/(storefront)/collections/[slug]/page.tsx`, `src/app/(storefront)/products/[slug]/page.tsx`, `src/app/(storefront)/pages/[slug]/page.tsx`, `src/app/(storefront)/search/page.tsx`, `src/app/(storefront)/cart/page.tsx`, `src/app/(storefront)/checkout/page.tsx` (+ `mock-pay/[orderId]/page.tsx`), `src/app/(storefront)/orders/[number]/success/page.tsx`, `src/app/(storefront)/account/**/page.tsx`, `src/app/(auth)/layout.tsx`, `src/app/invoice/[number]/page.tsx`, `src/app/(storefront)/customize/**/page.tsx` **(Phase 3)**, `src/components/storefront/product-purchase.tsx` (add_to_cart), `.env.example`
- Test: `tests/unit/seo.test.ts`, `tests/unit/sitemap.test.ts`, `tests/unit/analytics.test.ts`

**Interfaces:**
- Consumes: `siteUrl`, `absoluteUrl` (Task 4), `jsonLdScript`, `BRAND`, `readPage`, `db`.
- Produces:

```ts
// @/lib/seo
export const META_DESCRIPTION_MAX = 155;
export const DEFAULT_OG_IMAGE: { url: string; width: number; height: number; alt: string };   // "/brand-og"
export const NO_INDEX: { index: false; follow: false };
export function metaDescription(text: string | null | undefined, fallback: string): string;  // markdown stripped, ≤ 155 chars on a word boundary
export function productMetadata(p: { slug: string; name: string; description: string; images: { url: string; alt: string }[] }, brandName: string): Metadata;
export function collectionMetadata(c: { slug: string; name: string; description: string; heroImageUrl: string | null }, brandName: string): Metadata;
export function websiteJsonLd(args: { name: string; url: string; sameAs: string[] }): Record<string, unknown>[];   // WebSite (+SearchAction) and Organization
// @/server/content (added)
export function listPageSlugs(): Promise<string[]>;
// @/server/services/seo
export interface SitemapData { products: { slug: string; updatedAt: Date; imageUrl: string | null }[]; collections: { slug: string; updatedAt: Date }[]; latest: Date | null }
export function getSitemapData(): Promise<SitemapData>;
// app routes: /sitemap.xml (dynamic), /robots.txt, /brand-og (1200 × 630 PNG, static)
// @/lib/analytics
export interface AnalyticsItem { id: string; name: string; pricePaise: number; quantity?: number; variant?: string }
export type AnalyticsEvent =
  | { name: "view_item"; item: AnalyticsItem } | { name: "add_to_cart"; item: AnalyticsItem }
  | { name: "begin_checkout"; valuePaise: number; items: AnalyticsItem[] }
  | { name: "purchase"; transactionId: string; valuePaise: number; shippingPaise?: number; items: AnalyticsItem[] };
export function analyticsIds(env: { ga?: string; pixel?: string }): { ga: string | null; pixel: string | null };   // validated ids
export function toGa4(e: AnalyticsEvent): [string, Record<string, unknown>];
export function toMetaPixel(e: AnalyticsEvent): [string, Record<string, unknown>];
export function track(e: AnalyticsEvent): void;                       // no-op unless an id is configured
// components
export function AnalyticsScripts(): JSX.Element | null;               // server; renders nothing when no ids
export function TrackEvent(props: { event: AnalyticsEvent; onceKey?: string }): null;   // client; fires on mount
export function PixelPageView(): null;                                // client; Meta PageView on client navigations
```

- [ ] **Step 1: Failing tests**

Create `tests/unit/seo.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectionMetadata, DEFAULT_OG_IMAGE, metaDescription, productMetadata, websiteJsonLd } from "@/lib/seo";
import robots from "@/app/robots";

afterEach(() => vi.unstubAllEnvs());

describe("seo helpers", () => {
  it("builds plain, bounded descriptions", () => {
    expect(metaDescription("**Heavy** cotton [tee](https://x.test) with `print`.", "fallback")).toBe("Heavy cotton tee with print.");
    expect(metaDescription("   ", "Alpha Tee by Brand")).toBe("Alpha Tee by Brand");
    const long = metaDescription("word ".repeat(80), "x");
    expect(long.length).toBeLessThanOrEqual(155);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });

  it("gives products a canonical url and their first image", () => {
    const m = productMetadata({ slug: "alpha-tee", name: "Alpha Tee", description: "", images: [{ url: "/api/uploads/a.png", alt: "" }] }, "Brand");
    expect(m).toMatchObject({
      title: "Alpha Tee", description: "Alpha Tee by Brand", alternates: { canonical: "/products/alpha-tee" },
      openGraph: { url: "/products/alpha-tee", siteName: "Brand", images: [{ url: "/api/uploads/a.png", alt: "Alpha Tee" }] },
      twitter: { card: "summary_large_image" },
    });
    const bare = productMetadata({ slug: "b", name: "B", description: "d", images: [] }, "Brand");
    expect((bare.openGraph as { images: unknown[] }).images).toEqual([{ ...DEFAULT_OG_IMAGE, alt: "Brand" }]);
  });

  it("canonicalises collections without query strings", () => {
    const m = collectionMetadata({ slug: "new-drops", name: "New Drops", description: "Fresh", heroImageUrl: null }, "Brand");
    expect(m.alternates).toEqual({ canonical: "/collections/new-drops" });
  });

  it("describes the site for search engines", () => {
    const [site, org] = websiteJsonLd({ name: "Brand", url: "https://shop.example.com", sameAs: ["https://instagram.com/x"] });
    expect(site).toMatchObject({ "@type": "WebSite", potentialAction: { "@type": "SearchAction", target: "https://shop.example.com/search?q={search_term_string}" } });
    expect(org).toMatchObject({ "@type": "Organization", url: "https://shop.example.com", sameAs: ["https://instagram.com/x"] });
  });

  it("blocks private areas in production and everything elsewhere", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example.com");
    const prod = robots();
    expect(prod.sitemap).toBe("https://shop.example.com/sitemap.xml");
    const rule = Array.isArray(prod.rules) ? prod.rules[0] : prod.rules;
    expect(rule.allow).toEqual(["/", "/api/uploads/"]);
    expect(rule.disallow).toEqual(expect.arrayContaining(["/admin", "/account", "/checkout", "/api/"]));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");
    const local = robots();
    expect((Array.isArray(local.rules) ? local.rules[0] : local.rules).disallow).toBe("/");
  });
});
```

Create `tests/unit/sitemap.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct } from "../helpers/fixtures";
import sitemap from "@/app/sitemap";
import { listPageSlugs } from "@/server/content";

describe("sitemap", () => {
  beforeEach(resetDb);

  it("lists home, active collections, active products and content pages", async () => {
    const col = await createCollection({ name: "New Drops" });
    await createCollection({ name: "Hidden", isActive: false });
    await createProduct({ name: "Alpha Tee", collectionIds: [col.id], images: [{ url: "/seed/a.svg" }] });
    await createProduct({ name: "Draft Tee", status: "DRAFT" });
    const urls = (await sitemap()).map((e) => e.url);
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    expect(urls).toContain(`${base}/`);
    expect(urls).toContain(`${base}/collections/new-drops`);
    expect(urls).toContain(`${base}/products/alpha-tee`);
    expect(urls).not.toContain(`${base}/collections/hidden`);
    expect(urls).not.toContain(`${base}/products/draft-tee`);
    for (const slug of await listPageSlugs()) expect(urls).toContain(`${base}/pages/${slug}`);
    expect(await listPageSlugs()).toContain("shipping");
  });
});
```

Create `tests/unit/analytics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analyticsIds, toGa4, toMetaPixel, type AnalyticsEvent } from "@/lib/analytics";

const item = { id: "p1", name: "Alpha Tee", pricePaise: 59900, quantity: 2, variant: "Black / M" };

describe("analytics mapping", () => {
  it("accepts only well-formed ids", () => {
    expect(analyticsIds({ ga: " G-ABC123XYZ ", pixel: "123456789012345" })).toEqual({ ga: "G-ABC123XYZ", pixel: "123456789012345" });
    expect(analyticsIds({ ga: "G-abc');alert(1)//", pixel: "12ab" })).toEqual({ ga: null, pixel: null });
    expect(analyticsIds({})).toEqual({ ga: null, pixel: null });
  });

  it("maps to GA4 ecommerce events in rupees", () => {
    expect(toGa4({ name: "add_to_cart", item })).toEqual(["add_to_cart", {
      currency: "INR", value: 1198, items: [{ item_id: "p1", item_name: "Alpha Tee", price: 599, quantity: 2, item_variant: "Black / M" }],
    }]);
    const purchase: AnalyticsEvent = { name: "purchase", transactionId: "ORD-1001", valuePaise: 127700, shippingPaise: 7900, items: [item] };
    expect(toGa4(purchase)[1]).toMatchObject({ transaction_id: "ORD-1001", value: 1277, shipping: 79, currency: "INR" });
  });

  it("maps to Meta Pixel standard events", () => {
    expect(toMetaPixel({ name: "view_item", item: { ...item, quantity: 1 } })).toEqual(["ViewContent", {
      currency: "INR", value: 599, content_type: "product", content_ids: ["p1"], contents: [{ id: "p1", quantity: 1 }], content_name: "Alpha Tee",
    }]);
    expect(toMetaPixel({ name: "begin_checkout", valuePaise: 119800, items: [item] })).toEqual(["InitiateCheckout", {
      currency: "INR", value: 1198, content_type: "product", content_ids: ["p1"], contents: [{ id: "p1", quantity: 2 }], num_items: 2,
    }]);
    expect(toMetaPixel({ name: "purchase", transactionId: "ORD-1", valuePaise: 100, items: [item] })[0]).toBe("Purchase");
  });
});
```

Run: `npm test -- tests/unit/seo.test.ts tests/unit/sitemap.test.ts tests/unit/analytics.test.ts`
Expected: FAIL.

- [ ] **Step 2: SEO helpers, services and routes**

Create `src/lib/seo.ts`:

```ts
import type { Metadata } from "next";

export const META_DESCRIPTION_MAX = 155;
export const DEFAULT_OG_IMAGE = { url: "/brand-og", width: 1200, height: 630, alt: "" };
export const NO_INDEX = { index: false, follow: false } as const;

export function metaDescription(text: string | null | undefined, fallback: string): string {
  const plain = (text ?? "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")   // [label](url) and images → label
    .replace(/[#*_`>~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return fallback;
  if (plain.length <= META_DESCRIPTION_MAX) return plain;
  const cut = plain.slice(0, META_DESCRIPTION_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function social(path: string, title: string, description: string, siteName: string, image: { url: string; alt: string } | null): Metadata {
  const images = image ? [{ url: image.url, alt: image.alt || title }] : [{ ...DEFAULT_OG_IMAGE, alt: siteName }];
  return {
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, siteName, locale: "en_IN", title, description, images },
    twitter: { card: "summary_large_image", title, description, images: images.map((i) => i.url) },
  };
}

export function productMetadata(p: { slug: string; name: string; description: string; images: { url: string; alt: string }[] }, brandName: string): Metadata {
  const description = metaDescription(p.description, `${p.name} by ${brandName}`);
  return { title: p.name, description, ...social(`/products/${p.slug}`, p.name, description, brandName, p.images[0] ?? null) };
}

export function collectionMetadata(c: { slug: string; name: string; description: string; heroImageUrl: string | null }, brandName: string): Metadata {
  const description = metaDescription(c.description, `Shop ${c.name} at ${brandName}`);
  return { title: c.name, description, ...social(`/collections/${c.slug}`, c.name, description, brandName, c.heroImageUrl ? { url: c.heroImageUrl, alt: c.name } : null) };
}

export function websiteJsonLd(args: { name: string; url: string; sameAs: string[] }): Record<string, unknown>[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: args.name,
      url: args.url,
      potentialAction: { "@type": "SearchAction", target: `${args.url}/search?q={search_term_string}`, "query-input": "required name=search_term_string" },
    },
    { "@context": "https://schema.org", "@type": "Organization", name: args.name, url: args.url, sameAs: args.sameAs },
  ];
}
```

Note on merging: Next replaces a parent's `openGraph` object wholesale when a page sets `openGraph`, so the helpers always include `siteName`, `locale` and an image (the product/collection image or the default).

Append to `src/server/content.ts` (import `readdir` from `node:fs/promises`):

```ts
export async function listPageSlugs(): Promise<string[]> {
  try {
    return (await readdir(ROOT)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).filter((s) => /^[a-z0-9-]+$/.test(s)).sort();
  } catch {
    return [];
  }
}
```

Create `src/server/services/seo.ts`:

```ts
import { db } from "@/server/db";

export interface SitemapData {
  products: { slug: string; updatedAt: Date; imageUrl: string | null }[];
  collections: { slug: string; updatedAt: Date }[];
  latest: Date | null;
}

export async function getSitemapData(): Promise<SitemapData> {
  const [products, collections] = await Promise.all([
    db.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 5000,
      select: { slug: true, updatedAt: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
    }),
    db.collection.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, updatedAt: true } }),
  ]);
  return {
    products: products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt, imageUrl: p.images[0]?.url ?? null })),
    collections,
    latest: products[0]?.updatedAt ?? null,
  };
}
```

Create `src/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";
import { listPageSlugs } from "@/server/content";
import { getSitemapData } from "@/server/services/seo";

// Reads the database: must not be prerendered at build time (the Docker build has no database).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ products, collections, latest }, pages] = await Promise.all([getSitemapData(), listPageSlugs()]);
  return [
    { url: absoluteUrl("/"), lastModified: latest ?? undefined, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/collections"), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/customize"), changeFrequency: "weekly", priority: 0.6 },
    ...collections.map((c) => ({ url: absoluteUrl(`/collections/${c.slug}`), lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({
      url: absoluteUrl(`/products/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.7,
      ...(p.imageUrl ? { images: [absoluteUrl(p.imageUrl)] } : {}),
    })),
    ...pages.map((slug) => ({ url: absoluteUrl(`/pages/${slug}`), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
```

Create `src/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const live = process.env.NODE_ENV === "production" && !/localhost|127\.0\.0\.1/.test(siteUrl());
  if (!live) return { rules: { userAgent: "*", disallow: "/" }, sitemap: absoluteUrl("/sitemap.xml") };
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/uploads/"],
      disallow: ["/admin", "/account", "/checkout", "/cart", "/orders", "/invoice", "/search", "/api/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteUrl(),
  };
}
```

Create `src/app/brand-og/route.tsx` (default share image; static at build, no database):

```tsx
import { ImageResponse } from "next/og";
import { BRAND } from "@/config/brand";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 72, background: "#0A0A0A", color: "#F5F5F0" }}>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -2, textTransform: "uppercase", lineHeight: 0.9 }}>{BRAND.name}</div>
        <div style={{ marginTop: 24, fontSize: 44, color: "#D4FF3F" }}>{BRAND.tagline}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
```

(Use the brand accent hex from `--brand` in `src/app/globals.css` if it differs from `#D4FF3F`.)

- [ ] **Step 3: Metadata audit**

Apply exactly these metadata changes (import `NO_INDEX`, helpers and `BRAND` where needed):

| Route file | Metadata |
|---|---|
| `src/app/layout.tsx` | add `applicationName: BRAND.name`, `openGraph: { type: "website", siteName: BRAND.name, locale: "en_IN", images: [{ ...DEFAULT_OG_IMAGE, alt: BRAND.name }] }`, `twitter: { card: "summary_large_image" }` (keep `title`, `description`, `metadataBase`) |
| `(storefront)/page.tsx` (home) | add `alternates: { canonical: "/" }`, `description: BRAND.tagline`; render `websiteJsonLd({ name: BRAND.name, url: siteUrl(), sameAs: Object.values(BRAND.social) })` as two `<script type="application/ld+json">` via `jsonLdScript` |
| `(storefront)/collections/page.tsx` | `title: "Collections"`, description "All collections at {BRAND.name}", `alternates: { canonical: "/collections" }` |
| `(storefront)/collections/[slug]/page.tsx` | `generateMetadata` returns `collectionMetadata(collection, BRAND.name)` (query strings for filters/sort are canonicalised away) |
| `(storefront)/products/[slug]/page.tsx` | `generateMetadata` returns `productMetadata(product, BRAND.name)` |
| `(storefront)/pages/[slug]/page.tsx` | `title: page.title`, `description: metaDescription(page.body, page.title)`, `alternates: { canonical: `/pages/${slug}` }` |
| `(storefront)/search/page.tsx` | `robots: { index: false, follow: true }` |
| `(storefront)/cart`, `checkout`, `checkout/mock-pay/[orderId]`, `orders/[number]/success`, every `account/**` page, `(auth)/layout.tsx`, `invoice/[number]` | `robots: NO_INDEX` (merge into the existing `metadata`/`generateMetadata`) |
| **(Phase 3)** `(storefront)/customize/page.tsx`, `customize/[slug]/page.tsx` | `title: "Design your own tee"` / `` `Customize ${product.name}` ``, a description, canonical `/customize` / `/customize/${slug}` |

Admin keeps its existing `robots: { index: false, follow: false }`.

- [ ] **Step 4: Analytics**

Create `src/lib/analytics.ts`:

```ts
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
```

Create `src/components/analytics/analytics-scripts.tsx`:

```tsx
import Script from "next/script";
import { analyticsIds } from "@/lib/analytics";
import { PixelPageView } from "./pixel-page-view";

export function AnalyticsScripts() {
  const { ga, pixel } = analyticsIds({ ga: process.env.NEXT_PUBLIC_GA_ID, pixel: process.env.NEXT_PUBLIC_META_PIXEL_ID });
  if (!ga && !pixel) return null;
  return (
    <>
      {ga && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      )}
      {pixel && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
          </Script>
          <PixelPageView />
        </>
      )}
    </>
  );
}
```

Create `src/components/analytics/pixel-page-view.tsx` (client): keeps a `useRef(true)` "first render" flag; a `useEffect` on `usePathname()` skips the first run (the snippet already tracked it) and otherwise calls `(window as { fbq?: (...a: unknown[]) => void }).fbq?.("track", "PageView")`. Returns `null`. (GA4's enhanced measurement already records history-based page views.)

Create `src/components/analytics/track-event.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { track, type AnalyticsEvent } from "@/lib/analytics";

/** Fires one analytics event on mount. With onceKey it fires at most once per browser session (e.g. purchase on reload). */
export function TrackEvent({ event, onceKey }: { event: AnalyticsEvent; onceKey?: string }) {
  const signature = onceKey ?? JSON.stringify(event);
  useEffect(() => {
    if (onceKey) {
      try {
        if (sessionStorage.getItem(onceKey)) return;
        sessionStorage.setItem(onceKey, "1");
      } catch {
        // storage blocked: still send once for this mount
      }
    }
    track(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per distinct event
  }, [signature]);
  return null;
}
```

Wire the events (the storefront only; admin is never tracked):
- `src/app/(storefront)/layout.tsx`: render `<AnalyticsScripts />` once, after `<Footer />`.
- Product page: `<TrackEvent event={{ name: "view_item", item: { id: product.id, name: product.name, pricePaise: product.pricePaise } }} />`.
- `product-purchase.tsx`: after a successful `addToCartAction`, `track({ name: "add_to_cart", item: { id: product.id, name: product.name, pricePaise, quantity: qty, variant: `${color} / ${chosen.size}` } })`.
- Checkout page (Phase 2 `src/app/(storefront)/checkout/page.tsx`): when the view has lines, `<TrackEvent event={{ name: "begin_checkout", valuePaise: <view total paise>, items: <view lines mapped to { id: productId, name, pricePaise: unit price paise, quantity, variant: "Color / Size" }> }} />`, using the field names of Phase 2's `CheckoutView`.
- Order status page (`/orders/[number]/success`): only in the paid/confirmed branch, `<TrackEvent onceKey={`purchase:${order.number}`} event={{ name: "purchase", transactionId: order.number, valuePaise: order.totalPaise, shippingPaise: order.shippingPaise, items: order.items.map((i) => ({ id: i.productId ?? i.sku, name: i.productName, pricePaise: i.unitPricePaise, quantity: i.quantity, variant: `${i.colorName} / ${i.size}` })) }} />` (use `Math.round(i.lineTotalPaise / i.quantity)` if `OrderItemView` has no `unitPricePaise`).

Append to `.env.example`:

```bash
# Analytics (optional; baked into the client bundle at build time, so rebuild after changing)
NEXT_PUBLIC_GA_ID=""            # GA4 measurement id, e.g. G-XXXXXXXXXX
NEXT_PUBLIC_META_PIXEL_ID=""    # Meta Pixel id (digits)
```

- [ ] **Step 5: Verify and commit**

Run the three test files, then the full gate. Manual check on port 3001: `/robots.txt` (dev → `Disallow: /`), `/sitemap.xml` lists products/collections/pages with absolute `http://localhost:3001` URLs, `/brand-og` returns a 1200 × 630 PNG, a product page's `<head>` has the canonical link, `og:image` = its first image, `twitter:card`; `/account` and `/checkout` have `noindex`. With `NEXT_PUBLIC_GA_ID=G-TEST1234` set in that shell, `window.dataLayer` receives `view_item` on a product page and `add_to_cart` after adding (DevTools console); without it no analytics script is requested. Stop the server.

```bash
git add src/lib/seo.ts src/lib/analytics.ts src/server/services/seo.ts src/server/content.ts src/app/sitemap.ts src/app/robots.ts src/app/brand-og src/app/layout.tsx "src/app/(storefront)" "src/app/(auth)/layout.tsx" "src/app/invoice/[number]/page.tsx" src/components/analytics src/components/storefront/product-purchase.tsx .env.example tests/unit/seo.test.ts tests/unit/sitemap.test.ts tests/unit/analytics.test.ts
git commit -m "feat(seo): add sitemap, robots, canonical and social metadata, default share image and optional GA4/Meta events

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

(`git status` first: stage only files this task changed under `src/app/(storefront)`.)

---

### Task 6: Security headers with a Razorpay-compatible CSP, `/api/health`, standalone output

**Files:**
- Create: `src/lib/security-headers.ts`, `src/server/services/health.ts`, `src/app/api/health/route.ts`
- Modify: `next.config.ts`, `.gitignore`
- Test: `tests/unit/security-headers.test.ts`, `tests/unit/health.test.ts`

**Interfaces:**
- Consumes: `db`.
- Produces:

```ts
// src/lib/security-headers.ts (no imports, no path aliases: next.config.ts imports it relatively)
export const SECURITY_HEADER_SOURCE: string;     // every path except /api/uploads/* and /_next/image (they set their own image CSP)
export interface CspOptions { dev: boolean; https: boolean; s3PublicBaseUrl?: string | null }
export function buildCsp(opts: CspOptions): string;
export function securityHeaders(opts: CspOptions): { key: string; value: string }[];
// @/server/services/health
export interface Health { ok: boolean; db: "up" | "down"; version: string; uptimeSec: number; time: string }
export function checkHealth(timeoutMs?: number): Promise<Health>;
// GET /api/health → 200 { status: "ok", db: "up", version, uptimeSec, time } | 503 { status: "error", db: "down", … }; Cache-Control: no-store
// next.config: output "standalone" when NEXT_OUTPUT=standalone (Dockerfile, CI); poweredByHeader false; headers() → securityHeaders
```

CSP (spec §3): Next.js App Router injects inline bootstrap scripts, so without per-request nonces (which would force every page dynamic and disable static assets caching) `script-src` needs `'unsafe-inline'`; everything else is locked down. Allowed third parties: Razorpay Checkout (`checkout.razorpay.com` script + iframe, `api.razorpay.com` iframe/XHR/form posts, `lumberjack.razorpay.com` telemetry), GA4 (`www.googletagmanager.com`, `*.google-analytics.com`, `*.analytics.google.com`) and Meta Pixel (`connect.facebook.net`, `www.facebook.com`). Images may come from any `https:` origin (S3/CDN, pixels) plus `data:`/`blob:` (the Phase 3 studio exports canvases as blobs). `frame-ancestors 'none'` + `X-Frame-Options: DENY` (the store never needs to be framed). HSTS is set by Caddy (Task 7) because it only makes sense behind real HTTPS.

- [ ] **Step 1: Failing tests**

Create `tests/unit/security-headers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCsp, SECURITY_HEADER_SOURCE, securityHeaders } from "@/lib/security-headers";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("security headers", () => {
  it("allows Razorpay checkout and the analytics hosts", () => {
    const csp = buildCsp({ dev: false, https: true });
    expect(directive(csp, "script-src")).toContain("https://checkout.razorpay.com");
    expect(directive(csp, "frame-src")).toContain("https://api.razorpay.com");
    expect(directive(csp, "connect-src")).toContain("https://lumberjack.razorpay.com");
    expect(directive(csp, "connect-src")).toContain("https://*.google-analytics.com");
    expect(directive(csp, "script-src")).toContain("https://connect.facebook.net");
    expect(directive(csp, "form-action")).toBe("form-action 'self' https://api.razorpay.com");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
  });

  it("only relaxes for development and only upgrades requests behind https", () => {
    expect(buildCsp({ dev: false, https: true })).not.toContain("'unsafe-eval'");
    expect(buildCsp({ dev: false, https: true })).toContain("upgrade-insecure-requests");
    expect(buildCsp({ dev: false, https: false })).not.toContain("upgrade-insecure-requests");
    const dev = buildCsp({ dev: true, https: false });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
  });

  it("adds the S3 origin to connect-src when configured", () => {
    expect(directive(buildCsp({ dev: false, https: true, s3PublicBaseUrl: "https://bucket.s3.ap-south-1.amazonaws.com/uploads" }), "connect-src"))
      .toContain("https://bucket.s3.ap-south-1.amazonaws.com");
    expect(buildCsp({ dev: false, https: true, s3PublicBaseUrl: "not a url" })).not.toContain("not a url");
  });

  it("sends the standard hardening headers and skips image routes", () => {
    const keys = securityHeaders({ dev: false, https: true }).map((h) => h.key);
    expect(keys).toEqual(["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy"]);
    expect(SECURITY_HEADER_SOURCE).toBe("/((?!api/uploads/|_next/image).*)");
    const re = /^\/((?!api\/uploads\/|_next\/image).*)$/;   // what Next's path-to-regexp compiles the source to
    expect(re.test("/products/alpha-tee")).toBe(true);
    expect(re.test("/api/uploads/products/a.png")).toBe(false);
    expect(re.test("/_next/image")).toBe(false);
  });
});
```

Create `tests/unit/health.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { GET } from "@/app/api/health/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("reports ok with the build version when the database answers", async () => {
    vi.stubEnv("APP_VERSION", "abc1234");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "ok", db: "up", version: "abc1234" });
  });

  it("returns 503 when the database is down", async () => {
    vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(new Error("connection refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "error", db: "down", version: "dev" });
  });
});
```

Run: `npm test -- tests/unit/security-headers.test.ts tests/unit/health.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

Create `src/lib/security-headers.ts`:

```ts
// Imported by next.config.ts with a relative path: keep this file free of imports and path aliases.

/** Every path except user uploads and the image optimizer, which send their own restrictive image CSP. */
export const SECURITY_HEADER_SOURCE = "/((?!api/uploads/|_next/image).*)";

export interface CspOptions { dev: boolean; https: boolean; s3PublicBaseUrl?: string | null }

const RAZORPAY = ["https://checkout.razorpay.com", "https://api.razorpay.com", "https://lumberjack.razorpay.com"];
const GOOGLE = ["https://www.googletagmanager.com", "https://www.google-analytics.com", "https://*.google-analytics.com", "https://*.analytics.google.com"];
const META = ["https://connect.facebook.net", "https://www.facebook.com"];

function originOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ dev, https, s3PublicBaseUrl }: CspOptions): string {
  const s3 = originOf(s3PublicBaseUrl);
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), "https://checkout.razorpay.com", "https://www.googletagmanager.com", "https://connect.facebook.net"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...RAZORPAY, ...GOOGLE, ...META, ...(s3 ? [s3] : []), ...(dev ? ["ws:", "wss:"] : [])]],
    ["frame-src", ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"]],
    ["worker-src", ["'self'", "blob:"]],
    ["media-src", ["'self'", "data:", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", "https://api.razorpay.com"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (https && !dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: CspOptions): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(opts) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com")' },
    // Razorpay opens UPI/net-banking popups that must be able to talk back to the opener.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}
```

Create `src/server/services/health.ts`:

```ts
import { db } from "@/server/db";

export interface Health { ok: boolean; db: "up" | "down"; version: string; uptimeSec: number; time: string }

export async function checkHealth(timeoutMs = 2000): Promise<Health> {
  let up = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`database did not answer within ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
    up = true;
  } catch (err) {
    console.error("[health] database check failed", err);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return { ok: up, db: up ? "up" : "down", version: process.env.APP_VERSION || "dev", uptimeSec: Math.round(process.uptime()), time: new Date().toISOString() };
}
```

Create `src/app/api/health/route.ts`:

```ts
import { checkHealth } from "@/server/services/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const h = await checkHealth();
  return Response.json(
    { status: h.ok ? "ok" : "error", db: h.db, version: h.version, uptimeSec: h.uptimeSec, time: h.time },
    { status: h.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
```

Update `next.config.ts` (keep every existing option and comment):

```ts
import type { NextConfig } from "next";
import path from "node:path";
import { SECURITY_HEADER_SOURCE, securityHeaders } from "./src/lib/security-headers";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a long-running dev server use its own build folder so `next build` cannot clobber it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The Docker image and CI build a self-contained server (`<distDir>/standalone/server.js`). Local builds skip it:
  // it copies traced node_modules into the build folder, and this machine is short on disk.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname),
  // … existing outputFileTracingIncludes, experimental.serverActions (6mb), images …
  async headers() {
    return [
      {
        source: SECURITY_HEADER_SOURCE,
        headers: securityHeaders({
          dev: process.env.NODE_ENV !== "production",
          https: siteUrl.startsWith("https://"),
          s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
        }),
      },
    ];
  },
};

export default nextConfig;
```

`headers()` is evaluated at build time, so `NEXT_PUBLIC_SITE_URL` and `S3_PUBLIC_BASE_URL` must be present when building; the Dockerfile (Task 7) passes both as build args. If `next build` cannot load the relative TypeScript import, rename the module to `security-headers.mjs` at the repo root with JSDoc types, import it with the `.mjs` extension from both `next.config.ts` and the test, and note it in the report.

Append to `.gitignore`:

```gitignore
# standalone/Lighthouse verification builds (Phase 4)
.next-standalone/
.next-lh/
```

- [ ] **Step 3: Verify**

Run the two test files (GREEN), then the full gate. Then, in Git Bash:

1. Dev CSP smoke test on port 3001: open `/`, a product, `/checkout` (as a signed-in customer with a bag) and the mock pay page with DevTools open: no `Refused to …` CSP errors in the console; `curl -sI http://localhost:3001/ | grep -iE "content-security|x-frame|referrer|permissions|cross-origin-opener"` shows all headers; `curl -sI http://localhost:3001/api/uploads/x.png` has no app CSP; `curl -s http://localhost:3001/api/health` → `{"status":"ok","db":"up","version":"dev",…}`. Stop the server.
2. Razorpay test-mode smoke test (only if the owner has put test keys in `.env`; otherwise skip and say so): with `PAYMENT_PROVIDER=razorpay` set only in the 3001 shell, click Pay → the Razorpay modal opens (no CSP errors), cancel it → the retry page shows. Stop the server.
3. Standalone build (disk permitting): `NEXT_OUTPUT=standalone NEXT_DIST_DIR=.next-standalone npm run build`, check `ls .next-standalone/standalone/server.js`, then `set -a; . ./.env; set +a; PORT=3001 HOSTNAME=127.0.0.1 node .next-standalone/standalone/server.js` in the background, `curl -s http://127.0.0.1:3001/api/health` → 200 JSON, stop it, and `rm -rf .next-standalone`. On ENOSPC: delete `.next-standalone`, report BLOCKED for this sub-step only (CI's build and docker jobs cover it).

- [ ] **Step 4: Commit**

```bash
git add src/lib/security-headers.ts src/server/services/health.ts src/app/api/health/route.ts next.config.ts .gitignore tests/unit/security-headers.test.ts tests/unit/health.test.ts
git commit -m "feat(security): add CSP and hardening headers, health endpoint and standalone build output

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 7: Container stack — Dockerfile, production Compose, Caddy, backups, cron sidecar, env template

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `.gitattributes`, `docker/entrypoint.sh`, `deploy/create-admin.mjs`, `deploy/docker-compose.prod.yml`, `deploy/Caddyfile`, `deploy/crontab`, `deploy/cron/start.sh`, `deploy/cron/run-job.sh`, `deploy/backup/backup.sh`, `deploy/.env.production.example`
- Modify: `.gitignore`
- Test: `tests/unit/deploy-kit.test.ts`

**Interfaces:**
- Consumes: `JOBS` (Phase 2 + `review-request` from Task 4 + `purge-designs` from Phase 3), `/api/health` and `NEXT_OUTPUT` (Task 6), `/api/cron/[job]` + `CRON_SECRET` (Phase 2), `LOCAL_UPLOAD_ROOT` (`/app/storage/uploads` in the image).
- Produces:

```text
Image thrift-app:<APP_VERSION>   node:22-alpine, user nextjs (1001), WORKDIR /app, `node server.js` on :3000
  build args: NEXT_PUBLIC_SITE_URL (required), NEXT_PUBLIC_GA_ID, NEXT_PUBLIC_META_PIXEL_ID, S3_PUBLIC_BASE_URL, APP_VERSION,
              PRISMA_VERSION, BCRYPTJS_VERSION (pinned = installed versions)
  entrypoint: prisma migrate deploy (skip with SKIP_MIGRATIONS=1), then CMD
  /opt/tools: prisma CLI + bcryptjs + create-admin.mjs     volume: /app/storage/uploads
Compose project "thrift" (deploy/docker-compose.prod.yml, env from deploy/.env):
  db (postgres:16-alpine, no published ports) · app (build ..) · caddy (80, 443, 443/udp) · backup (daily) · cron (TZ Asia/Kolkata)
  volumes: pgdata, uploads, backups, caddy_data, caddy_config
deploy/backup/backup.sh [loop|once]   → /backups/db-<UTC>.sql.gz and uploads-<UTC>.tar.gz, retention BACKUP_RETENTION_DAYS (14), optional S3 copy
deploy/cron/run-job.sh <job>          → POST $APP_URL/api/cron/<job> with the bearer secret; one log line per run
deploy/create-admin.mjs               → reads "email\npassword" on stdin (--stdin) or ADMIN_EMAIL/ADMIN_PASSWORD; upserts an ADMIN user
```

- [ ] **Step 1: Failing test**

Create `tests/unit/deploy-kit.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JOBS } from "@/server/jobs";

const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const envKeys = (text: string) => new Set([...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

describe("deploy kit", () => {
  it("schedules every cron job exactly once and nothing unknown", () => {
    const scheduled = [...read("deploy/crontab").matchAll(/run-job\.sh\s+([a-z0-9-]+)/g)].map((m) => m[1]);
    expect([...scheduled].sort()).toEqual(Object.keys(JOBS).sort());
  });

  it("pins the image's prisma CLI and bcryptjs to the installed versions", () => {
    const dockerfile = read("Dockerfile");
    const arg = (name: string) => dockerfile.match(new RegExp(`^ARG ${name}=(\\S+)$`, "m"))?.[1];
    expect(arg("PRISMA_VERSION")).toBe(JSON.parse(read("node_modules/prisma/package.json")).version);
    expect(arg("BCRYPTJS_VERSION")).toBe(JSON.parse(read("node_modules/bcryptjs/package.json")).version);
  });

  it("documents every environment variable the app reads", () => {
    const used = new Set<string>();
    for (const file of walk("src")) for (const m of read(file).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) used.add(m[1]);
    const documented = envKeys(read("deploy/.env.production.example"));
    const setByCompose = new Set([...read("deploy/docker-compose.prod.yml").matchAll(/^\s+([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]));
    const exempt = new Set(["NODE_ENV", "NEXT_DIST_DIR", "NEXT_OUTPUT", "NEXT_RUNTIME", "APP_VERSION"]);
    const missing = [...used].filter((k) => !documented.has(k) && !setByCompose.has(k) && !exempt.has(k));
    expect(missing).toEqual([]);
  });

  it("ships no real secrets in the production example", () => {
    const text = read("deploy/.env.production.example");
    for (const key of ["RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "SMTP_URL", "GOOGLE_CLIENT_SECRET"]) {
      expect(text).toMatch(new RegExp(`^${key}=(""|)$`, "m"));
    }
    for (const key of ["POSTGRES_PASSWORD", "AUTH_SECRET", "CRON_SECRET"]) expect(text).toMatch(new RegExp(`^${key}=replace-with-`, "m"));
  });

  it("keeps shell scripts, the crontab and the Caddyfile LF-only", () => {
    const files = ["docker/entrypoint.sh", "deploy/crontab", "deploy/Caddyfile", "deploy/cron/start.sh", "deploy/cron/run-job.sh", "deploy/backup/backup.sh", "deploy/create-admin.mjs", "Dockerfile",
      ...readdirSync("deploy").filter((f) => f.endsWith(".sh")).map((f) => `deploy/${f}`)];
    for (const f of files) expect(read(f).includes("\r"), `${f} has CRLF line endings`).toBe(false);
  });
});
```

Run: `npm test -- tests/unit/deploy-kit.test.ts`
Expected: FAIL (files missing). If Phase 3 is not merged, `purge-designs` is not in `JOBS`: leave it out of the crontab and note it in the report.

- [ ] **Step 2: Line endings and ignore rules**

Create `.gitattributes` (only these paths; no global `text=auto`, which would renormalise the whole repo):

```gitattributes
*.sh                          text eol=lf
Dockerfile                    text eol=lf
.dockerignore                 text eol=lf
deploy/crontab                text eol=lf
deploy/Caddyfile              text eol=lf
deploy/*.mjs                  text eol=lf
deploy/*.yml                  text eol=lf
deploy/.env.production.example text eol=lf
.github/workflows/*.yml       text eol=lf
```

Append to `.gitignore` (the existing `.env.*` rule would otherwise hide the production template):

```gitignore
# deployment (Phase 4)
!deploy/.env.production.example
deploy/.current-version
deploy/.previous-version
.audit/
```

Create `.dockerignore`:

```gitignore
.git
.github
node_modules
.next
.next-*
.env
.env.*
!.env.example
deploy/.env
deploy/.current-version
deploy/.previous-version
storage
test-results
playwright-report
coverage
.audit
.superpowers
.vscode
.idea
docs
tests
*.log
```

- [ ] **Step 3: Dockerfile, entrypoint, admin script**

Create `Dockerfile` (set `PRISMA_VERSION`/`BCRYPTJS_VERSION` to the output of `node -p "require('prisma/package.json').version"` and `node -p "require('bcryptjs/package.json').version"`):

```dockerfile
# syntax=docker/dockerfile:1.7
# Production image for the store. Built on the server by deploy/deploy.sh (never on the dev laptop) and by CI.

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- dependencies (postinstall runs `prisma generate`, so the schema comes first)
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- build
FROM base AS builder
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GA_ID=""
ARG NEXT_PUBLIC_META_PIXEL_ID=""
ARG S3_PUBLIC_BASE_URL=""
ARG APP_VERSION=dev
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_GA_ID=${NEXT_PUBLIC_GA_ID} \
    NEXT_PUBLIC_META_PIXEL_ID=${NEXT_PUBLIC_META_PIXEL_ID} \
    S3_PUBLIC_BASE_URL=${S3_PUBLIC_BASE_URL} \
    APP_VERSION=${APP_VERSION} \
    NEXT_OUTPUT=standalone \
    NODE_OPTIONS=--max-old-space-size=1536
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN test -n "${NEXT_PUBLIC_SITE_URL}" || (echo "NEXT_PUBLIC_SITE_URL build arg is required" >&2; exit 1)
# Lint runs in CI; the type check still runs here.
RUN npx next build --no-lint

# ---- tools used by the entrypoint and deploy/seed-admin.sh (versions pinned to package-lock, see tests/unit/deploy-kit.test.ts)
FROM base AS tools
ARG PRISMA_VERSION=6.19.3
ARG BCRYPTJS_VERSION=3.0.3
WORKDIR /opt/tools
RUN npm init -y >/dev/null \
 && npm install --no-audit --no-fund --omit=dev "prisma@${PRISMA_VERSION}" "bcryptjs@${BCRYPTJS_VERSION}" \
 && npm cache clean --force

# ---- runtime
FROM base AS runner
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION} \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=tools /opt/tools /opt/tools
COPY deploy/create-admin.mjs /opt/tools/create-admin.mjs
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/content ./content
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Belt and braces: make sure the generated Prisma client and its musl engine are present next to server.js.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /app/storage/uploads /app/.next/cache && chown -R nextjs:nodejs /app/storage /app/.next/cache
USER nextjs
EXPOSE 3000
VOLUME ["/app/storage/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
```

Create `docker/entrypoint.sh`:

```sh
#!/bin/sh
# Container entrypoint: apply pending database migrations, then start the server (CMD).
set -eu

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "[entrypoint] applying database migrations"
  node /opt/tools/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma
fi

echo "[entrypoint] starting version ${APP_VERSION:-dev}"
exec "$@"
```

Create `deploy/create-admin.mjs`:

```js
// Creates the store admin, or promotes an existing user to ADMIN and resets its password.
// Runs inside the app container (see deploy/seed-admin.sh):
//   printf '%s\n%s\n' "$EMAIL" "$PASSWORD" | node /opt/tools/create-admin.mjs --stdin
// or with ADMIN_EMAIL / ADMIN_PASSWORD in the environment. APP_DIR (default /app) locates the app's Prisma client,
// so the same script can be tried locally: APP_DIR="$PWD" DATABASE_URL=… node deploy/create-admin.mjs --stdin
import { createRequire } from "node:module";
import { join } from "node:path";
import { hash } from "bcryptjs";

const appRequire = createRequire(join(process.env.APP_DIR ?? "/app", "server.js"));
const { PrismaClient } = appRequire("@prisma/client");

async function readStdinLines() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}

const fail = (msg) => {
  console.error(`create-admin: ${msg}`);
  process.exit(1);
};

let email = process.env.ADMIN_EMAIL ?? "";
let password = process.env.ADMIN_PASSWORD ?? "";
if (process.argv.includes("--stdin")) [email = "", password = ""] = await readStdinLines();
email = email.trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("enter a valid email address");
if (password.length < 12) fail("the password must be at least 12 characters");
if (password.length > 128) fail("the password must be at most 128 characters");

const db = new PrismaClient();
try {
  const passwordHash = await hash(password, 10);
  const user = await db.user.upsert({
    where: { email },
    update: { role: "ADMIN", passwordHash },
    create: { email, name: "Admin", role: "ADMIN", passwordHash },
    select: { email: true, role: true },
  });
  console.log(`Admin ready: ${user.email} (${user.role}). Sign in at /login, then open /admin.`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await db.$disconnect();
}
```

(`bcryptjs` resolves from `/opt/tools/node_modules` because the script lives in `/opt/tools`; the app's own bundle may inline bcryptjs, so it is not relied upon. The cost factor 10 and lower-cased email match `src/server/services/auth.ts`.)

- [ ] **Step 4: Compose, Caddy, cron, backups, env template**

Create `deploy/docker-compose.prod.yml`:

```yaml
# Production stack for a single EC2 box. From the repo root:
#   docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d
# deploy/deploy.sh wraps this. Runbook: docs/deploy/aws-ec2.md
name: thrift

x-logging: &logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-thrift}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in deploy/.env}
      POSTGRES_DB: ${POSTGRES_DB:-thrift}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10
    shm_size: 128mb
    logging: *logging
    # No `ports:` on purpose: Postgres is reachable only from the other containers.

  app:
    build:
      context: ..
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SITE_URL: https://${DOMAIN:?Set DOMAIN in deploy/.env}
        NEXT_PUBLIC_GA_ID: ${NEXT_PUBLIC_GA_ID:-}
        NEXT_PUBLIC_META_PIXEL_ID: ${NEXT_PUBLIC_META_PIXEL_ID:-}
        S3_PUBLIC_BASE_URL: ${S3_PUBLIC_BASE_URL:-}
        APP_VERSION: ${APP_VERSION:-dev}
    image: thrift-app:${APP_VERSION:-dev}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-thrift}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-thrift}?schema=public
      NEXT_PUBLIC_SITE_URL: https://${DOMAIN}
      AUTH_URL: https://${DOMAIN}
      AUTH_TRUST_HOST: "true"
      APP_VERSION: ${APP_VERSION:-dev}
    volumes:
      - uploads:/app/storage/uploads
    depends_on:
      db:
        condition: service_healthy
    logging: *logging

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    environment:
      DOMAIN: ${DOMAIN}
      ACME_EMAIL: ${ACME_EMAIL:?Set ACME_EMAIL in deploy/.env}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      app:
        condition: service_healthy
    logging: *logging

  backup:
    image: postgres:16-alpine
    restart: unless-stopped
    entrypoint: ["/bin/sh", "/opt/backup/backup.sh"]
    command: ["loop"]
    environment:
      PGHOST: db
      PGUSER: ${POSTGRES_USER:-thrift}
      PGPASSWORD: ${POSTGRES_PASSWORD}
      PGDATABASE: ${POSTGRES_DB:-thrift}
      BACKUP_RETENTION_DAYS: ${BACKUP_RETENTION_DAYS:-14}
      BACKUP_S3_BUCKET: ${BACKUP_S3_BUCKET:-}
      BACKUP_S3_PREFIX: ${BACKUP_S3_PREFIX:-thrift}
      AWS_REGION: ${AWS_REGION:-ap-south-1}
    volumes:
      - ./backup:/opt/backup:ro
      - backups:/backups
      - uploads:/uploads:ro
    depends_on:
      db:
        condition: service_healthy
    logging: *logging

  cron:
    image: alpine:3.20
    restart: unless-stopped
    command: ["/bin/sh", "/opt/cron/start.sh"]
    environment:
      CRON_SECRET: ${CRON_SECRET:?Set CRON_SECRET in deploy/.env}
      APP_URL: http://app:3000
      TZ: Asia/Kolkata
    volumes:
      - ./crontab:/etc/cron.src/crontab:ro
      - ./cron:/opt/cron:ro
    depends_on:
      app:
        condition: service_healthy
    logging: *logging

volumes:
  pgdata:
  uploads:
  backups:
  caddy_data:
  caddy_config:
```

Create `deploy/Caddyfile`:

```caddyfile
# Caddy terminates TLS (automatic Let's Encrypt certificates for $DOMAIN) and proxies to the app container.
{
	email {$ACME_EMAIL}
}

{$DOMAIN} {
	encode zstd gzip

	# Product images and Phase 3 studio uploads (≤ 30 MB) fit; anything larger is refused before it reaches Node.
	request_body {
		max_size 50MB
	}

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
		-X-Powered-By
	}

	@static path /_next/static/*
	header @static Cache-Control "public, max-age=31536000, immutable"

	reverse_proxy app:3000

	log {
		output stdout
		format console
	}
}

# Send www to the bare domain (needs a DNS record for www too; see the runbook).
www.{$DOMAIN} {
	redir https://{$DOMAIN}{uri} permanent
}
```

(The app's other security headers come from `next.config.ts` so they also apply in development. Caddy replaces any incoming `X-Forwarded-For` with the client address, which is what `src/server/request-ip.ts` reads.)

Create `deploy/crontab`:

```crontab
# Schedule for the `cron` container (busybox crond, TZ=Asia/Kolkata, so times are IST).
# Each line POSTs /api/cron/<job> on the app container over the internal network; every job is idempotent.
# min hour dom mon dow  command
*/5  *    *   *   *    sh /opt/cron/run-job.sh expire-orders > /proc/1/fd/1 2>&1
0    *    *   *   *    sh /opt/cron/run-job.sh low-stock > /proc/1/fd/1 2>&1
15   *    *   *   *    sh /opt/cron/run-job.sh abandoned-cart > /proc/1/fd/1 2>&1
0    21   *   *   *    sh /opt/cron/run-job.sh daily-summary > /proc/1/fd/1 2>&1
0    11   *   *   *    sh /opt/cron/run-job.sh review-request > /proc/1/fd/1 2>&1
30   3    *   *   *    sh /opt/cron/run-job.sh purge-designs > /proc/1/fd/1 2>&1
```

Create `deploy/cron/start.sh`:

```sh
#!/bin/sh
# Entrypoint of the `cron` container (alpine): install curl + tzdata, store the bearer header for run-job.sh,
# install deploy/crontab and run busybox crond in the foreground (logs go to `docker compose logs cron`).
set -eu
: "${CRON_SECRET:?CRON_SECRET must be set}"

apk add --no-cache curl tzdata >/dev/null

umask 077
printf 'Authorization: Bearer %s\n' "$CRON_SECRET" > /run/cron-auth-header
printf '%s' "${APP_URL:-http://app:3000}" > /run/cron-app-url

mkdir -p /etc/crontabs
cp /etc/cron.src/crontab /etc/crontabs/root

echo "[cron] $(date) schedule (TZ=${TZ:-UTC}):"
grep -v '^#' /etc/crontabs/root | sed '/^[[:space:]]*$/d'
exec crond -f -d 8
```

Create `deploy/cron/run-job.sh`:

```sh
#!/bin/sh
# Usage: sh /opt/cron/run-job.sh <job>
# POSTs /api/cron/<job> on the app with the bearer header written by start.sh; prints one log line.
set -u
job="${1:?usage: run-job.sh <job>}"
base="$(cat /run/cron-app-url 2>/dev/null || echo http://app:3000)"
started="$(date '+%Y-%m-%d %H:%M:%S %Z')"

if out="$(curl -sS --fail-with-body --max-time 300 -X POST -H @/run/cron-auth-header "${base}/api/cron/${job}" 2>&1)"; then
  echo "${started} [cron] ${job} ok ${out}"
else
  status=$?
  echo "${started} [cron] ${job} FAILED (curl exit ${status}) ${out}"
  exit "${status}"
fi
```

Create `deploy/backup/backup.sh`:

```sh
#!/bin/sh
# Entrypoint of the `backup` container (postgres:16-alpine).
#   sh /opt/backup/backup.sh loop   (default) checks hourly and backs up when the newest dump is older than ~23 h
#   sh /opt/backup/backup.sh once   one backup now (used by deploy/restore.sh before a restore)
# Writes /backups/db-<UTC>.sql.gz (pg_dump) and /backups/uploads-<UTC>.tar.gz (the uploads volume),
# deletes files older than BACKUP_RETENTION_DAYS, and copies new files to s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/ when set.
set -eu
set -o pipefail

DIR=/backups
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$DIR"

log() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') [backup] $*"; }

s3_copy() {
  [ -n "${BACKUP_S3_BUCKET:-}" ] || return 0
  command -v aws >/dev/null 2>&1 || apk add --no-cache aws-cli >/dev/null
  if aws s3 cp --only-show-errors "$1" "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-thrift}/$(basename "$1")"; then
    log "copied $(basename "$1") to s3://${BACKUP_S3_BUCKET}"
  else
    log "WARNING: S3 copy of $(basename "$1") failed (local copy kept)"
  fi
}

backup_once() {
  ts="$(date -u '+%Y%m%dT%H%M%SZ')"
  db_tmp="$DIR/.db-$ts.partial"
  if pg_dump --no-owner --no-privileges | gzip -9 > "$db_tmp"; then
    mv "$db_tmp" "$DIR/db-$ts.sql.gz"
    log "database -> db-$ts.sql.gz ($(du -h "$DIR/db-$ts.sql.gz" | cut -f1))"
    s3_copy "$DIR/db-$ts.sql.gz"
  else
    rm -f "$db_tmp"
    log "ERROR: pg_dump failed"
    return 1
  fi
  if [ -d /uploads ]; then
    up_tmp="$DIR/.uploads-$ts.partial"
    if tar -czf "$up_tmp" -C /uploads .; then
      mv "$up_tmp" "$DIR/uploads-$ts.tar.gz"
      log "uploads -> uploads-$ts.tar.gz"
      s3_copy "$DIR/uploads-$ts.tar.gz"
    else
      rm -f "$up_tmp"
      log "WARNING: uploads archive failed"
    fi
  fi
  find "$DIR" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime +"$((RETENTION_DAYS - 1))" -print -delete
}

case "${1:-loop}" in
  once)
    backup_once
    ;;
  loop)
    log "started; retention ${RETENTION_DAYS} days${BACKUP_S3_BUCKET:+, copying to s3://$BACKUP_S3_BUCKET}"
    while true; do
      if [ -z "$(find "$DIR" -maxdepth 1 -name 'db-*.sql.gz' -mmin -1380 | head -n 1)" ]; then
        backup_once || log "backup failed; retrying in an hour"
      fi
      sleep 3600
    done
    ;;
  *)
    echo "usage: backup.sh [loop|once]" >&2
    exit 64
    ;;
esac
```

Create `deploy/.env.production.example` (every key the app, Compose and scripts read; `deploy/.env` is the real, gitignored copy):

```bash
# deploy/.env — production settings. Copy from deploy/.env.production.example, fill in, `chmod 600 deploy/.env`.
# Used by docker compose for both variable substitution and the app's environment. Never commit the real file.

# ---- Domain and HTTPS (Caddy gets a Let's Encrypt certificate for DOMAIN automatically)
DOMAIN=shop.example.com
ACME_EMAIL=owner@example.com

# ---- Database (internal to the Docker network; use hex so the password is URL-safe: openssl rand -hex 24)
POSTGRES_USER=thrift
POSTGRES_DB=thrift
POSTGRES_PASSWORD=replace-with-openssl-rand-hex-24

# ---- Auth.js (openssl rand -base64 32). Google sign-in is optional.
AUTH_SECRET=replace-with-openssl-rand-base64-32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ---- Image storage: local (uploads volume, included in backups) or s3
STORAGE_DRIVER=local
AWS_REGION=ap-south-1
S3_BUCKET=
S3_PUBLIC_BASE_URL=

# ---- Email: console (logs only) until SMTP or SES is set up — see docs/deploy/aws-ec2.md → Email
EMAIL_DRIVER=console
EMAIL_FROM=orders@example.com
SMTP_URL=

# ---- Payments (step 1 of "Go live": paste the Razorpay keys and webhook secret, then `bash deploy/deploy.sh --restart`)
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# ---- Cron (the cron container sends this as a bearer token to /api/cron/<job>; openssl rand -hex 32)
CRON_SECRET=replace-with-openssl-rand-hex-32

# ---- Analytics (optional; baked in at build time, so run `bash deploy/deploy.sh` after changing)
NEXT_PUBLIC_GA_ID=
NEXT_PUBLIC_META_PIXEL_ID=

# ---- Backups (daily; kept this many days in the `backups` volume; optional off-box copy to S3)
BACKUP_RETENTION_DAYS=14
BACKUP_S3_BUCKET=
BACKUP_S3_PREFIX=thrift

# ---- Seed admin (optional default email for deploy/seed-admin.sh; the password is always typed, never stored)
ADMIN_EMAIL=
```

Add any other variable that `grep -rhoE "process\.env\.[A-Z_]+" src | sort -u` shows (Phase 2/3 additions such as SES-specific names) with a one-line comment; the deploy-kit test enforces it.

- [ ] **Step 5: Verify and commit**

Run `npm test -- tests/unit/deploy-kit.test.ts` (GREEN), then the full gate, then:

```bash
cp deploy/.env.production.example deploy/.env
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env config -q && echo "compose OK"
rm -f deploy/.env
sh -n docker/entrypoint.sh && sh -n deploy/cron/start.sh && sh -n deploy/cron/run-job.sh && sh -n deploy/backup/backup.sh && echo "sh syntax OK"
node --check deploy/create-admin.mjs && echo "create-admin syntax OK"
command -v shellcheck >/dev/null && shellcheck -s sh docker/entrypoint.sh deploy/cron/*.sh deploy/backup/*.sh || echo "shellcheck not installed: reviewed by hand"
```

If the Docker CLI is not installed, say so in the report (CI validates the file in Task 8). Review the Dockerfile by reading it once more against this list: every `COPY --from` source exists in that stage; `NEXT_OUTPUT=standalone` is set before `next build`; the runner never runs as root after `USER nextjs`; the uploads directory is owned by `nextjs`. Optional local check of the admin script against the **test** database only: `printf 'admin-check@example.test\nlong-enough-password\n' | APP_DIR="$PWD" DATABASE_URL="postgresql://thrift:thrift@localhost:5432/thrift_test" node deploy/create-admin.mjs --stdin` prints "Admin ready".

```bash
git add Dockerfile .dockerignore .gitattributes .gitignore docker/entrypoint.sh deploy/create-admin.mjs deploy/docker-compose.prod.yml deploy/Caddyfile deploy/crontab deploy/cron/start.sh deploy/cron/run-job.sh deploy/backup/backup.sh deploy/.env.production.example tests/unit/deploy-kit.test.ts
git commit -m "feat(deploy): add production Dockerfile and compose stack with Caddy HTTPS, backups and cron

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 8: Server scripts, AWS EC2 runbook, GitHub Actions CI

**Files:**
- Create: `deploy/setup-ec2.sh`, `deploy/deploy.sh`, `deploy/seed-admin.sh`, `deploy/restore.sh`, `docs/deploy/aws-ec2.md`, `.github/workflows/ci.yml`
- Test: `tests/unit/deploy-kit.test.ts` (already covers the new `deploy/*.sh` line endings)

**Interfaces:**
- Consumes: everything from Task 7 (`deploy/docker-compose.prod.yml`, `deploy/.env`, image `thrift-app:<tag>`, `/opt/tools/create-admin.mjs`, `backup.sh once`, volumes `thrift_uploads`/`thrift_backups`), `/api/health`.
- Produces:

```text
sudo bash deploy/setup-ec2.sh             one-time Ubuntu 24.04 bootstrap (idempotent)
bash deploy/deploy.sh [--no-pull]         pull, build thrift-app:<git sha>, up --wait, auto-rollback to the previous tag if unhealthy, prune (keeps 3)
bash deploy/deploy.sh --restart           recreate app + cron with the current image (after editing deploy/.env)
bash deploy/deploy.sh --rollback <tag>    run an older image (migrations are not reverted)
bash deploy/seed-admin.sh [email]         create/promote the admin (password prompted, sent over stdin)
bash deploy/restore.sh list | db <file> | uploads <file>
deploy/.current-version, deploy/.previous-version   (gitignored) image tags in use
CI: .github/workflows/ci.yml → jobs `verify` (lint, typecheck, unit tests on Postgres, standalone build, compose config, shellcheck) and `docker` (image build, no push)
```

- [ ] **Step 1: Host scripts**

Create `deploy/setup-ec2.sh`:

```bash
#!/usr/bin/env bash
# One-time bootstrap for a fresh Ubuntu 24.04 EC2 instance. Safe to re-run.
#   sudo bash deploy/setup-ec2.sh
# Installs Docker Engine + the compose plugin, adds a 2 GB swap file, enables the ufw firewall (22, 80, 443),
# turns on unattended security upgrades and caps Docker log sizes.
set -Eeuo pipefail

log() { printf '\033[1m[setup]\033[0m %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash deploy/setup-ec2.sh" >&2; exit 1; }
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || log "WARNING: written for Ubuntu 24.04; this is ${PRETTY_NAME:-unknown}"

export DEBIAN_FRONTEND=noninteractive
log "installing base packages"
apt-get update -y
apt-get install -y ca-certificates curl git gnupg ufw unattended-upgrades

if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker Engine and the compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if [ ! -f /etc/docker/daemon.json ]; then
  log "capping container log size"
  mkdir -p /etc/docker
  printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": "3" }\n}\n' > /etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker

target_user="${SUDO_USER:-ubuntu}"
if id "$target_user" >/dev/null 2>&1 && ! id -nG "$target_user" | grep -qw docker; then
  usermod -aG docker "$target_user"
  log "added $target_user to the docker group (log out and back in for it to apply)"
fi

if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  log "creating a 2 GB swap file (Next.js builds need it on 2 GB instances)"
  [ -f /swapfile ] || fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -q -p /etc/sysctl.d/99-swappiness.conf

log "configuring the firewall (SSH, HTTP, HTTPS)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

log "enabling automatic security updates"
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades >/dev/null

log "done. Docker $(docker --version | cut -d' ' -f3 | tr -d ,), compose $(docker compose version --short)"
log "next: log out and back in, then: cp deploy/.env.production.example deploy/.env && nano deploy/.env"
```

(Docker publishes ports around ufw; only Caddy publishes 80/443, and Postgres publishes nothing, so ufw plus the AWS security group are consistent.)

Create `deploy/deploy.sh`:

```bash
#!/usr/bin/env bash
# Build and (re)start the production stack. Run from anywhere inside the repo on the server.
#   bash deploy/deploy.sh                  git pull, build thrift-app:<commit>, start, wait for health, roll back if unhealthy
#   bash deploy/deploy.sh --no-pull        deploy the commit that is checked out
#   bash deploy/deploy.sh --restart        re-read deploy/.env and recreate app + cron without rebuilding
#   bash deploy/deploy.sh --rollback TAG   run a previously built image (list: docker images thrift-app)
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ENV_FILE=deploy/.env
COMPOSE=(docker compose -f deploy/docker-compose.prod.yml --env-file "$ENV_FILE")
KEEP_IMAGES=3
WAIT=(--wait --wait-timeout 300)

log() { printf '\033[1m[deploy]\033[0m %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

preflight() {
  command -v docker >/dev/null 2>&1 || die "Docker is missing: sudo bash deploy/setup-ec2.sh"
  [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing: cp deploy/.env.production.example $ENV_FILE and fill it in"
  if grep -qE '^(POSTGRES_PASSWORD|AUTH_SECRET|CRON_SECRET)=replace-with-' "$ENV_FILE"; then
    die "$ENV_FILE still contains replace-with-… placeholders"
  fi
  DOMAIN="$(env_value DOMAIN)"
  if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "shop.example.com" ]; then die "set DOMAIN in $ENV_FILE"; fi
  "${COMPOSE[@]}" config -q || die "the compose configuration is invalid"
}

public_check() {
  if curl -fsS --max-time 15 "https://${DOMAIN}/api/health"; then
    echo
  else
    log "WARNING: https://${DOMAIN}/api/health is not reachable yet (DNS or the certificate may still be pending)"
  fi
}

prune_images() {
  local current previous tag
  current="$(cat deploy/.current-version 2>/dev/null || true)"
  previous="$(cat deploy/.previous-version 2>/dev/null || true)"
  # `docker images` lists newest first; keep the newest KEEP_IMAGES plus whatever is current/previous.
  docker images thrift-app --format '{{.Tag}}' | tail -n +"$((KEEP_IMAGES + 1))" | while read -r tag; do
    if [ "$tag" != "$current" ] && [ "$tag" != "$previous" ]; then docker rmi "thrift-app:$tag" >/dev/null || true; fi
  done
  docker image prune -f >/dev/null
  docker builder prune -f --filter until=168h >/dev/null || true
}

mode=deploy
pull=1
tag=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-pull) pull=0 ;;
    --restart) mode=restart ;;
    --rollback)
      mode=rollback
      tag="${2:-}"
      if [ "$#" -gt 1 ]; then shift; fi
      ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
  shift
done

preflight

if [ "$mode" = restart ]; then
  APP_VERSION="$(cat deploy/.current-version 2>/dev/null || echo dev)"
  export APP_VERSION
  log "recreating app and cron with thrift-app:$APP_VERSION"
  "${COMPOSE[@]}" up -d --no-build --force-recreate "${WAIT[@]}" app cron || die "the app did not become healthy: ${COMPOSE[*]} logs app"
  public_check
  exit 0
fi

if [ "$mode" = rollback ]; then
  [ -n "$tag" ] || die "usage: deploy.sh --rollback <tag>   (tags: docker images thrift-app)"
  docker image inspect "thrift-app:$tag" >/dev/null 2>&1 || die "there is no local image thrift-app:$tag"
  export APP_VERSION="$tag"
  log "rolling back to $tag (database migrations are not reverted)"
  "${COMPOSE[@]}" up -d --no-build "${WAIT[@]}" app cron || die "thrift-app:$tag did not become healthy"
  cp deploy/.current-version deploy/.previous-version 2>/dev/null || true
  echo "$tag" > deploy/.current-version
  public_check
  exit 0
fi

if [ "$pull" = 1 ]; then
  log "pulling the latest code"
  git pull --ff-only
fi
APP_VERSION="$(git rev-parse --short HEAD)"
export APP_VERSION
previous="$(cat deploy/.current-version 2>/dev/null || true)"

log "building thrift-app:$APP_VERSION (the first build takes several minutes)"
"${COMPOSE[@]}" build app

log "starting the stack and waiting for it to become healthy"
if ! "${COMPOSE[@]}" up -d --remove-orphans "${WAIT[@]}"; then
  "${COMPOSE[@]}" logs --tail 80 app || true
  if [ -n "$previous" ] && [ "$previous" != "$APP_VERSION" ] && docker image inspect "thrift-app:$previous" >/dev/null 2>&1; then
    log "thrift-app:$APP_VERSION is unhealthy; rolling back to $previous"
    APP_VERSION="$previous" "${COMPOSE[@]}" up -d --no-build "${WAIT[@]}" app cron caddy || true
    die "deploy of $APP_VERSION failed and was rolled back to $previous"
  fi
  die "deploy of $APP_VERSION failed (no earlier image to roll back to)"
fi

if [ -n "$previous" ] && [ "$previous" != "$APP_VERSION" ]; then echo "$previous" > deploy/.previous-version; fi
echo "$APP_VERSION" > deploy/.current-version
log "thrift-app:$APP_VERSION is healthy"
public_check
prune_images
log "done"
```

Create `deploy/seed-admin.sh`:

```bash
#!/usr/bin/env bash
# Create the store admin, or reset an existing admin's password, inside the running app container.
#   bash deploy/seed-admin.sh [email]
# The password is typed at a prompt and piped over stdin: it never touches disk, shell history or the process list.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
COMPOSE=(docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env)

email="${1:-}"
if [ -z "$email" ] && [ -f deploy/.env ]; then
  email="$(grep -E '^ADMIN_EMAIL=' deploy/.env | tail -n 1 | cut -d= -f2- | tr -d '"')"
fi
if [ -z "$email" ]; then read -rp "Admin email: " email; fi

read -rsp "Admin password (12+ characters): " password; echo
read -rsp "Repeat the password: " again; echo
[ "$password" = "$again" ] || { echo "The passwords do not match." >&2; exit 1; }
[ "${#password}" -ge 12 ] || { echo "Use at least 12 characters." >&2; exit 1; }

[ -n "$("${COMPOSE[@]}" ps -q app)" ] || { echo "The app is not running. Run: bash deploy/deploy.sh" >&2; exit 1; }
printf '%s\n%s\n' "$email" "$password" | "${COMPOSE[@]}" exec -T app node /opt/tools/create-admin.mjs --stdin
```

Create `deploy/restore.sh`:

```bash
#!/usr/bin/env bash
# Restore from the daily backups in the `backups` volume.
#   bash deploy/restore.sh list
#   bash deploy/restore.sh db db-20261001T213000Z.sql.gz            replace the live database (a fresh backup is taken first)
#   bash deploy/restore.sh uploads uploads-20261001T213000Z.tar.gz   put product/banner images back into the uploads volume
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
COMPOSE=(docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env)
die() { echo "[restore] ERROR: $*" >&2; exit 1; }
confirm() {
  local answer
  read -rp "$1 Type RESTORE to continue: " answer
  [ "$answer" = "RESTORE" ] || die "cancelled"
}

cmd="${1:-}"
file="${2:-}"
case "$cmd" in
  list)
    "${COMPOSE[@]}" exec -T backup ls -lh /backups
    ;;
  db)
    [[ "$file" =~ ^db-[0-9]{8}T[0-9]{6}Z\.sql\.gz$ ]] || die "usage: restore.sh db db-YYYYMMDDTHHMMSSZ.sql.gz (see: restore.sh list)"
    "${COMPOSE[@]}" exec -T backup test -f "/backups/$file" || die "/backups/$file does not exist"
    confirm "This REPLACES the live database with $file."
    "${COMPOSE[@]}" exec -T backup sh /opt/backup/backup.sh once
    "${COMPOSE[@]}" stop app cron
    "${COMPOSE[@]}" exec -T backup sh -c 'dropdb --if-exists --force "$PGDATABASE" && createdb "$PGDATABASE"'
    "${COMPOSE[@]}" exec -T backup sh -c "gunzip -c '/backups/$file' | psql -v ON_ERROR_STOP=1 --quiet --single-transaction"
    "${COMPOSE[@]}" up -d --no-build --wait --wait-timeout 300 app cron
    echo "[restore] database restored from $file"
    ;;
  uploads)
    [[ "$file" =~ ^uploads-[0-9]{8}T[0-9]{6}Z\.tar\.gz$ ]] || die "usage: restore.sh uploads uploads-YYYYMMDDTHHMMSSZ.tar.gz"
    confirm "This overwrites images in the uploads volume with the ones in $file."
    docker run --rm -v thrift_uploads:/uploads -v thrift_backups:/backups:ro alpine:3.20 \
      sh -c "tar -xzf '/backups/$file' -C /uploads && chown -R 1001:1001 /uploads"
    echo "[restore] uploads restored from $file"
    ;;
  *)
    sed -n '2,5p' "$0"
    exit 64
    ;;
esac
```

(The single-quoted `'$PGDATABASE'` is expanded inside the backup container, where it is set; `$file` is validated by the regex before it is interpolated.)

- [ ] **Step 2: Runbook**

Create `docs/deploy/aws-ec2.md` with these sections, written as numbered, copy-pasteable steps for a non-expert owner (commands in fenced blocks; replace `shop.example.com` consistently with "your domain"):

1. **What you need** — AWS account; a domain whose DNS you control; Razorpay account (Test mode is enough to start); an email sender (SMTP login or Amazon SES); about 30–45 minutes. Monthly cost estimate: t3.small on-demand in Mumbai ≈ US$15–17, 30 GB gp3 ≈ US$2.4, Elastic IP free while attached (charged when the instance is stopped), S3 backups cents.
2. **Launch the server** (EC2 console → region **Asia Pacific (Mumbai) ap-south-1** → Launch instance): name `store`; AMI **Ubuntu Server 24.04 LTS** (64-bit x86 for **t3.small**, or 64-bit Arm for **t4g.small** — both work because the image is built on the server); key pair → *Create new* (ED25519, .pem) and download it — this is the SSH key; network settings → *Create security group* with inbound **SSH 22 from My IP**, **HTTP 80 from Anywhere (IPv4 + IPv6)**, **HTTPS 443 from Anywhere** (optionally UDP 443 for HTTP/3); storage **30 GiB gp3**; Advanced details → *Metadata version* **V2 only** and *Metadata response hop limit* **2** (lets containers use an instance role for S3/SES later; harmless otherwise). Launch.
3. **Elastic IP** — EC2 → Elastic IPs → Allocate → Associate with the instance. Note the address.
4. **DNS** — at the domain registrar/DNS host create `A @ → <Elastic IP>` and `A www → <Elastic IP>` (TTL 300). Check with `nslookup shop.example.com` until it returns the Elastic IP. Caddy cannot get a certificate before this resolves.
5. **Connect** — `chmod 400 ~/Downloads/store.pem` then `ssh -i ~/Downloads/store.pem ubuntu@<Elastic IP>` (Windows: the same command in PowerShell or Git Bash).
6. **Bootstrap** — `git clone https://github.com/sherwynjoel/thrift-Ecom.git ~/store && cd ~/store && sudo bash deploy/setup-ec2.sh`, then `exit` and SSH in again (docker group). Private repository: create a read-only deploy key (`ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""`, add `~/.ssh/github_deploy.pub` under GitHub → repo → Settings → Deploy keys, add a `Host github.com` block with `IdentityFile ~/.ssh/github_deploy` to `~/.ssh/config`) and clone with `git@github.com:sherwynjoel/thrift-Ecom.git`.
7. **Configure** — `cp deploy/.env.production.example deploy/.env && chmod 600 deploy/.env && nano deploy/.env`: set `DOMAIN`, `ACME_EMAIL`, and generate secrets with `openssl rand -hex 24` (POSTGRES_PASSWORD), `openssl rand -base64 32` (AUTH_SECRET), `openssl rand -hex 32` (CRON_SECRET). Leave Razorpay empty for now. Table explaining every block of the file (mirrors the comments).
8. **First deploy** — `bash deploy/deploy.sh` (first build 5–10 minutes on t3.small; later builds are faster thanks to the layer cache). Success prints the `/api/health` JSON with the commit as `version`. Open `https://shop.example.com` — padlock shown.
9. **Create the admin** — `bash deploy/seed-admin.sh you@yourdomain.com`, sign in at `/login`, open `/admin` → **Settings**: business name, address, state, GSTIN, admin email, WhatsApp; then add collections, products, banners.
10. **Razorpay** ("Go live" step 1) — Test mode first: Dashboard → Account & Settings → API Keys → Generate; Webhooks → Add: URL `https://shop.example.com/api/webhooks/razorpay`, secret `openssl rand -hex 32`, events **payment.captured**, **order.paid**, **payment.failed**; put `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` in `deploy/.env`, keep `PAYMENT_PROVIDER=razorpay`, run `bash deploy/deploy.sh --restart`; place a test order with Razorpay's test card/UPI; confirm the webhook delivery shows 200 in the dashboard and the order is Paid in admin. **Switch to live**: after KYC activation, switch the dashboard to Live mode, generate live keys and add a *separate* live webhook with the same URL/events and a new secret, replace the three values, `bash deploy/deploy.sh --restart`, place one real low-value order and refund it from admin.
11. **Email** — Option A SMTP (any provider; Gmail/Google Workspace needs an app password): `EMAIL_DRIVER=smtp`, `SMTP_URL=smtps://user%40domain:app-password@smtp.provider.com:465`, `EMAIL_FROM` on your domain. Option B Amazon SES (ap-south-1): verify the domain (add the three DKIM CNAMEs), add SPF (`v=spf1 include:amazonses.com ~all`) and DMARC (`v=DMARC1; p=none; rua=mailto:you@domain`) TXT records, request production access, create SMTP credentials and use `SMTP_URL=smtps://<user>:<password>@email-smtp.ap-south-1.amazonaws.com:465` with `EMAIL_DRIVER=smtp` (or `EMAIL_DRIVER=ses` with an instance role allowing `ses:SendEmail`). `bash deploy/deploy.sh --restart`, then trigger a test (register a customer → welcome/reset email, or an order confirmation).
12. **Optional: images on S3** — bucket in ap-south-1 with public-read for `uploads/*` (or CloudFront), instance role with `s3:PutObject`/`s3:DeleteObject` on it, `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_PUBLIC_BASE_URL`; then `bash deploy/deploy.sh --no-pull` (the URL is baked into the image config). Existing local images must be copied to the bucket first (`restore.sh`-style `docker run` with `aws s3 sync`).
13. **Backups** — what runs (daily DB dump + uploads archive, 14 days in the `backups` volume), `bash deploy/restore.sh list`, run one now with `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec backup sh /opt/backup/backup.sh once`; off-box copies: create an S3 bucket with a 30-day lifecycle rule, attach an instance role allowing `s3:PutObject` on `arn:aws:s3:::<bucket>/thrift/*`, set `BACKUP_S3_BUCKET`, then `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d backup` (recreates only the backup container with the new setting). Also enable EBS snapshots with Amazon Data Lifecycle Manager (daily, keep 7) as a second layer.
14. **Restore** — `bash deploy/restore.sh db <file>` and `bash deploy/restore.sh uploads <file>`; restoring onto a brand-new server: copy the files into the `backups` volume (`docker cp <file> thrift-backup-1:/backups/`) then run the same commands.
15. **Updating and rolling back** — push to `main`, SSH in, `bash deploy/deploy.sh` (auto-rollback if the new version fails its health check); manual rollback `docker images thrift-app` → `bash deploy/deploy.sh --rollback <tag>`; note that migrations are forward-only (keep them additive; restore a backup if a migration must be undone).
16. **Verify checklist** (tick all before announcing): padlock and `https://www.` redirects to the bare domain; `curl -s https://shop.example.com/api/health` → `"status":"ok"`; `curl -sI https://shop.example.com | grep -i -E "strict-transport|content-security|x-frame"`; home, a product, the bag and checkout on a phone; register a customer, place a Razorpay test order, receive the confirmation email, admin gets the new-order email; `docker compose … logs cron --since 30m` shows `expire-orders ok` every 5 minutes; `restore.sh list` shows a backup; `https://shop.example.com/robots.txt` allows crawling and `sitemap.xml` lists products; admin Settings saved; Razorpay webhook deliveries green.
17. **Operations** — logs (`docker compose … logs -f app`, `… logs caddy`), restart (`… restart app`), disk (`df -h`, `docker system df`, `docker builder prune`), OS updates (unattended; reboot monthly with `sudo reboot` — containers restart automatically), rotating a secret (edit `deploy/.env`, `--restart`; rotating `AUTH_SECRET` signs everyone out), changing the domain (DNS, `DOMAIN`, `bash deploy/deploy.sh --no-pull` because the site URL is baked into the build).
18. **Troubleshooting** — certificate errors (DNS not pointing yet, port 80/443 closed in the security group; `docker compose … logs caddy`); 502 Bad Gateway (app starting or crashed: `logs app`, `ps`); build killed / out of memory (swap missing: re-run `setup-ec2.sh`); migrations failed on start (`logs app` shows Prisma's error; fix and redeploy or restore); emails not arriving (`EMAIL_DRIVER`, SES sandbox, spam folder); Razorpay webhook 401 (secret mismatch between dashboard and `deploy/.env`); cron 401 (`CRON_SECRET` changed without `--restart`).

- [ ] **Step 3: CI**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: thrift
          POSTGRES_PASSWORD: thrift
          POSTGRES_DB: thrift
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U thrift -d thrift"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 20
    env:
      DATABASE_URL: postgresql://thrift:thrift@localhost:5432/thrift
      AUTH_SECRET: ci-only-secret-ci-only-secret-ci-only-secret
      AUTH_TRUST_HOST: "true"
      NEXT_PUBLIC_SITE_URL: http://localhost:3000
      STORAGE_DRIVER: local
      EMAIL_DRIVER: console
      EMAIL_FROM: ci@example.com
      PAYMENT_PROVIDER: mock
      NEXT_TELEMETRY_DISABLED: "1"
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Create the test database
        run: PGPASSWORD=thrift psql -h localhost -U thrift -d thrift -c 'CREATE DATABASE thrift_test'

      - run: npm ci

      - name: Migrate
        run: |
          npx prisma migrate deploy
          npm run db:test:migrate

      - run: npm run lint
      - run: npm run typecheck
      - run: npm test

      - name: Build (standalone, as in the Docker image)
        run: npm run build
        env:
          NEXT_OUTPUT: standalone

      - name: Check the deploy kit
        run: |
          cp deploy/.env.production.example deploy/.env
          docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env config -q
          rm deploy/.env
          shellcheck deploy/*.sh
          shellcheck -s sh docker/entrypoint.sh deploy/cron/*.sh deploy/backup/*.sh

  docker:
    runs-on: ubuntu-24.04
    needs: verify
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build the production image (not pushed)
        uses: docker/build-push-action@v6
        with:
          context: .
          push: false
          build-args: |
            NEXT_PUBLIC_SITE_URL=https://ci.example.com
            APP_VERSION=${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

(`npm test` reads `.env.test`, which already points at `localhost:5432/thrift_test`. E2E is not run in CI: it needs a seeded database and browsers; it stays a local gate.)

- [ ] **Step 4: Verify and commit**

```bash
bash -n deploy/setup-ec2.sh && bash -n deploy/deploy.sh && bash -n deploy/seed-admin.sh && bash -n deploy/restore.sh && echo "bash syntax OK"
command -v shellcheck >/dev/null && shellcheck deploy/*.sh || echo "shellcheck not installed: reviewed by hand"
cp deploy/.env.production.example deploy/.env && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env config -q && echo "compose OK"; rm -f deploy/.env
bash deploy/deploy.sh --help
```

`deploy.sh --help` must print its usage lines without touching Docker (it exits before `preflight`). Then run the full gate (the deploy-kit test now also checks the four new scripts for CRLF). Review each script once more against the shell rules in Global Constraints.

```bash
git add deploy/setup-ec2.sh deploy/deploy.sh deploy/seed-admin.sh deploy/restore.sh
git update-index --chmod=+x deploy/setup-ec2.sh deploy/deploy.sh deploy/seed-admin.sh deploy/restore.sh
git add docs/deploy/aws-ec2.md .github/workflows/ci.yml
git commit -m "feat(deploy): add EC2 bootstrap, deploy, admin and restore scripts, runbook and CI workflow

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 9: Whole-site mobile audit and polish (screenshots, fixes, automated layout checks)

**Files:**
- Create: `tests/e2e/routes.ts`, `tests/e2e/mobile-layout.spec.ts`, `tests/audit/mobile-screenshots.spec.ts`, `playwright.audit.config.ts`
- Modify: `playwright.config.ts` (project `mobile-360`), `package.json` (script `audit:mobile`), `src/app/layout.tsx` (viewport), `src/app/globals.css` (`pb-safe`, tap highlight), and the UI files listed in the fix checklist (Step 3): `src/app/admin/layout.tsx`, `src/components/admin/admin-nav.tsx`, `src/components/admin/products-table.tsx`, `src/app/admin/collections/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/products/page.tsx`, `src/components/admin/{product-editor,variant-matrix,collection-editor}.tsx`, `src/components/ui/{sheet,dialog,select}.tsx`, `src/components/storefront/{header,mobile-nav,cart-trigger,product-purchase,filter-rail,sort-select,footer,newsletter-form,gallery,cart-line,cart-panel}.tsx`, `src/components/auth/*-form.tsx`, `src/components/motion/{parallax,lenis-provider,magnetic-button,magnetic-link}.tsx`, `src/app/(storefront)/search/page.tsx`, plus whatever else the audit report flags
- Test: `tests/e2e/mobile-layout.spec.ts` (e2e), screenshots via `npm run audit:mobile` (not committed)

**Interfaces:**
- Consumes: `register`, `login`, `uniqueEmail`, `addFirstProductToBag` (e2e helpers), `Sheet*` primitives, `SignOutButton`, `countToShip`, `countPendingReviews`.
- Produces:

```ts
// tests/e2e/routes.ts
export interface AuditRoute { name: string; path: string }
export const PUBLIC_ROUTES: AuditRoute[]; export const CUSTOMER_ROUTES: AuditRoute[]; export const ADMIN_ROUTES: AuditRoute[];
export function discoverStorefrontRoutes(page: Page): Promise<AuditRoute[]>;   // first product page, first studio page (Phase 3)
export function discoverAdminRoutes(page: Page): Promise<AuditRoute[]>;        // first product editor, order, collection, banner
export function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; viewport: number; culprits: string[] }>;
export function smallTapTargets(page: Page, min?: number): Promise<string[]>;  // "button[data-testid=x] "Label" 36×36"
export function settle(page: Page): Promise<void>;                             // fonts ready + a short pause for animations
// npm run audit:mobile → .audit/mobile/{360x740,390x844}/<name>.png + report.json (gitignored)
// AdminNav: phone drawer (Sheet, side="left") below lg; props { toShipCount, pendingReviewCount, printQueueCount (Phase 3), footer?: ReactNode }
// globals.css: @utility pb-safe
```

Mobile requirements (spec §2) and how each is enforced: **no horizontal scroll** and **tap targets ≥ 44 px** → `tests/e2e/mobile-layout.spec.ts` on every route at 360 × 740 (fails the suite); **readable type ≥ 14 px body**, **bottom sticky CTA on product and checkout**, **filters as a bottom sheet**, **admin tables → cards below 768 px**, **admin nav drawer**, **`inputMode`/`autocomplete`**, **safe-area insets**, **`sizes` on images**, **lighter animations on phones** → the checklist in Step 3, verified on the screenshots; **Lighthouse mobile ≥ 85** on home and product → Step 5.

- [ ] **Step 1: Audit tooling**

Create `tests/e2e/routes.ts`:

```ts
import type { Page } from "@playwright/test";

export interface AuditRoute { name: string; path: string }

export const PUBLIC_ROUTES: AuditRoute[] = [
  { name: "home", path: "/" },
  { name: "collections", path: "/collections" },
  { name: "collection", path: "/collections/new-drops" },
  { name: "search", path: "/search?q=tee" },
  { name: "cart", path: "/cart" },
  { name: "page-shipping", path: "/pages/shipping" },
  { name: "customize", path: "/customize" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "forgot-password", path: "/forgot-password" },
  { name: "not-found", path: "/this-page-does-not-exist" },
];

export const CUSTOMER_ROUTES: AuditRoute[] = [
  { name: "account", path: "/account" },
  { name: "account-orders", path: "/account/orders" },
  { name: "account-addresses", path: "/account/addresses" },
  { name: "account-wishlist", path: "/account/wishlist" },
  { name: "checkout", path: "/checkout" },
];

export const ADMIN_ROUTES: AuditRoute[] = [
  { name: "admin", path: "/admin" },
  { name: "admin-orders", path: "/admin/orders" },
  { name: "admin-print-queue", path: "/admin/print-queue" },
  { name: "admin-products", path: "/admin/products" },
  { name: "admin-product-new", path: "/admin/products/new" },
  { name: "admin-collections", path: "/admin/collections" },
  { name: "admin-inventory", path: "/admin/inventory" },
  { name: "admin-customers", path: "/admin/customers" },
  { name: "admin-reviews", path: "/admin/reviews" },
  { name: "admin-coupons", path: "/admin/coupons" },
  { name: "admin-offers", path: "/admin/offers" },
  { name: "admin-banners", path: "/admin/banners" },
  { name: "admin-banner-new", path: "/admin/banners/new" },
  { name: "admin-settings", path: "/admin/settings" },
];

async function firstHref(page: Page, selector: string): Promise<string | null> {
  const link = page.locator(selector).first();
  return (await link.count()) > 0 ? link.getAttribute("href") : null;
}

export async function discoverStorefrontRoutes(page: Page): Promise<AuditRoute[]> {
  const out: AuditRoute[] = [];
  await page.goto("/collections/new-drops");
  const product = await firstHref(page, '[data-testid="product-card"] a[href^="/products/"]');
  if (product) out.push({ name: "product", path: product });
  await page.goto("/customize");
  const studio = await firstHref(page, 'main a[href^="/customize/"]');
  if (studio) out.push({ name: "studio", path: studio });
  return out;
}

export async function discoverAdminRoutes(page: Page): Promise<AuditRoute[]> {
  const found: [string, string, string][] = [
    ["admin-product-edit", "/admin/products", 'main a[href^="/admin/products/"]:not([href="/admin/products/new"])'],
    ["admin-order", "/admin/orders", '[data-testid="order-row"] a[href^="/admin/orders/"]'],
    ["admin-collection-edit", "/admin/collections", 'main a[href^="/admin/collections/"]:not([href="/admin/collections/new"])'],
    ["admin-banner-edit", "/admin/banners", '[data-testid="banner-row"] a[href^="/admin/banners/"]'],
  ];
  const out: AuditRoute[] = [];
  for (const [name, list, selector] of found) {
    await page.goto(list);
    const href = await firstHref(page, selector);
    if (href) out.push({ name, path: href });
  }
  return out;
}

export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(300);
}

export async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; viewport: number; culprits: string[] }> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const culprits: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= viewport + 1) continue;
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible") { clipped = true; break; }
      }
      if (clipped) continue;
      culprits.push(`${el.tagName.toLowerCase()}${el.dataset.testid ? `[data-testid=${el.dataset.testid}]` : ""}.${[...el.classList].slice(0, 3).join(".")} right=${Math.round(r.right)}`);
      if (culprits.length >= 5) break;
    }
    return { scrollWidth: document.documentElement.scrollWidth, viewport, culprits };
  });
}

export async function smallTapTargets(page: Page, min = 44): Promise<string[]> {
  return page.evaluate((min) => {
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="radio"], [role="checkbox"], [role="tab"], [role="switch"], [role="option"]';
    const ok = (r: DOMRect) => r.width >= min - 0.5 && r.height >= min - 0.5;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (el.closest('[data-tap-exempt], [aria-hidden="true"], [inert]')) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) {
        // Visually hidden inputs (sr-only radios/checkboxes) count through their label.
        const label = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
        if (!label || ok(label.getBoundingClientRect())) continue;
        out.push(`label for ${el.tagName.toLowerCase()}[name=${el.getAttribute("name") ?? ""}] ${Math.round(label.getBoundingClientRect().width)}×${Math.round(label.getBoundingClientRect().height)}`);
        continue;
      }
      // Inline links inside running text (WCAG 2.5.8 inline exception), e.g. "Read our <a>returns policy</a>."
      if (el.tagName === "A" && style.display === "inline" && el.closest("p")) continue;
      if (ok(r)) continue;
      const label = (el as HTMLInputElement).type === "checkbox" || (el as HTMLInputElement).type === "radio" ? el.closest("label") : null;
      if (label && ok(label.getBoundingClientRect())) continue;
      const name = el.getAttribute("aria-label") || el.textContent?.trim().replace(/\s+/g, " ").slice(0, 30) || el.getAttribute("name") || "";
      out.push(`${el.tagName.toLowerCase()}${el.dataset.testid ? `[data-testid=${el.dataset.testid}]` : ""} "${name}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  }, min);
}
```

Create `playwright.audit.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// Screenshot audit: npm run audit:mobile → .audit/mobile/<viewport>/*.png + report.json (gitignored).
export default defineConfig({
  ...base,
  testDir: "tests/audit",
  outputDir: ".audit/test-results",
  reporter: "list",
  retries: 0,
  timeout: 600_000,
  projects: [
    { name: "360x740", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 } } },
    { name: "390x844", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
```

Create `tests/audit/mobile-screenshots.spec.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { addFirstProductToBag, login, register, uniqueEmail } from "../e2e/helpers";
import {
  ADMIN_ROUTES, CUSTOMER_ROUTES, PUBLIC_ROUTES, discoverAdminRoutes, discoverStorefrontRoutes, horizontalOverflow, settle, smallTapTargets, type AuditRoute,
} from "../e2e/routes";

type Finding = { route: string; status: number | null; overflow: Awaited<ReturnType<typeof horizontalOverflow>>; smallTargets: string[] };

async function capture(page: Page, routes: AuditRoute[], group: string): Promise<Finding[]> {
  const dir = `.audit/mobile/${test.info().project.name}`;
  mkdirSync(dir, { recursive: true });
  const findings: Finding[] = [];
  for (const r of routes) {
    const res = await page.goto(r.path);
    await settle(page);
    await page.screenshot({ path: `${dir}/${group}-${r.name}.png`, fullPage: true, animations: "disabled" });
    findings.push({ route: r.path, status: res?.status() ?? null, overflow: await horizontalOverflow(page), smallTargets: await smallTapTargets(page) });
  }
  return findings;
}

test("capture every page at this viewport", async ({ page, browser }) => {
  const report: Record<string, Finding[]> = {};
  report.public = await capture(page, [...PUBLIC_ROUTES, ...(await discoverStorefrontRoutes(page))], "public");

  await register(page, uniqueEmail("audit"));
  await addFirstProductToBag(page);
  report.customer = await capture(page, CUSTOMER_ROUTES, "customer");

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const ctx = await browser.newContext({ ...test.info().project.use });
    const admin = await ctx.newPage();
    await login(admin, email, password);
    await expect(admin).not.toHaveURL(/\/login/);
    report.admin = await capture(admin, [...ADMIN_ROUTES, ...(await discoverAdminRoutes(admin))], "admin");
    await ctx.close();
  }
  writeFileSync(`.audit/mobile/${test.info().project.name}/report.json`, JSON.stringify(report, null, 2));
});
```

In `package.json` scripts add `"audit:mobile": "playwright test -c playwright.audit.config.ts"`. (`.audit/` is already gitignored by Task 7.)

- [ ] **Step 2: Run the audit (before fixes)**

`npm run audit:mobile` (uses the e2e web server on port 3001 and the dev database; register/admin credentials as in the e2e suite). Open `.audit/mobile/360x740/*.png` and `390x844/*.png` and both `report.json` files and write the concrete list of problems into the task report (route → problem). Expect at least the items in the checklist below; add anything else found (Phase 3 studio included).

- [ ] **Step 3: Fix checklist**

Work through every row; each fix is small and local. "Tap" = at least 44 × 44 px.

| # | Area | Problem | Fix |
|---|---|---|---|
| 1 | `src/app/layout.tsx` | no viewport export; notch/home-bar insets unavailable | `export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0A0A0A" };` (never disable zoom) |
| 2 | `src/app/globals.css` | no safe-area helper | add `@utility pb-safe { padding-bottom: max(0.75rem, env(safe-area-inset-bottom)); }` and `html { -webkit-tap-highlight-color: transparent; text-size-adjust: 100%; }`; use `pb-safe` on every fixed/sticky bottom bar: product sticky bar, checkout pay bar (Phase 2), settings/banner/product save bars, orders bulk bar (Phase 2), studio bottom bar and tool sheet (Phase 3), cart drawer footer, filter sheet |
| 3 | `admin-nav.tsx` + `admin/layout.tsx` | below `lg` the nav is a long horizontally scrolling row under a tall header | Phone/tablet: a sticky top bar `sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden` with a menu button (`size-11`, `aria-label="Open admin menu"`, `data-testid="admin-menu"`, a brand dot when any badge count > 0) opening `<Sheet>` `side="left"` (`w-[85vw] max-w-xs overflow-y-auto bg-surface p-4 pb-safe`) that lists the same items vertically (`min-h-11 flex items-center gap-3 rounded-md px-3`, badges right-aligned) and the sign-out control passed in as `footer` (the layout passes `<SignOutButton />`); the sheet closes on navigation (`useEffect` on `usePathname()` → `setOpen(false)`). Desktop (`lg`+) keeps today's sidebar. One `ITEMS` array drives both. Keep every badge prop (`toShipCount`, `pendingReviewCount`, Phase 3's `printQueueCount`) |
| 4 | `products-table.tsx` | `<table min-w-[720px]>` scrolls sideways on phones | Keep the `products-table` and `product-row` test ids (used by `tests/e2e/admin.spec.ts`). Single-DOM responsive list as in Phase 2's orders table: header row `hidden md:grid md:grid-cols-[56px_1fr_110px_80px_80px_80px_100px_110px]`; `<ul>` of `<li data-testid="product-row" className="grid grid-cols-[56px_1fr_auto] items-center gap-x-3 gap-y-1 border-b border-border py-3 md:grid-cols-[…same…]">`: thumbnail, name link (`min-h-11 inline-flex items-center`), status badge; the numbers (variants, stock, saves, price, updated) collapse into a muted second line on phones (`col-start-2 md:col-start-auto`) |
| 5 | `admin/collections/page.tsx`, `admin/page.tsx` (low-stock table) | same table pattern | same conversion (`data-testid` values unchanged: `collections-table` on the list wrapper, `low-stock-table`) |
| 6 | `variant-matrix.tsx` | 560 px table inside the editor | keep it inside its own `overflow-x-auto` container with a right-edge fade hint; stock/price inputs `h-11 w-24` with `inputMode="numeric"` / `inputMode="decimal"` |
| 7 | admin forms (`product-editor`, `collection-editor`, `admin/products/page.tsx` search, Phase 2 forms) | 32–36 px inputs/buttons; save button far from thumb | inputs/selects `h-11`, buttons `h-11`; the product editor's Save bar becomes `sticky bottom-0 … pb-safe` on phones like the settings form; price inputs `inputMode="decimal"`, stock `inputMode="numeric"`, slug `autoCapitalize="none" autoCorrect="off"` |
| 8 | `header.tsx`, `mobile-nav.tsx`, `cart-trigger.tsx` | icon links/buttons are `p-2` + 20 px icon = 36 px | `inline-flex size-11 items-center justify-center`; mobile menu links `min-h-11 flex items-center` |
| 9 | `ui/sheet.tsx`, `ui/dialog.tsx` close buttons | ~32 px | close button `size-11` (keep position) |
| 10 | `product-purchase.tsx` | colour swatches 32 px; size chips ~36 px; qty buttons ~36 px; "n left" is 10 px; sticky bar has no safe-area padding | swatch `button` → `size-11 rounded-full p-1.5` wrapping an inner `span.size-full.rounded-full` with the colour (ring on the button when selected); size chips `min-h-11 min-w-11`; qty buttons `size-11`; stock hint `text-xs`; sticky bar `pb-safe`, its button `h-11`, and it hides while the main Add to bag button is on screen (`IntersectionObserver` on the `add-to-cart` button → toggles `translate-y-full`) so there is exactly one visible CTA at a time |
| 11 | `filter-rail.tsx` + `sort-select.tsx` | filter chips/checkbox rows < 44 px; the bottom sheet has no footer; sort select 36 px | the bottom sheet (already `side="bottom"`) gets `pb-safe`, a sticky footer with **Show {n} results** (`h-11 w-full`, closes the sheet; `n` = current result count passed from the page) and **Clear all**; chips `min-h-11 px-4`; checkbox rows wrapped in `min-h-11` labels; price inputs `h-11 inputMode="numeric"`; the filter trigger and sort select `h-11` |
| 12 | `footer.tsx`, `newsletter-form.tsx` | list links ~20 px tall; email input lacks keyboard hints | links `inline-flex min-h-11 items-center`; social links likewise; newsletter input `type="email" inputMode="email" autoComplete="email" enterKeyHint="send"` and `h-11` with an `h-11` button |
| 13 | auth forms (`src/components/auth/*-form.tsx`) | keyboard/autofill hints | email `type="email" inputMode="email" autoComplete="email" autoCapitalize="none"`; password `autoComplete="current-password"` (login) / `"new-password"` (register, reset); name `autoComplete="name"`; all inputs and buttons `h-11` |
| 14 | search (`header.tsx` form, `search/page.tsx`) | plain text input | `type="search" inputMode="search" enterKeyHint="search" autoComplete="off"`, `h-11` on the page |
| 15 | Phase 2 address form / checkout | verify only | phone `type="tel" inputMode="tel" autoComplete="tel"`, PIN `inputMode="numeric" autoComplete="postal-code" maxLength={6}`, name `autoComplete="name"`, lines `address-line1`/`address-line2`, city `address-level2`, state `address-level1`; pay bar `pb-safe`; fix anything missing |
| 16 | `gallery.tsx`, `cart-line.tsx`, `cart-panel.tsx` | thumbnails/qty controls small; missing `sizes` | thumbnail buttons ≥ 44 px (64 px tiles are fine), qty ± `size-11`, remove button `size-11`; every `next/image` with `fill` has a `sizes` that matches its rendered width (run `grep -rn "fill" src/components src/app | grep Image` and check each) |
| 17 | motion | parallax/smooth scroll cost on phones | `parallax.tsx`: skip the tween when `window.matchMedia("(max-width: 767px)").matches` (static on phones); `lenis-provider.tsx`: do not start Lenis when `matchMedia("(pointer: coarse)").matches` (native touch scrolling, sticky bars stay stable); `magnetic-button.tsx`/`magnetic-link.tsx`: no pointer tracking when `matchMedia("(hover: none)").matches` |
| 18 | type | small body text | body copy is never below `text-sm` (14 px); `text-xs` only for badges, meta lines and legal fine print; replace any `text-[10px]`/`text-[11px]` used for information (the bag count badge may stay) |
| 19 | account (`account-nav.tsx`, orders, addresses, wishlist) | pills row may overflow | pills row `overflow-x-auto` with `-mx-4 px-4` scroll padding; each pill `min-h-11`; no page-level overflow |
| 20 | **(Phase 3)** studio `/customize/[slug]` | verify only | toolbar buttons `size-11`, bottom sheet tabs `min-h-11`, canvas never wider than the viewport, sticky bar `pb-safe`; layout-only fixes allowed |

Anything else in `report.json` (overflow culprits, small targets) gets the same treatment. Mark genuinely decorative or duplicated controls (e.g. carousel dots already 44 px, inline text links) exempt only by the rules built into `smallTapTargets`; use `data-tap-exempt` only for elements that cannot be enlarged without breaking meaning (e.g. inline links inside dense legal text), and list each use in the report.

- [ ] **Step 4: Automated layout check for every route**

In `playwright.config.ts`: add a project `{ name: "mobile-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 } }, testMatch: /mobile-layout/ }` and extend the desktop project's `testIgnore` to `/checkout-mobile|mobile-layout/`.

Create `tests/e2e/mobile-layout.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { addFirstProductToBag, login, register, uniqueEmail } from "./helpers";
import {
  ADMIN_ROUTES, CUSTOMER_ROUTES, PUBLIC_ROUTES, discoverAdminRoutes, discoverStorefrontRoutes, horizontalOverflow, settle, smallTapTargets, type AuditRoute,
} from "./routes";

async function audit(page: Page, routes: AuditRoute[]) {
  for (const r of routes) {
    await page.goto(r.path);
    await settle(page);
    const o = await horizontalOverflow(page);
    expect.soft(o.scrollWidth, `${r.path} scrolls sideways (${o.scrollWidth}px > ${o.viewport}px): ${o.culprits.join(" | ")}`).toBeLessThanOrEqual(o.viewport);
    expect.soft(await smallTapTargets(page), `${r.path} has tap targets under 44 px`).toEqual([]);
  }
}

test.describe("mobile layout at 360 × 740", () => {
  test("storefront pages", async ({ page }) => {
    test.slow();
    await audit(page, [...PUBLIC_ROUTES, ...(await discoverStorefrontRoutes(page))]);
  });

  test("customer pages", async ({ page }) => {
    test.slow();
    await register(page, uniqueEmail("m360"));
    await addFirstProductToBag(page);
    await audit(page, CUSTOMER_ROUTES);
  });

  test("admin pages", async ({ page }) => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    test.skip(!email || !password, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");
    test.setTimeout(300_000);
    await login(page, email!, password!);
    await expect(page).not.toHaveURL(/\/login/);
    await audit(page, [...ADMIN_ROUTES, ...(await discoverAdminRoutes(page))]);
    await page.goto("/admin");
    await page.getByTestId("admin-menu").click();
    await expect(page.getByRole("dialog").getByRole("link", { name: /orders/i })).toBeVisible();
  });
});
```

(**Phase 3** routes `/admin/print-queue` and the studio are included automatically when they exist; `/admin/print-queue` 404s gracefully without Phase 3 and still must not scroll sideways.)

Run `npx playwright test --project=mobile-360` until green, then re-run `npm run audit:mobile` and compare the new screenshots with Step 2 (attach the before/after list of fixed items to the report).

- [ ] **Step 5: Lighthouse (mobile, production build)**

Disk permitting:

```bash
NEXT_DIST_DIR=.next-lh npm run build
NEXT_DIST_DIR=.next-lh NEXT_PUBLIC_SITE_URL=http://localhost:3001 npx next start -p 3001 &
CHROME_PATH="$(node -e "console.log(require('@playwright/test').chromium.executablePath())")" \
  npx --yes lighthouse@12 http://localhost:3001/ --form-factor=mobile --only-categories=performance,accessibility,best-practices,seo --quiet --chrome-flags="--headless=new" --output=json --output-path=.audit/lh-home.json
# same for the first product URL from .audit/mobile/360x740/report.json → .audit/lh-product.json
```

Read `categories.performance.score` (× 100) from both files. Target ≥ 85 for performance on home and product. If below: check the LCP element (hero image must be `priority` with correct `sizes`; the first product image on the product page `priority`), render-blocking fonts (`display: "swap"` in `src/app/fonts.ts`), and large client bundles (lazy-load the gallery dialog and the size guide with `next/dynamic`), then re-measure. Stop the server, `rm -rf .next-lh`, confirm nothing listens on 3001. If `npx lighthouse` cannot be downloaded or disk runs out, report the scores as "not measured" (do not add Lighthouse as a dependency).

- [ ] **Step 6: Verify and commit**

Full gate plus `npm run test:e2e` (all projects, including `mobile-360`), revert `tsconfig.json`/`next-env.d.ts` churn, confirm nothing listens on 3001. Commit in two commits so review is easy:

```bash
git add tests/e2e/routes.ts tests/audit/mobile-screenshots.spec.ts playwright.audit.config.ts package.json
git commit -m "test(mobile): add screenshot audit and route discovery for 360 and 390 px viewports

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
git add tests/e2e/mobile-layout.spec.ts playwright.config.ts src/app/layout.tsx src/app/globals.css <every UI file changed in Step 3>
git commit -m "fix(mobile): admin drawer and card lists, 44px tap targets, safe areas, input hints and lighter motion on phones

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 10: Growth e2e, README "Go live in 2 steps", env audit, final acceptance and whole-project review

**Files:**
- Create: `tests/e2e/growth.spec.ts`
- Modify: `README.md`, `.env.example` (final audit), `playwright.config.ts` (only if the desktop project needs the new spec excluded from other projects — it does not by default)
- Test: `tests/e2e/growth.spec.ts`

**Interfaces:**
- Consumes: e2e helpers (`register`, `login`, `uniqueEmail`, `addFirstProductToBag`, `checkoutWithMockPayment`), test ids `product-card`, `wishlist-button`, `wishlist-page`, `review-form`, `review`, `rating-summary`, `review-card`, `announcement-bar`, `ticker`, `banner-form`, `order-row`, `order-status`, `next-action`; labels "Carrier", "Tracking number", "Save & mark shipped", "Title", "Your review", "Announcement text", "Announcement link", "Ticker line (text)", "Show on the site"; buttons "Post review", "Approve", "Save settings", "Save banner", "Delete banner".
- Produces: `tests/e2e/growth.spec.ts`; README sections **Go live in 2 steps**, **Deployment**, **Mobile audit**, **Analytics**, **Security headers**; env table rows for the new variables.

- [ ] **Step 1: Growth e2e**

Create `tests/e2e/growth.spec.ts`:

```ts
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addFirstProductToBag, checkoutWithMockPayment, login, register, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function adminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

async function confirmDelete(page: Page, buttonName: RegExp) {
  page.once("dialog", (d) => d.accept());   // DeleteButton may use window.confirm …
  await page.getByRole("button", { name: buttonName }).first().click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: /delete/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();   // … or a confirmation dialog
}

test("wishlist: guests are asked to log in; customers save from a card and remove from the wishlist page", async ({ page }) => {
  await page.goto("/collections/new-drops");
  await page.getByTestId("product-card").first().getByTestId("wishlist-button").click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcollections%2Fnew-drops/);

  await register(page, uniqueEmail("wish"));
  await page.goto("/collections/new-drops");
  const card = page.getByTestId("product-card").first();
  const name = (await card.getByRole("heading").textContent())!.trim();
  const heart = card.getByTestId("wishlist-button");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");

  await page.goto("/account/wishlist");
  const saved = page.getByTestId("wishlist-page").getByTestId("product-card").filter({ hasText: name });
  await expect(saved).toBeVisible();
  await saved.getByTestId("wishlist-button").click();
  await expect(saved).toHaveCount(0);
});

test.describe("admin-driven growth features", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");

  test("a delivered customer reviews the product; it shows on the product page and in moderation", async ({ page, browser }) => {
    test.slow();
    const title = `Great fit ${Date.now()}`;
    await register(page, uniqueEmail("review"), "Asha Rao");
    await addFirstProductToBag(page);
    const productPath = new URL(page.url()).pathname;
    const number = await checkoutWithMockPayment(page);

    const admin = await adminPage(browser);
    await admin.goto(`/admin/orders?q=${encodeURIComponent(number)}`);
    await admin.getByTestId("order-row").filter({ hasText: number }).getByRole("link", { name: number }).click();
    await admin.getByLabel("Carrier").selectOption("delhivery");
    await admin.getByLabel("Tracking number").fill("E2EREVIEW1");
    await admin.getByRole("button", { name: "Save & mark shipped" }).click();
    await expect(admin.getByTestId("order-status").first()).toHaveText(/shipped/i);
    await admin.getByTestId("next-action").click();
    await expect(admin.getByTestId("order-status").first()).toHaveText(/delivered/i);

    await page.goto(`${productPath}#write-review`);
    const form = page.getByTestId("review-form");
    await form.getByRole("radio", { name: "5 stars" }).check({ force: true });
    await form.getByLabel("Title").fill(title);
    await form.getByLabel("Your review").fill("Heavy cotton, and the print is still sharp after three washes.");
    await form.getByRole("button", { name: "Post review" }).click();

    // Auto-approval may be switched off in this database: approve it in admin if it is waiting.
    await admin.goto("/admin/reviews?status=PENDING");
    const pending = admin.getByTestId("review-card").filter({ hasText: title });
    if (await pending.count()) {
      await pending.getByRole("button", { name: "Approve" }).click();
      await expect(pending).toHaveCount(0);
    }
    await admin.goto("/admin/reviews?status=APPROVED");
    await expect(admin.getByTestId("review-card").filter({ hasText: title })).toBeVisible();
    await admin.context().close();

    await page.goto(productPath);
    await expect(page.getByTestId("review").filter({ hasText: title })).toBeVisible();
    await expect(page.getByTestId("rating-summary")).toBeVisible();
    await expect(page.getByText("Thanks for reviewing this tee.")).toBeVisible();
  });

  test("the announcement bar and an admin ticker line show on the storefront", async ({ page, browser }) => {
    test.slow();
    const text = `E2E sale ${Date.now()}`;
    const admin = await adminPage(browser);
    await admin.goto("/admin/settings");
    const annText = admin.getByLabel("Announcement text");
    const annLink = admin.getByLabel("Announcement link");
    const previous = { text: await annText.inputValue(), link: await annLink.inputValue() };
    try {
      await annText.fill(text);
      await annLink.fill("/collections/new-drops");
      await admin.getByRole("button", { name: "Save settings" }).click();
      await expect(admin.getByText(/saved/i).first()).toBeVisible();
      await page.goto("/");
      await expect(page.getByTestId("announcement-bar")).toContainText(text);
      await page.getByTestId("announcement-bar").getByRole("link").click();
      await expect(page).toHaveURL(/\/collections\/new-drops/);

      await admin.goto("/admin/banners/new");
      const form = admin.getByTestId("banner-form");
      await form.getByLabel("Ticker line (text)").check();
      await form.getByLabel("Title").fill(text);
      await form.getByLabel("Show on the site").check();
      await form.getByRole("button", { name: "Save banner" }).click();
      await expect(admin).toHaveURL(/\/admin\/banners\/[^/]+$/);
      await page.goto("/");
      await expect(page.getByTestId("ticker")).toContainText(text);
      await confirmDelete(admin, /delete banner/i);
      await expect(admin).toHaveURL(/\/admin\/banners$/);
    } finally {
      await admin.goto("/admin/settings");
      await admin.getByLabel("Announcement text").fill(previous.text);
      await admin.getByLabel("Announcement link").fill(previous.link);
      await admin.getByRole("button", { name: "Save settings" }).click();
      await admin.context().close();
    }
  });
});
```

(The HERO carousel is covered by unit tests and the Task 2 manual check; e2e does not create live hero slides because `home.spec.ts` runs against the same dev database.)

- [ ] **Step 2: README and env audit**

Add to `README.md`, directly under the title paragraph:

````markdown
## Go live in 2 steps

Everything else is in the repo: the production Docker image, the Compose stack (app, Postgres, Caddy with automatic HTTPS, daily backups, scheduled jobs), the server scripts and a step-by-step runbook. Only two things need the owner:

1. **Razorpay keys.** In the Razorpay dashboard create API keys and a webhook to `https://<your-domain>/api/webhooks/razorpay` for `payment.captured`, `order.paid` and `payment.failed`. Put `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` into `deploy/.env` on the server and run `bash deploy/deploy.sh --restart`. (Test mode first; switch to Live keys and a live webhook after KYC.)
2. **A server you can SSH into.** Launch an Ubuntu 24.04 EC2 instance in Mumbai, point the domain at it and run four commands — `sudo bash deploy/setup-ec2.sh`, fill `deploy/.env`, `bash deploy/deploy.sh`, `bash deploy/seed-admin.sh you@yourdomain.com`. Every click and command is in [docs/deploy/aws-ec2.md](docs/deploy/aws-ec2.md) (about 30–45 minutes).
````

Add after the existing Phase 2 sections:

- **Deployment** — one paragraph describing the stack (services, volumes, where logs/backups live), the three everyday commands (`bash deploy/deploy.sh`, `--restart`, `--rollback <tag>`) and a link to the runbook; note that `NEXT_PUBLIC_*` and `S3_PUBLIC_BASE_URL` are baked in at build time, so changing them needs `bash deploy/deploy.sh --no-pull`.
- **Cron** — replace the Phase 2 crontab snippet with: "In production the `cron` container runs `deploy/crontab` (IST times) against the app over the internal network; no host crontab is needed." and add the rows `review-request | 11:00 IST daily | one review request per delivered order, 5–30 days after delivery` and **(Phase 3)** `purge-designs | 03:30 IST daily`.
- **Mobile audit** — `npm run audit:mobile` writes screenshots of every page at 360 × 740 and 390 × 844 plus `report.json` to `.audit/mobile/`; `npx playwright test --project=mobile-360` enforces no sideways scroll and 44 px tap targets on every route.
- **Analytics** — optional `NEXT_PUBLIC_GA_ID` (GA4) and `NEXT_PUBLIC_META_PIXEL_ID`; scripts load only when set; events `view_item`, `add_to_cart`, `begin_checkout`, `purchase` (Meta: ViewContent, AddToCart, InitiateCheckout, Purchase); the admin is never tracked.
- **Security headers** — CSP and hardening headers come from `src/lib/security-headers.ts` (Razorpay and analytics hosts allowed); HSTS from Caddy; `/api/health` for uptime checks.
- **Environment variables** table: add `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID` (optional analytics), `APP_VERSION` (set automatically by `deploy.sh`), `NEXT_OUTPUT` (set by the Dockerfile/CI), and a line "Production values live in `deploy/.env`, documented in `deploy/.env.production.example`."
- **Local setup** — unchanged; add "Phase 4 needs no new local setup."

Audit `.env.example` once more: `grep -rhoE "process\.env\.[A-Z_]+" src | sort -u` — every variable except `NODE_ENV`, `NEXT_DIST_DIR`, `NEXT_OUTPUT`, `NEXT_RUNTIME` and `APP_VERSION` appears in `.env.example` (development) and `deploy/.env.production.example` (the deploy-kit test covers the latter).

- [ ] **Step 3: Final acceptance (spec §4)**

Run, in order, and paste the tail of each output into the task report:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
cp deploy/.env.production.example deploy/.env && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env config -q && echo "compose OK"; rm -f deploy/.env
bash -n deploy/*.sh && for f in docker/entrypoint.sh deploy/cron/*.sh deploy/backup/*.sh; do sh -n "$f"; done && echo "scripts OK"
```

All green (`test:e2e` covers the desktop, mobile, reduced-motion, mobile-checkout and mobile-360 projects; the admin-dependent specs run because `ADMIN_EMAIL`/`ADMIN_PASSWORD` are in `.env`). Revert `tsconfig.json`/`next-env.d.ts` churn; confirm nothing listens on port 3001.

- [ ] **Step 4: Whole-project review with fixes**

Dispatch a code review (superpowers:requesting-code-review) of `git diff main...HEAD` plus a read-through of the whole `src/` tree with this checklist, then fix every confirmed finding in small commits (each with the two trailer lines) and re-run Step 3:

1. **Authorization:** every admin page calls `requireAdminPage()`, every admin action/route `requireAdmin()` first; every storefront mutation resolves the user server-side (`requireUserId`/`requireApiUser`); no action trusts a client-sent user id, price or status.
2. **Input validation:** every action/route parses with Zod (or a service that does); links rendered from admin input pass `isSafeHref`; no `dangerouslySetInnerHTML` except `jsonLdScript` output and the analytics snippets with validated ids.
3. **Secrets:** none logged (grep `console.` for `SECRET`, `password`, `token`), none in client bundles (`NEXT_PUBLIC_` only for public ids), `deploy/.env` gitignored, scripts never echo secrets.
4. **Payments:** Razorpay flow still works under the CSP (Task 6 smoke test); webhook and verify routes unchanged and idempotent.
5. **Database:** only services/jobs import `@/server/db`; new queries are indexed (`Review(productId,status,createdAt)`, `WishlistItem(productId)`, `Order(status,deliveredAt)`, `Banner(placement,active,sortOrder)`).
6. **Mobile:** `mobile-360` green; screenshots reviewed; no page-level horizontal scroll.
7. **Deploy kit:** Dockerfile stages copy what the runner needs; compose has no published DB port; scripts are idempotent and quote expansions; runbook commands match script names and flags exactly.
8. **Docs:** README "Go live in 2 steps" matches `deploy.sh` flags and the runbook section numbers.

Record the findings and their fixes (or why a finding was rejected) in the task report.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/growth.spec.ts README.md .env.example
git commit -m "docs(launch): add go-live guide, deployment and mobile audit docs, and growth e2e coverage

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

## Spec decisions resolved in this plan

- **STRIP banners** are text-only ticker lines (they replace the static ticker items); image and button fields apply to HERO slides only. `Banner.imageKey` is therefore nullable, and a HERO slide cannot be switched on until it has a desktop image.
- **Banner images** are stored as storage keys and resolved to URLs at read time; the phone image falls back to the desktop image. New banners start switched off.
- **Announcement bar** is text + optional link in Settings, rendered above the sticky header (it scrolls away), not dismissible.
- **One review per customer per product** (`@@unique([productId, userId])`) in addition to the spec's `orderItemId @unique`; the oldest unreviewed delivered order item is linked.
- **Auto-approve** applies only to 4–5★ when the setting is on (default); 1–3★ always wait for moderation. Admins can re-moderate (approve ↔ reject) at any time.
- **Review requests** go out 5–30 days after delivery (older deliveries at launch are not emailed), once per order, listing only products the customer has not reviewed; there is a Settings switch to turn them off.
- **Wishlist** keeps rows for archived products (hidden from the list, re-shown if re-published), caps at 200 items, and lives in a React context seeded by the storefront layout (no flash, remounted on login/logout).
- **Robots** block everything outside production or on localhost; production allows `/api/uploads/` (product images) while disallowing the rest of `/api/`, plus `/admin`, `/account`, `/checkout`, `/cart`, `/orders`, `/invoice`, `/search`.
- **Default share image** is a static `/brand-og` route (`next/og`) referenced from metadata, not a file-convention `opengraph-image`, so product/collection images are never overridden by a root image.
- **Analytics** loads only on the storefront (never admin), only when a validated id is set; no consent banner is added (out of scope; revisit with the privacy policy).
- **CSP** uses `'unsafe-inline'` for scripts (App Router inline bootstrap without nonces, keeping pages cacheable); `'unsafe-eval'` and `ws:` only in development; `upgrade-insecure-requests` only when the site URL is https. HSTS is set by Caddy, the rest by Next.js.
- **Standalone output** is enabled by `NEXT_OUTPUT=standalone` (Dockerfile and CI) instead of unconditionally, because local standalone builds copy node_modules into the build folder and the dev machine is short on disk; production and CI always build standalone.
- **Prisma CLI and bcryptjs in the image** live in `/opt/tools` (pinned to the lockfile versions by a unit test) because the standalone bundle contains neither the CLI nor, reliably, bcryptjs.
- **Cron** runs in a tiny alpine sidecar with busybox crond and `TZ=Asia/Kolkata`, calling the app over the internal network (never through Caddy); the host needs no crontab. The bearer secret is written to a 0600 header file, never onto the command line.
- **Backups** include the uploads volume (local image storage) as well as the database; the loop takes a backup when the newest is ~23 h old, so restarts never skip or double a day.
- **Deploy** tags images with the git commit, waits for health with `docker compose up --wait`, rolls back automatically to the previous tag on failure, keeps the last three images; database migrations are forward-only.
- **CI** builds the Docker image (without pushing) so the Dockerfile is validated even though it is never built on the dev laptop; e2e stays a local gate.
- **Tap-target check** exempts only inline links inside paragraphs and visually hidden inputs whose label is ≥ 44 px; anything else must be enlarged or explicitly marked `data-tap-exempt` with a reason in the report.

## Carried-over deferrals relevant to this plan

- In-memory rate limits (reviews, auth) still assume a single app instance, which the single-EC2 deployment satisfies.
- No CDN in front of Caddy; add CloudFront later if traffic or image weight grows (S3 storage already supported).
- No cookie-consent banner for analytics; add one if marketing expands beyond India or legal advice requires it.
- Review photos, helpful votes and replies are out of scope.
- Automated Lighthouse in CI is not added (no new dependencies); scores are measured locally in Task 9.
- Log shipping/metrics (CloudWatch agent) is not configured; logs stay in Docker's capped json-file logs.

## Plan self-review

- **Spec coverage:** §1 banners → Task 2; announcement bar → Tasks 1–2; wishlist → Task 3; reviews, moderation, auto-approve, JSON-LD rating, review-request job → Task 4; SEO sitemap/robots/metadata/OG/Product JSON-LD availability → Tasks 4–5; analytics → Task 5. §2 mobile polish (screenshots at 360 × 740 and 390 × 844, no horizontal scroll, 44 px targets, type, sticky CTAs, filter sheet, admin cards and drawer, input hints, safe areas, `sizes`, lighter motion, Lighthouse ≥ 85) → Task 9. §3 standalone, health, security headers/CSP → Task 6; Dockerfile, compose (app, db, caddy, backup), cron sidecar, env template → Task 7; setup/deploy/seed-admin scripts, runbook (every listed item), CI → Task 8. §4 acceptance, review, README go-live → Task 10.
- **Placeholders:** none. Service, job, test, Dockerfile, compose, Caddyfile, crontab, scripts and workflow code is complete; UI tasks specify files, props, actions, markup, test ids and accessibility, with full code for the carousel, wishlist button/context, announcement bar, analytics components and audit helpers.
- **Consistency check (every referenced symbol and where it is defined):** `blankToNull` (T1, `@/lib/validation/common`) · `isSafeHref`, `isExternalHref`, `safeHrefSchema` (T1) · settings keys `announcementText`, `announcementHref`, `autoApproveReviews`, `reviewRequestsEnabled` (T1) · fixtures `settingsInputFrom`, `createDeliveredPurchase` (T1) · Prisma `Banner`, `BannerPlacement`, `WishlistItem`, `Review`, `ReviewStatus`, `Order.reviewRequestedAt` (T1) · `BANNER_PLACEMENTS`, `bannerInputSchema`, `BannerInput` (T2) · `BannerState`, `bannerState`, `BANNER_STATE_LABEL` (T2) · `BannerSlot`, `BannerView`, `AdminBannerRow`, `Announcement`, `getLiveBanners`, `getAnnouncement`, `listAdminBanners`, `getAdminBanner`, `createBanner`, `updateBanner`, `deleteBanner`, `moveBanner`, `setBannerImage` (T2) · `saveBannerAction`, `deleteBannerAction`, `moveBannerAction`, `setBannerImageAction` (T2) · `HeroBanners`, `AnnouncementBar`, `Ticker({ items })`, `DEFAULT_TICKER_ITEMS`, `BannerForm`, `BannerImageUploader`, `BannerList` (T2) · `getProductCardsByIds` (T3, catalog) · `MAX_WISHLIST_ITEMS`, `listWishlistProductIds`, `listWishlist`, `addToWishlist`, `removeFromWishlist` (T3) · `toggleWishlistAction`, `WishlistProvider`, `useWishlist`, `WishlistButton`, `AdminProductRow.wishlistCount` (T3) · `REVIEW_BODY_MAX`, `REVIEWS_PAGE_SIZE`, `REVIEW_STATUSES`, `reviewInputSchema`, `ReviewInput` (T4) · `roundRating`, `formatRating`, `ratingLabel`, `reviewerName`, `autoApproves` (T4) · `siteUrl`, `absoluteUrl` (T4, `@/lib/site-url`; the Phase 2 `siteUrl` in templates is unchanged and used by the job) · `productJsonLd` (T4) · `ReviewView`, `RatingSummary`, `ReviewBlocker`, `ReviewEligibility`, `getRatingSummary`, `listApprovedReviews`, `getProductReviewsBySlug`, `getReviewEligibility`, `createReview`, `createReviewBySlug` (T4) · `AdminReviewRow`, `listAdminReviews`, `moderateReview`, `countPendingReviews` (T4) · `ReviewRequestItem`, `reviewRequestEmail` (T4, templates) · `REVIEW_REQUEST_DELAY_DAYS`, `REVIEW_REQUEST_WINDOW_DAYS`, `runReviewRequest`, `JOBS["review-request"]` (T4) · `createReviewAction`, `moderateReviewAction`, `RatingStars`, `RatingSummary` component, `ReviewList`, `MoreReviews`, `ReviewForm`, `ProductReviews`, `ReviewModerationCard`, `AdminNav({ pendingReviewCount })` (T4) · `META_DESCRIPTION_MAX`, `DEFAULT_OG_IMAGE`, `NO_INDEX`, `metaDescription`, `productMetadata`, `collectionMetadata`, `websiteJsonLd` (T5) · `listPageSlugs` (T5, content) · `SitemapData`, `getSitemapData` (T5) · `AnalyticsItem`, `AnalyticsEvent`, `analyticsIds`, `toGa4`, `toMetaPixel`, `track`, `AnalyticsScripts`, `TrackEvent`, `PixelPageView` (T5) · `SECURITY_HEADER_SOURCE`, `CspOptions`, `buildCsp`, `securityHeaders` (T6) · `Health`, `checkHealth`, `GET /api/health` (T6) · `NEXT_OUTPUT` (T6 next.config, T7 Dockerfile, T8 CI) · image args `PRISMA_VERSION`, `BCRYPTJS_VERSION`, `/opt/tools/create-admin.mjs`, compose services/volumes, `backup.sh once|loop`, `run-job.sh`, `deploy/crontab` job names (T7) · `deploy.sh --no-pull|--restart|--rollback`, `seed-admin.sh`, `restore.sh list|db|uploads`, `setup-ec2.sh` (T8) · `AuditRoute`, `PUBLIC_ROUTES`, `CUSTOMER_ROUTES`, `ADMIN_ROUTES`, `discoverStorefrontRoutes`, `discoverAdminRoutes`, `horizontalOverflow`, `smallTapTargets`, `settle`, `pb-safe`, `AdminNav({ footer })`, `admin-menu` test id, `mobile-360` project, `audit:mobile` script (T9) · `growth.spec.ts` (T10). Phase 2/3 symbols are listed under "Existing interfaces". Every Phase 4 symbol is defined in the task listed or earlier than its first use.
- **Order of dependencies:** Task 1 (schema) precedes all feature tasks; Task 4 creates `@/lib/site-url` before Task 5 uses it; Task 4 registers `review-request` before Task 7's crontab test requires it; Task 6's `NEXT_OUTPUT` and `/api/health` precede the Dockerfile healthcheck (Task 7); Task 7's `.gitignore`/`.gitattributes` precede Task 8's scripts; Task 9 depends on every UI from Tasks 2–5 existing; Task 10 runs last. `src/lib` files that reference server types use `import type` only.

