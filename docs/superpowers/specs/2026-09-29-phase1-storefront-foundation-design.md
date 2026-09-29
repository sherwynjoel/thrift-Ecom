# Phase 1: Storefront Foundation — Design Spec

Date: 2026-09-29
Status: Approved to build (architecture section reviewed by owner; remaining sections decided by Claude at the owner's request to proceed)

## 1. Goal

Build the foundation of a custom T-shirt e-commerce site: a dark, streetwear-styled, animated storefront with a real catalog, cart, and accounts, plus an admin panel for products, variants, and stock. Everything is API-first so a future mobile app reuses the same backend.

Phase 1 ends when a visitor can browse collections, filter and sort, open a product, pick a size and color, add to a persistent cart, register or log in (email or Google), and an admin can create products with variants and stock that appear on the storefront. Deployed to a single EC2 instance.

### Out of scope for Phase 1

Checkout, Razorpay, orders, emails to customers, coupons and bundle offers, homepage banner admin, the custom design tool, wishlist, reviews, phone OTP, COD, Shiprocket, 3D preview. These are Phases 2 to 4 and each gets its own spec.

### Decisions already made with the owner

| Topic | Decision |
|---|---|
| Build type | Fully custom code, API-first, Next.js web first, mobile app later |
| Payments (Phase 2) | Razorpay |
| Designer (Phase 3) | Upload image, custom text, front and back, shirt style and color, 2D canvas preview |
| Login | Email + password and Google. Phone captured at checkout |
| Admin v1 | Products/variants/stock, orders, custom print queue, coupons/offers/banners (Phase 1 ships products/variants/stock only) |
| Look | Dark streetwear, bold type, loud accent, marquee and scroll effects |
| Shipping (Phase 2) | Manual, prepaid only |
| Hosting | One AWS EC2 instance running Docker Compose |
| Brand | Name and logo not decided. Single config constant, placeholder until provided |

## 2. Architecture

One Next.js 15 application (App Router, TypeScript, React 19) in this repository with three faces and one codebase:

- **Storefront** pages under `src/app/(storefront)`.
- **Admin** pages under `src/app/admin`, protected by middleware that requires an `ADMIN` role in the session.
- **Public REST API** under `src/app/api/v1`, for the future mobile app. Handlers validate input with Zod and call services. They never touch Prisma directly.

**Service layer** in `src/server/services` holds all business logic: `catalog`, `cart`, `auth`, `search`, `admin-products`. Pages and server actions call services directly. API handlers call the same services. Services are the only code that uses Prisma.

**Adapters** in `src/server/adapters` isolate external systems behind interfaces so local development needs no AWS account:

- `StorageAdapter`: `put(key, bytes, contentType)`, `getPublicUrl(key)`, `delete(key)`. Implementations: `LocalDiskStorage` (writes under `./storage/uploads`, served by a route handler) and `S3Storage` (presigned PUT, CloudFront URL). Selected by `STORAGE_DRIVER=local|s3`.
- `EmailAdapter`: `send({to, subject, html})`. Implementations: `ConsoleEmail` (dev) and `SesEmail` (prod). Phase 1 only uses it for the password reset email.

**Auth**: Auth.js v5 with the Prisma adapter, a Credentials provider (email + bcrypt password) and a Google provider. JWT session strategy. The JWT carries `userId` and `role`. The `/api/v1` routes accept the same JWT as a `Bearer` header, which is how the mobile app will authenticate.

**Cart**: persisted in Postgres. Anonymous visitors get a `cart_token` httpOnly cookie that maps to a cart row. On login, the guest cart merges into the user's cart (quantities added, capped by stock) and the cookie is cleared.

**Money**: integers in paise, INR only. Formatting happens in one helper.

### Project structure

```
src/
  app/
    (storefront)/          # layout with header, cart drawer, footer, Lenis provider
      page.tsx             # home
      collections/[slug]/  # product grid with filters and sort
      products/[slug]/     # product detail
      search/              # search results
      cart/                # full cart page (same component as the drawer)
      account/             # profile, placeholder for orders
      pages/[slug]/        # shipping, returns, about (markdown content)
    (auth)/login, register, forgot-password, reset-password
    admin/                 # dashboard, products, collections
    api/
      auth/[...nextauth]/
      v1/                  # public REST API
      uploads/[...path]/   # serves local-disk uploads in dev
  server/
    services/              # catalog, cart, auth, search, admin-products
    adapters/              # storage, email
    db.ts                  # Prisma client singleton
    errors.ts              # typed domain errors and HTTP mapping
    auth.ts                # Auth.js config
  components/
    ui/                    # primitives (button, input, sheet, dialog, tabs, toast)
    storefront/            # header, hero, marquee, product-card, cart-drawer, filters
    admin/                 # data table, product form, variant matrix, image uploader
    motion/                # LenisProvider, Reveal, Marquee, Parallax, MagneticButton
  lib/
    validation/            # Zod schemas shared by forms and API
    money.ts, slug.ts, utils.ts
  config/
    brand.ts               # BRAND_NAME, tagline, social links, free-shipping threshold
    site.ts                # nav, footer links
  styles/globals.css       # Tailwind v4 + design tokens
prisma/
  schema.prisma
  seed.ts                  # admin user + sample collections, products, variants
content/pages/*.md         # shipping, returns, about
docs/superpowers/specs/    # this file and later phases
docker-compose.yml         # local Postgres
docker-compose.prod.yml    # app + postgres + caddy for EC2
Dockerfile
```

## 3. Data model (Prisma, PostgreSQL)

All ids are cuid strings. Timestamps `createdAt`, `updatedAt` on every table.

**User**: `email` (unique), `passwordHash` (nullable, Google-only users), `name`, `image`, `role` enum `CUSTOMER | ADMIN`. Plus Auth.js tables `Account` and `VerificationToken` for Google linking and password reset tokens. No `Session` table (JWT strategy).

**Collection**: `slug` (unique), `name`, `description`, `heroImageUrl` (nullable), `sortOrder`, `isFeatured`, `isActive`.

**Product**: `slug` (unique), `name`, `description` (markdown), `fit` enum `OVERSIZED | REGULAR | RELAXED`, `fabric` (string), `basePricePaise`, `compareAtPricePaise` (nullable), `isCustomizable` (bool, used by Phase 3), `status` enum `DRAFT | ACTIVE | ARCHIVED`. Relations: `images` (ProductImage[]), `variants` (ProductVariant[]), `collections` via `ProductCollection` join table with `sortOrder`.

**ProductImage**: `productId`, `url`, `alt`, `sortOrder`, `colorName` (nullable; when set the gallery switches to these images for that color).

**ProductVariant**: `productId`, `sku` (unique), `size` (string, from the size list `XS S M L XL XXL 3XL`), `colorName`, `colorHex`, `pricePaise` (nullable override of base price), `stock` (int, never negative), `sortOrder`. Unique on `(productId, size, colorName)`.

**Cart**: `userId` (nullable, unique), `guestToken` (nullable, unique). Exactly one of the two is set.

**CartItem**: `cartId`, `variantId`, `quantity` (1 to 10). Unique on `(cartId, variantId)`. Phase 3 will add nullable `designId` and relax the unique rule for custom items.

**Forward compatibility**: prices are snapshotted into order lines in Phase 2, so editing a product never rewrites history. `isCustomizable` and `colorName` on images exist now so Phase 3 does not need a migration of existing rows.

## 4. Storefront

### Pages and behaviour

**Home `/`**
1. Hero: full-bleed image, oversized display headline that reveals word by word on load, a single CTA to the featured collection.
2. Marquee ticker: crawling line of offers and brand words, pauses on hover.
3. Featured collections: three large cards with image parallax and a hover reveal of the collection name.
4. New drops: a horizontally scrolling product strip pinned while the user scrolls vertically (GSAP ScrollTrigger), falls back to a normal horizontal scroll on touch devices.
5. Customize teaser: a split section with a mockup image and a "Design your own" CTA that links to `/customize`, which in Phase 1 is a teaser page explaining what is coming.
6. Brand story: two short paragraphs with a parallax image.
7. Footer: nav, policies, social links, newsletter input (stores nothing in Phase 1, shows a toast).

**Collection `/collections/[slug]`**
- Grid of product cards, 2 columns on phones, 3 on tablets, 4 on desktop.
- Filters in a left rail on desktop and a bottom sheet on mobile: size, color, fit, price range. Sort: featured, newest, price low to high, price high to low.
- Filter and sort state lives in the URL search params so links are shareable and the back button works.
- Server-rendered first page of 24 products, "Load more" button fetches the next page from `/api/v1/collections/{slug}/products`.
- Product card: image with a second image on hover, name, price, compare-at price with discount percentage, color dots, fit badge, "Low stock" badge when every variant is under 5 units.

**Product `/products/[slug]`**
- Gallery: vertical thumbnails on desktop, swipeable carousel on mobile, click to zoom in a dialog.
- Right column: name, price, compare-at and discount, color swatches (switch gallery), size chips with per-size stock hints under 5 units, size guide dialog, quantity stepper, Add to cart. Size is required; clicking Add without a size shakes the size row and shows an inline message.
- Sticky bottom bar on mobile with price and Add to cart.
- Accordions: description, fabric and care, shipping, returns (content from `content/pages`).
- "You may also like": four products from the same collection.

**Cart**
- Drawer opens from the right when an item is added or the bag icon is clicked. Shows line items with size, color, quantity stepper, remove, subtotal, and a free-shipping progress bar driven by `FREE_SHIPPING_THRESHOLD_PAISE` in brand config. The "Checkout" button is present but leads to a "Checkout arrives in Phase 2" page so the layout is final.
- `/cart` renders the same component full-page.
- Header bag icon shows the item count.

**Search**: header input, submit goes to `/search?q=`. Server-side `ILIKE` on product name and description across active products. Good enough for Phase 1.

**Auth pages**: register (name, email, password), login (email, password, Google button), forgot and reset password via emailed token. After login the user returns to the page they came from.

**Account `/account`**: shows name and email, edit name, change password, an "Orders" tab with an empty state that Phase 2 fills.

**Static pages `/pages/[slug]`** render markdown from `content/pages`.

### Design system

- **Colors** as CSS variables on `:root`: background `#0A0A0A`, surface `#141414`, surface-raised `#1C1C1C`, border `#2A2A2A`, text `#F5F5F0`, text-muted `#9A9A93`, accent `#D4FF3F` (acid lime), accent-ink `#0A0A0A`, danger `#FF4D4D`. Light mode is not part of Phase 1; the site is dark by design.
- **Type**: display font "Bebas Neue" for headlines and prices (uppercase, tight tracking), "Space Grotesk" for body and UI. Loaded with `next/font`.
- **Spacing and radius**: 4 px base scale, 2 px radius on inputs and cards, pill radius on buttons and chips.
- **Components** built on Radix primitives via shadcn/ui: Button, Input, Select, Sheet, Dialog, Tabs, Accordion, Toast, Badge, Skeleton.

### Motion

- Lenis smooth scroll wrapping the storefront layout.
- GSAP + ScrollTrigger for: hero text reveal, section reveals (translate and clip-path), pinned horizontal product strip, parallax on images.
- Framer Motion for: cart drawer spring, product card hover lift, size chip selection, toast enter and exit, magnetic effect on the primary CTA.
- Every effect checks `prefers-reduced-motion` and degrades to fades or none.
- Motion utilities live in `src/components/motion` so pages stay declarative: `<Reveal>`, `<Marquee>`, `<Parallax>`, `<PinnedStrip>`, `<MagneticButton>`.

## 5. Admin panel

Reachable at `/admin`. Middleware redirects non-admins to `/login?next=/admin`.

- **Dashboard**: counts of active products, draft products, variants under 5 units, registered customers.
- **Products list**: table with image, name, status, variant count, total stock, search by name, filter by status, sorted by updated date.
- **Product form** (create and edit): name, slug (auto from name, editable), description, fit, fabric, base price, compare-at price, status, customizable toggle, collections multi-select, image uploader (drag and drop, reorder, alt text, optional color tag), and a **variant matrix**: pick sizes and add colors with hex, the form generates one row per combination with sku (auto), price override, and stock. Existing variants are edited in place; removing a color or size deletes only variants that are not in any cart.
- **Collections**: list and form with name, slug, description, hero image, featured toggle, active toggle, and drag-to-order products.
- Forms use server actions with Zod validation and show field-level errors.
- Admin UI uses the same tokens but a denser layout and a fixed left nav.

The first admin is created by the seed script from `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars.

## 6. Public API `/api/v1`

JSON envelope: success `{ "data": ... }`, failure `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...} } }`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/collections` | none | active collections |
| GET | `/collections/{slug}/products` | none | paged products with `size`, `color`, `fit`, `minPrice`, `maxPrice`, `sort`, `page` |
| GET | `/products/{slug}` | none | product with images and variants |
| GET | `/search?q=` | none | search results |
| GET | `/cart` | cookie or bearer | current cart |
| POST | `/cart/items` | cookie or bearer | add `{variantId, quantity}` |
| PATCH | `/cart/items/{id}` | cookie or bearer | set quantity |
| DELETE | `/cart/items/{id}` | cookie or bearer | remove |
| POST | `/auth/register` | none | create account, returns JWT |
| POST | `/auth/login` | none | returns JWT |
| GET | `/me` | bearer | current user |

Rate limit: 60 requests per minute per IP on `/auth/*`, in-memory in Phase 1 with a note to move to Redis if a second instance is ever added.

## 7. Error handling

- Zod at every boundary (forms, server actions, API). Validation failures return 400 with per-field messages.
- Typed domain errors in `src/server/errors.ts`: `NotFoundError` (404), `OutOfStockError` (409), `ForbiddenError` (403), `UnauthorizedError` (401), `ConflictError` (409, for duplicate slug or sku). One mapper converts them to HTTP responses; unknown errors become 500 with a logged id and a generic message.
- Stock: `addToCart` rejects quantities above available stock and caps the merge on login. Phase 2 re-checks at checkout.
- Uploads: max 5 MB, `image/png`, `image/jpeg`, `image/webp`, validated by magic bytes server-side, not just extension.
- UI: route-level `error.tsx` boundaries per group, toast for recoverable errors, designed empty states for empty collection, empty cart, no search results.

## 8. Testing

- **Vitest** unit and service tests against a real Postgres test database (from docker compose) with truncation between tests: catalog filtering and sorting, cart add/update/merge with stock caps, auth register and login, admin product create with variant generation, slug and sku generation, money formatting, Zod schemas.
- **Playwright** end-to-end: home renders with products, collection filter and sort update the URL and grid, product page requires size then adds to cart and opens the drawer, cart persists across reload, register then login, admin creates a product that appears on the storefront.
- **CI**: GitHub Actions on push and pull request runs lint, typecheck, unit tests with a Postgres service, and Playwright against a built app.

## 9. Local development

- `docker compose up -d` starts Postgres.
- `.env.example` documents every variable: `DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STORAGE_DRIVER`, `EMAIL_DRIVER`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_SITE_URL`.
- `npm run db:migrate`, `npm run db:seed`, `npm run dev`.
- Google sign-in works locally once client credentials exist; without them the button hides itself.

## 10. Deployment (single EC2 instance)

- Multi-stage `Dockerfile` producing a Next.js standalone image.
- `docker-compose.prod.yml` with three services: `app`, `postgres` (named volume), and `caddy` (automatic HTTPS for the domain, reverse proxy to the app). Uploads volume mounted into `app` for `STORAGE_DRIVER=local`; switch to `s3` by env when ready.
- `deploy/ec2-setup.md` documents: Ubuntu 24.04 t3.small or larger, install Docker, clone repo, create `.env`, `docker compose -f docker-compose.prod.yml up -d --build`, run migrations and seed, point DNS at the elastic IP.
- `deploy/backup.sh` runs `pg_dump` nightly via cron and keeps 14 days locally, with an optional S3 copy.
- A GitHub Actions workflow deploys on push to `main` by SSH-ing to the instance and running pull, build, migrate, and restart. Enabled once the owner adds the SSH secret.

## 11. Phase plan after this spec

Phase 2: checkout, addresses, Razorpay, order emails, order history, admin orders, coupons and bundle offers.
Phase 3: custom designer (Fabric.js), custom cart items and pricing, admin print queue.
Phase 4: homepage banner admin, wishlist, reviews, SEO and analytics. Later candidates: 3D preview, COD, Shiprocket, phone OTP, S3 storage switch.
