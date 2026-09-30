# Phase 2: Commerce and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in customers check out with saved addresses and pay by Razorpay (or a `mock` provider in dev/e2e), turn payments into orders with price snapshots and reserved stock, email customers and the owner, and give the owner a fast admin for orders (quick status actions, tracking, notes, timeline, copy address, WhatsApp/call, 4×6 labels, packing slips, GST invoices, bulk print, CSV), coupons, bundle offers, customers, inventory, settings, a richer dashboard, and cron-driven automations (unpaid expiry, low-stock alerts, daily summary, abandoned-cart reminder).

**Architecture:** Pure, client-safe logic lives in `src/lib/*` (pricing engine, GST breakup, Code128 encoder, order-status rules, carriers, CSV, dates). Database logic lives in services under `src/server/services/*` plus the four cron jobs under `src/server/jobs/*`; nothing else imports `@/server/db`. Payments sit behind a provider interface in `src/server/payments/*` (`razorpay` over `fetch`, `mock` for dev/e2e), selected by `PAYMENT_PROVIDER`. The order service owns every state change (place with conditional stock decrement in one transaction, mark paid idempotently, expire, cancel/restock, refund) and records an `OrderEvent` for each; notifications are best-effort and never block a state change. Storefront pages are Server Components that call services; client components call Server Actions with plain objects; the JSON API under `/api/v1` mirrors checkout, addresses and orders for the future app. Admin pages follow the Phase 1C pattern (`requireAdminPage()` on pages, `requireAdmin()` in actions).

**Tech Stack:** Next.js 15 App Router, React 19 Server Actions and `useTransition`, Prisma 6 on PostgreSQL, Zod 3, shadcn/ui on Base UI (render prop, no `asChild`), Razorpay Orders API + Checkout.js (no SDK), nodemailer (SMTP driver only), Vitest against the real test database, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-phase2-commerce-ops-design.md` is binding in full. Conventions of `docs/superpowers/specs/2026-09-29-phase1-storefront-foundation-design.md` (money in integer paise, error mapping, API envelope, rate limiting, mobile-first) still apply.

## Global Constraints

- Node 22, npm 11, Git Bash on Windows; the repo is OneDrive-synced (slow installs and file ops; wait, retry once only on a real error). C: drive is low on space; on ENOSPC stop and report **BLOCKED** with the command that failed.
- Money is integer paise in the database, services, pricing and the API. Prices are **GST-inclusive** everywhere (cart, checkout, orders, invoices); tax is only ever *extracted* from the inclusive amount on the invoice. Admin inputs are typed in rupees and converted only at the UI boundary with `rupeesToPaise`/`paiseToRupees` from `@/lib/money`; display uses `formatPaise`.
- Only `src/server/services/*` and `src/server/jobs/*` import `@/server/db`. Pages, actions and route handlers call services. Client components import only types (`import type`) from `@/server/*`, and may import from `@/lib/*` (everything in `src/lib` stays client-safe: no `node:` imports, no db).
- Every admin page calls `requireAdminPage()` (`src/app/admin/guard.ts`); every admin Server Action and admin route handler calls `requireAdmin()` from `@/server/admin-guard` before doing anything else. Storefront actions resolve the user with `requireUserId()` (Task 3).
- After any admin mutation call `revalidatePath("/", "layout")` (storefront stock and the admin nav badge both depend on it).
- shadcn primitives are the Base UI variant: compose with `render={<Link href="…" />}` plus `nativeButton={false}`, never `asChild`. Available primitives: accordion, badge, button, dialog, input, label, select, separator, sheet, skeleton, sonner, tabs. Use native `<textarea>`, `<input type="checkbox">`, `<input type="radio">`, `<select>`, `<table>` styled with Tailwind tokens (`bg-surface`, `bg-surface-raised`, `border-border`, `text-text-muted`, `text-danger`, `bg-brand`, `text-brand-ink`) where no primitive exists.
- **Mobile-first:** every new page is designed at 360 px first and must be usable at 360 px wide with **no horizontal page scroll** (wide tables become stacked cards, or scroll inside their own `overflow-x-auto` container). Every tap target is **at least 44 × 44 px**: the default shadcn `Button` is only 32–36 px tall, so buttons added in this phase carry `className="h-11"` (or `min-h-11`), links used as buttons get `min-h-11 inline-flex items-center`, and checkbox/radio hit areas are wrapped in a `<label className="min-h-11 …">`. Inputs use `h-11`, the right `type`/`inputMode`/`autoComplete`, and visible `<label>`s.
- **Dependencies:** no new heavy dependencies. The only allowed additions are `nodemailer` and `@types/nodemailer` (Task 6). Razorpay is called with `fetch`; Checkout.js is loaded at runtime from `https://checkout.razorpay.com/v1/checkout.js`; barcode, CSV, charts and printable documents are hand-written.
- **Payments:** `PAYMENT_PROVIDER` defaults to `mock` when unset; `.env.example` and `.env.test` set `PAYMENT_PROVIDER="mock"`. The `mock` provider and the mock pay page are refused when `NODE_ENV=production`.
- Never run anything on port 3000 (the owner's preview server). Manual checks use `npx next dev -p 3001` with `NEXT_PUBLIC_SITE_URL=http://localhost:3001` set only in that shell; stop it afterwards and confirm nothing listens on 3001. E2E runs through `npm run test:e2e` (already on port 3001). Revert `tsconfig.json`/`next-env.d.ts` churn from `next dev`/`next build` before committing (they are already modified in the working tree by earlier work: never stage them).
- Leave the in-progress, uncommitted admin image/collection work alone: do not edit, stage or commit `src/app/admin/collections/**`, `src/app/admin/products/image-actions.ts`, `src/app/admin/products/[id]/page.tsx`, `src/components/admin/{collection-editor,collection-products,hero-uploader,image-manager}.tsx`, `next.config.ts`, `.next-task6-admin/`, `.tmp-qa-task6/`. Stage files explicitly by path (never `git add -A` / `git add .`).
- Every task ends with `npm run lint && npm run typecheck && npm test && npm run build` green. Task 1 also runs `npm run db:test:migrate` before `npm test`. Task 13 also runs `npm run test:e2e`.
- Commit messages end with exactly these two lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB`

---

## Existing interfaces this plan consumes

```ts
// @/server/db: db (PrismaClient)
// @/server/auth: auth() → session with user.id, user.role; signIn, signOut
// @/server/services/auth: getUserById(id): Promise<PublicUser | null>; PublicUser { id, email, name, image, role }
// @/server/admin-guard: requireAdmin(): Promise<{ userId: string }>
// src/app/admin/guard.ts: requireAdminPage(): Promise<{ userId: string }>     // redirects to /login?next=/admin
// @/server/errors: DomainError(code, message, status, details?), NotFoundError(what), OutOfStockError(available),
//   ForbiddenError(msg?), UnauthorizedError(msg?), ConflictError(msg), ValidationError(fieldErrors, msg?), RateLimitedError(sec), toHttp(err)
// @/server/action-result: ActionResult<T> = { ok: true; data: T } | { ok: false; message; fieldErrors? }, actionError(err), zodFieldErrors(zodError)
// @/server/api: handle(fn), ok(data, init?), parseJson(req, schema), requireApiUser(req), getApiUser(req), clientIp(req), RouteCtx
// @/server/api-token: signApiToken({ id, role }): Promise<string>
// @/server/rate-limit: rateLimit(key, limit, windowMs): { ok, retryAfterSec }
// @/server/cart-ref: resolveCartRef({ create }), getCurrentCart(): Promise<CartView>
// @/server/services/cart: CartRef, CartView { id, items: CartLine[], subtotalPaise, itemCount }, CartLine, EMPTY_CART, getCart(ref), addItem(ref, variantId, qty)
// @/server/services/catalog: Page<T> { items, total, page, pageSize, hasMore }
// @/server/services/admin-collections: listCollectionOptions(): Promise<{ id: string; name: string }[]>
// @/server/services/admin-dashboard: getDashboardStats(): Promise<DashboardStats>          (extended in Task 11)
// @/server/adapters/email: getEmail(): EmailAdapter { send(msg) }, EmailMessage { to, subject, html, text? }, ConsoleEmail (has .sent[])
// @/lib/escape-html: escapeHtml(s)
// @/lib/money: formatPaise(paise) → "₹599", rupeesToPaise(str), paiseToRupees(paise)
// @/lib/utils: cn(...)
// @/config/brand: BRAND { name, supportEmail, freeShippingThresholdPaise, ... }
// src/components/admin/{stat-tile,status-badge,field-error}.tsx; src/components/storefront/account/{sign-out-button,profile-form,password-form}.tsx
// src/components/storefront/{cart-panel,free-shipping-bar}.tsx (modified in Task 7)
// tests/helpers/db: resetDb(); tests/helpers/fixtures: createCollection(over), createProduct(over) → product with variants + images, linkProductToCollection(...)
// tests/e2e/helpers: register(page, email, name?), login(page, email, password?), addFirstProductToBag(page), uniqueEmail(prefix), PASSWORD
// middleware: /admin requires ADMIN, /account requires a session; /checkout, /orders, /invoice are guarded in the page itself
```

## File structure

| Path | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify), `prisma/migrations/<ts>_phase2_commerce/migration.sql` | Address, Order, OrderItem, OrderEvent, Coupon, Offer, StoreSetting, enums, `Cart.remindedAt`, `ProductVariant.lowStockAlertedAt`, `order_number_seq` |
| `src/lib/india-states.ts` | the 36 states/UTs, `isIndiaState` |
| `src/lib/order-status.ts` | status groups, labels, transitions, event types (client-safe) |
| `src/lib/validation/common.ts` | `optionalText`, `normalizeIndianPhone`, `phoneSchema` |
| `src/lib/validation/settings.ts`, `src/server/services/settings.ts` | StoreSetting schema and lazy singleton |
| `src/lib/pricing.ts` | pure pricing engine |
| `src/server/services/promotions.ts` | live offers, coupon lookup and usage, `quote()` |
| `src/lib/validation/address.ts`, `src/lib/address-format.ts`, `src/server/services/addresses.ts`, `src/server/session-user.ts` | addresses |
| `src/app/(storefront)/account/addresses/**`, `src/components/storefront/account/{address-form,address-book,account-nav}.tsx` | address UI |
| `src/app/api/v1/addresses/**` | address API |
| `src/server/payments/{types,hmac,razorpay,mock,index}.ts` | payment providers |
| `src/server/services/order-records.ts` | order views, `addOrderEvent`, reads shared by services |
| `src/server/services/orders.ts` | place, pay, expire, cancel, retry, customer reads |
| `src/server/adapters/email/smtp.ts`, `src/server/emails/templates.ts`, `src/server/services/notifications.ts` | email |
| `src/server/services/checkout.ts` | checkout view, cart preview, client verification, webhook |
| `src/app/(storefront)/checkout/**`, `src/app/(storefront)/orders/[number]/success/page.tsx`, `src/components/storefront/checkout/*`, `src/components/storefront/price-breakup.tsx` | checkout UI and pay flow |
| `src/app/api/payments/verify/route.ts`, `src/app/api/webhooks/razorpay/route.ts`, `src/app/api/v1/checkout/**` | payment routes |
| `src/lib/gst.ts`, `src/lib/dates.ts` | invoice tax breakup, IST dates |
| `src/app/(storefront)/account/orders/**`, `src/app/invoice/[number]/page.tsx`, `src/components/storefront/account/{order-card,order-stepper,order-status-pill}.tsx`, `src/components/print/{invoice-document,print-toolbar,page-size}.tsx` | customer orders and invoice |
| `src/app/api/v1/orders/**` | orders API |
| `src/lib/{carriers,contact-links,csv,order-tabs}.ts`, `src/lib/validation/orders.ts`, `src/server/services/admin-orders.ts` | admin order logic |
| `src/app/admin/orders/**`, `src/components/admin/orders/*`, `src/components/admin/copy-button.tsx`, `src/components/admin/admin-nav.tsx` (modify), `src/app/admin/layout.tsx` (modify) | admin orders UI and nav badge |
| `src/lib/barcode128.ts`, `src/components/print/{barcode,label-document,slip-document}.tsx`, `src/app/admin/orders/print/page.tsx` | print views |
| `src/lib/validation/promotions.ts`, `src/server/services/{admin-promotions,admin-customers,admin-inventory}.ts`, `src/server/services/admin-dashboard.ts` (modify) | admin ops services |
| `src/app/admin/{coupons,offers,customers,inventory,settings}/**`, `src/components/admin/{coupon-form,offer-form,inventory-table,settings-form,revenue-bars,delete-button}.tsx`, `src/app/admin/page.tsx` (modify) | admin ops UI |
| `src/server/jobs/*`, `src/app/api/cron/[job]/route.ts` | automations |
| `tests/unit/*` (new), `tests/helpers/{db,fixtures}.ts` (modify), `tests/e2e/{checkout,checkout-mobile}.spec.ts`, `tests/e2e/product-cart.spec.ts` (modify), `playwright.config.ts`, `README.md`, `.env.example`, `.env.test` | tests and docs |

---

### Task 1: Schema, migration, order-number sequence, India states, order-status rules, settings service

**Files:**
- Modify: `prisma/schema.prisma`, `tests/helpers/db.ts`, `tests/helpers/fixtures.ts`
- Create: `prisma/migrations/<timestamp>_phase2_commerce/migration.sql` (generated, then edited), `src/lib/india-states.ts`, `src/lib/order-status.ts`, `src/lib/validation/common.ts`, `src/lib/validation/settings.ts`, `src/server/services/settings.ts`
- Test: `tests/unit/india-states.test.ts`, `tests/unit/order-status.test.ts`, `tests/unit/settings.test.ts`, `tests/unit/order-schema.test.ts`

**Interfaces:**
- Consumes: `db`, `BRAND`, `ValidationError`, `zodFieldErrors`.
- Produces:

```ts
// @/lib/india-states
export const INDIA_STATES: readonly [string, ...string[]];   // 36 names, as const
export type IndiaState = (typeof INDIA_STATES)[number];
export function isIndiaState(s: string): s is IndiaState;
// @/lib/order-status
export const PAID_STATUSES: readonly OrderStatus[];            // PAID, PROCESSING, SHIPPED, DELIVERED
export const STOCK_HOLDING_STATUSES: readonly OrderStatus[];   // PENDING_PAYMENT, PAID, PROCESSING
export const ORDER_STATUS_LABEL: Record<OrderStatus, string>;
export const ORDER_EVENT_TYPES: readonly [...]; export type OrderEventType;
export type FulfilmentStatus = "PROCESSING" | "SHIPPED" | "DELIVERED";
export function isPaidStatus(s: OrderStatus): boolean;
export function canCancel(s: OrderStatus): boolean;
export function nextFulfilmentStatus(s: OrderStatus): FulfilmentStatus | null;
export function fulfilmentRank(s: OrderStatus): number;        // PAID 0 … DELIVERED 3, others -1
// @/lib/validation/common
export function optionalText(max: number): ZodType<string | null>;   // "" / undefined / whitespace → null
export function normalizeIndianPhone(raw: string): string;           // strips non-digits, +91/91 and leading 0
export const phoneSchema: ZodType<string>;                           // 10 digits starting 6–9 after normalising
// @/lib/validation/settings
export const settingsInputSchema; export type SettingsInput = z.input<typeof settingsInputSchema>;
// @/server/services/settings
export type StoreSettings = StoreSetting;                             // Prisma row
export function getSettings(): Promise<StoreSettings>;               // lazily creates id = 1 with defaults
export function updateSettings(input: unknown): Promise<StoreSettings>;  // ValidationError on bad input
// tests/helpers/fixtures (added)
export function createUser(over?: Partial<{ email: string; name: string; role: "CUSTOMER" | "ADMIN" }>): Promise<User>;
```

- [ ] **Step 1: Schema**

In `prisma/schema.prisma` add the enums and models below, and these relation fields to existing models:
- `User`: `addresses Address[]` and `orders Order[]`
- `Collection`: `offers Offer[]`
- `Product`: `orderItems OrderItem[]`
- `ProductVariant`: `orderItems OrderItem[]` and `lowStockAlertedAt DateTime?`
- `Cart`: `remindedAt DateTime?`

```prisma
enum OrderStatus {
  PENDING_PAYMENT
  PAID
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
  EXPIRED
  REFUNDED
}

enum CouponType {
  PERCENT
  FLAT
}

enum OfferType {
  BUNDLE_PRICE
  QTY_PERCENT
}

model Address {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fullName  String
  phone     String
  line1     String
  line2     String?
  landmark  String?
  city      String
  state     String
  pincode   String
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}

model Order {
  id                String       @id @default(cuid())
  number            String       @unique
  userId            String
  user              User         @relation(fields: [userId], references: [id], onDelete: Restrict)
  email             String
  status            OrderStatus  @default(PENDING_PAYMENT)
  needsAttention    Boolean      @default(false)
  shipName          String
  shipPhone         String
  shipLine1         String
  shipLine2         String?
  shipLandmark      String?
  shipCity          String
  shipState         String
  shipPincode       String
  subtotalPaise     Int
  discountPaise     Int          @default(0)
  shippingPaise     Int          @default(0)
  totalPaise        Int
  couponCode        String?
  offerLabel        String?
  paymentProvider   String
  providerOrderId   String?      @unique
  providerPaymentId String?
  paidAt            DateTime?
  processingAt      DateTime?
  shippedAt         DateTime?
  deliveredAt       DateTime?
  cancelledAt       DateTime?
  refundedAt        DateTime?
  carrier           String?
  trackingNumber    String?
  trackingUrl       String?
  adminNote         String?
  customerNote      String?
  expiresAt         DateTime
  items             OrderItem[]
  events            OrderEvent[]
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  @@index([status, createdAt])
  @@index([userId, createdAt])
  @@index([couponCode])
  @@index([paidAt])
}

model OrderItem {
  id             String          @id @default(cuid())
  orderId        String
  order          Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId      String?
  product        Product?        @relation(fields: [productId], references: [id], onDelete: SetNull)
  variantId      String?
  variant        ProductVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)
  productName    String
  productSlug    String
  size           String
  colorName      String
  imageUrl       String?
  sku            String
  unitPricePaise Int
  quantity       Int
  lineTotalPaise Int

  @@index([orderId])
  @@index([productId])
}

model OrderEvent {
  id        String   @id @default(cuid())
  orderId   String
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  type      String
  message   String
  actorId   String?
  createdAt DateTime @default(now())

  @@index([orderId, createdAt])
}

model Coupon {
  id               String     @id @default(cuid())
  code             String     @unique
  type             CouponType
  value            Int
  minSubtotalPaise Int        @default(0)
  maxDiscountPaise Int?
  startsAt         DateTime?
  endsAt           DateTime?
  usageLimit       Int?
  perUserLimit     Int?
  active           Boolean    @default(true)
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
}

model Offer {
  id           String      @id @default(cuid())
  label        String
  type         OfferType
  minQty       Int
  pricePaise   Int?
  percent      Int?
  collectionId String?
  collection   Collection? @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  active       Boolean     @default(true)
  startsAt     DateTime?
  endsAt       DateTime?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
}

model StoreSetting {
  id                         Int      @id @default(1)
  shippingFeePaise           Int      @default(7900)
  freeShippingThresholdPaise Int      @default(99900)
  lowStockThreshold          Int      @default(5)
  adminNotifyEmail           String?
  sellerName                 String   @default("")
  sellerAddress              String   @default("")
  sellerState                String   @default("")
  gstin                      String?
  gstRateLowPct              Int      @default(5)
  gstRateHighPct             Int      @default(18)
  gstThresholdPaise          Int      @default(250000)
  whatsappNumber             String?
  dailySummaryEnabled        Boolean  @default(true)
  abandonedCartEnabled       Boolean  @default(true)
  lastDailySummaryOn         String?
  updatedAt                  DateTime @updatedAt
}
```

Notes: `Offer.collection` cascades so deleting a collection can never widen an offer to "all products". `Order.user` is `Restrict` (orders are records; users with orders are not deleted). `lastDailySummaryOn` (IST `YYYY-MM-DD`) makes the daily-summary job idempotent (Task 12). `refundedAt` records when a refund was made.

- [ ] **Step 2: Migration with the order-number sequence**

```bash
npx prisma migrate dev --name phase2_commerce --create-only
```

Append to the generated `prisma/migrations/<timestamp>_phase2_commerce/migration.sql`:

```sql
-- Order numbers: ORD-1001, ORD-1002, … (read with nextval in the order service)
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START WITH 1001 INCREMENT BY 1;
```

Then apply to the dev and test databases and regenerate the client:

```bash
npx prisma migrate dev
npm run db:test:migrate
```

(`prisma migrate dev` does not model standalone sequences, so it reports no drift for it.)

Update `tests/helpers/db.ts`: add the new tables at the front of `TABLES` (`"OrderEvent", "OrderItem", "Order", "Address", "Coupon", "Offer", "StoreSetting"`) and, after the `TRUNCATE`, restart the sequence so every test sees `ORD-1001` first:

```ts
  await db.$executeRawUnsafe(`ALTER SEQUENCE "order_number_seq" RESTART WITH 1001`);
```

Append to `tests/helpers/fixtures.ts`:

```ts
export async function createUser(over: Partial<{ email: string; name: string; role: "CUSTOMER" | "ADMIN" }> = {}) {
  const n = next();
  return db.user.create({ data: { email: over.email ?? `user${n}-${Date.now()}@example.test`, name: over.name ?? `User ${n}`, role: over.role ?? "CUSTOMER" } });
}
```

- [ ] **Step 3: Failing tests**

Create `tests/unit/india-states.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { INDIA_STATES, isIndiaState } from "@/lib/india-states";

describe("INDIA_STATES", () => {
  it("lists 28 states and 8 union territories without duplicates", () => {
    expect(INDIA_STATES).toHaveLength(36);
    expect(new Set(INDIA_STATES).size).toBe(36);
    expect(INDIA_STATES).toContain("Tamil Nadu");
    expect(INDIA_STATES).toContain("Delhi");
    expect(INDIA_STATES).toContain("Dadra and Nagar Haveli and Daman and Diu");
  });

  it("checks membership exactly", () => {
    expect(isIndiaState("Karnataka")).toBe(true);
    expect(isIndiaState("karnataka")).toBe(false);
    expect(isIndiaState("Bombay")).toBe(false);
  });
});
```

Create `tests/unit/order-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canCancel, fulfilmentRank, isPaidStatus, nextFulfilmentStatus, ORDER_STATUS_LABEL } from "@/lib/order-status";

describe("order status rules", () => {
  it("knows which statuses count as paid", () => {
    expect(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].every((s) => isPaidStatus(s as never))).toBe(true);
    expect(["PENDING_PAYMENT", "CANCELLED", "EXPIRED", "REFUNDED"].some((s) => isPaidStatus(s as never))).toBe(false);
  });

  it("allows cancelling only before shipping", () => {
    expect(canCancel("PENDING_PAYMENT")).toBe(true);
    expect(canCancel("PAID")).toBe(true);
    expect(canCancel("PROCESSING")).toBe(true);
    expect(canCancel("SHIPPED")).toBe(false);
    expect(canCancel("DELIVERED")).toBe(false);
    expect(canCancel("EXPIRED")).toBe(false);
  });

  it("walks the fulfilment chain", () => {
    expect(nextFulfilmentStatus("PAID")).toBe("PROCESSING");
    expect(nextFulfilmentStatus("PROCESSING")).toBe("SHIPPED");
    expect(nextFulfilmentStatus("SHIPPED")).toBe("DELIVERED");
    expect(nextFulfilmentStatus("DELIVERED")).toBeNull();
    expect(nextFulfilmentStatus("PENDING_PAYMENT")).toBeNull();
    expect(fulfilmentRank("SHIPPED")).toBe(2);
    expect(fulfilmentRank("CANCELLED")).toBe(-1);
  });

  it("labels every status", () => {
    expect(ORDER_STATUS_LABEL.PENDING_PAYMENT).toBe("Awaiting payment");
    expect(Object.keys(ORDER_STATUS_LABEL)).toHaveLength(8);
  });
});
```

Create `tests/unit/settings.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { BRAND } from "@/config/brand";
import { resetDb } from "../helpers/db";
import { getSettings, updateSettings } from "@/server/services/settings";
import { ValidationError } from "@/server/errors";

const valid = {
  shippingFeePaise: 4900,
  freeShippingThresholdPaise: 149900,
  lowStockThreshold: 3,
  adminNotifyEmail: " Owner@Example.com ",
  sellerName: "Test Store",
  sellerAddress: "1 Anna Salai, Chennai 600002",
  sellerState: "Tamil Nadu",
  gstin: "33abcde1234f1z5",
  gstRateLowPct: 5,
  gstRateHighPct: 18,
  gstThresholdPaise: 250000,
  whatsappNumber: "+91 98765 43210",
  dailySummaryEnabled: false,
  abandonedCartEnabled: true,
};

describe("settings service", () => {
  beforeEach(resetDb);

  it("creates the singleton lazily with defaults, once", async () => {
    const s = await getSettings();
    expect(s).toMatchObject({
      id: 1, shippingFeePaise: 7900, freeShippingThresholdPaise: BRAND.freeShippingThresholdPaise, lowStockThreshold: 5,
      gstRateLowPct: 5, gstRateHighPct: 18, gstThresholdPaise: 250000, sellerName: BRAND.name,
      dailySummaryEnabled: true, abandonedCartEnabled: true, adminNotifyEmail: null,
    });
    await Promise.all([getSettings(), getSettings(), getSettings()]);
    expect(await db.storeSetting.count()).toBe(1);
  });

  it("saves normalised values", async () => {
    const s = await updateSettings(valid);
    expect(s).toMatchObject({ adminNotifyEmail: "owner@example.com", gstin: "33ABCDE1234F1Z5", whatsappNumber: "9876543210", shippingFeePaise: 4900, dailySummaryEnabled: false });
    expect((await getSettings()).sellerState).toBe("Tamil Nadu");
  });

  it("turns blank optional fields into null", async () => {
    const s = await updateSettings({ ...valid, adminNotifyEmail: "", gstin: "  ", whatsappNumber: "" });
    expect(s).toMatchObject({ adminNotifyEmail: null, gstin: null, whatsappNumber: null });
  });

  it("rejects invalid values with field errors", async () => {
    await expect(updateSettings({ ...valid, sellerState: "Bombay" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ ...valid, gstin: "123" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ ...valid, shippingFeePaise: -1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ ...valid, gstRateHighPct: 40 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings({ ...valid, whatsappNumber: "12345" })).rejects.toBeInstanceOf(ValidationError);
  });
});
```

Create `tests/unit/order-schema.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";

const nextval = async () => Number((await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`)[0].n);

describe("order number sequence", () => {
  beforeEach(resetDb);

  it("starts at 1001, increments, and restarts with resetDb", async () => {
    expect(await nextval()).toBe(1001);
    expect(await nextval()).toBe(1002);
    await resetDb();
    expect(await nextval()).toBe(1001);
  });
});
```

Run: `npm test -- tests/unit/india-states.test.ts tests/unit/order-status.test.ts tests/unit/settings.test.ts tests/unit/order-schema.test.ts`
Expected: FAIL (modules missing; the sequence test passes once Step 2 is applied).

- [ ] **Step 4: Implement**

Create `src/lib/india-states.ts`:

```ts
export const INDIA_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
] as const;

export type IndiaState = (typeof INDIA_STATES)[number];

const SET = new Set<string>(INDIA_STATES);
export function isIndiaState(s: string): s is IndiaState {
  return SET.has(s);
}
```

Create `src/lib/order-status.ts`:

```ts
import type { OrderStatus } from "@prisma/client";

export const PAID_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const satisfies readonly OrderStatus[];
export const STOCK_HOLDING_STATUSES = ["PENDING_PAYMENT", "PAID", "PROCESSING"] as const satisfies readonly OrderStatus[];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  REFUNDED: "Refunded",
};

export const ORDER_EVENT_TYPES = [
  "CREATED", "PAID", "PAYMENT_FAILED", "STATUS_CHANGED", "NOTE", "EMAIL_SENT", "EMAIL_FAILED",
  "EXPIRED", "TRACKING_UPDATED", "REFUNDED", "ATTENTION",
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export type FulfilmentStatus = "PROCESSING" | "SHIPPED" | "DELIVERED";
const CHAIN: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

export function isPaidStatus(s: OrderStatus): boolean {
  return (PAID_STATUSES as readonly OrderStatus[]).includes(s);
}

export function canCancel(s: OrderStatus): boolean {
  return (STOCK_HOLDING_STATUSES as readonly OrderStatus[]).includes(s);
}

export function fulfilmentRank(s: OrderStatus): number {
  return CHAIN.indexOf(s);
}

export function nextFulfilmentStatus(s: OrderStatus): FulfilmentStatus | null {
  const i = CHAIN.indexOf(s);
  return i >= 0 && i < CHAIN.length - 1 ? (CHAIN[i + 1] as FulfilmentStatus) : null;
}
```

Create `src/lib/validation/common.ts`:

```ts
import { z } from "zod";

/** Optional free text: blank, whitespace-only, null or undefined all become null. */
export function optionalText(max: number) {
  return z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v),
    z.string().trim().max(max, `Keep this under ${max} characters`).nullable(),
  );
}

export function normalizeIndianPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

export const phoneSchema = z
  .string()
  .transform(normalizeIndianPhone)
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"));
```

Create `src/lib/validation/settings.ts`:

```ts
import { z } from "zod";
import { INDIA_STATES } from "@/lib/india-states";
import { phoneSchema } from "@/lib/validation/common";

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const blankToNull = (v: unknown) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v);
const pct = z.number().int().min(0).max(28);

export const settingsInputSchema = z.object({
  shippingFeePaise: z.number().int().min(0).max(100_000),
  freeShippingThresholdPaise: z.number().int().min(0).max(10_000_000),
  lowStockThreshold: z.number().int().min(0).max(1000),
  adminNotifyEmail: z.preprocess(blankToNull, z.string().trim().toLowerCase().email("Enter a valid email").max(200).nullable()),
  sellerName: z.string().trim().min(2, "Enter the business name").max(120),
  sellerAddress: z.string().trim().max(500),
  sellerState: z.union([z.enum(INDIA_STATES), z.literal("")]),
  gstin: z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(GSTIN, "Enter a valid 15-character GSTIN").nullable()),
  gstRateLowPct: pct,
  gstRateHighPct: pct,
  gstThresholdPaise: z.number().int().min(0).max(10_000_000),
  whatsappNumber: z.preprocess(blankToNull, phoneSchema.nullable()),
  dailySummaryEnabled: z.boolean(),
  abandonedCartEnabled: z.boolean(),
});

export type SettingsInput = z.input<typeof settingsInputSchema>;
```

Create `src/server/services/settings.ts`:

```ts
import { Prisma, type StoreSetting } from "@prisma/client";
import { BRAND } from "@/config/brand";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ValidationError } from "@/server/errors";
import { settingsInputSchema } from "@/lib/validation/settings";

export type StoreSettings = StoreSetting;

const DEFAULTS = { id: 1, sellerName: BRAND.name, freeShippingThresholdPaise: BRAND.freeShippingThresholdPaise };

export async function getSettings(): Promise<StoreSettings> {
  try {
    return await db.storeSetting.upsert({ where: { id: 1 }, update: {}, create: DEFAULTS });
  } catch (err) {
    // Two first requests racing the lazy create: the loser reads the winner's row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return db.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
    }
    throw err;
  }
}

export async function updateSettings(input: unknown): Promise<StoreSettings> {
  const parsed = settingsInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodFieldErrors(parsed.error));
  await getSettings();
  return db.storeSetting.update({ where: { id: 1 }, data: parsed.data });
}
```

- [ ] **Step 5: Verify and commit**

Run the four test files (GREEN), then `npm run lint && npm run typecheck && npm test && npm run build`.

```bash
git add prisma/schema.prisma prisma/migrations src/lib/india-states.ts src/lib/order-status.ts src/lib/validation/common.ts src/lib/validation/settings.ts src/server/services/settings.ts tests/helpers/db.ts tests/helpers/fixtures.ts tests/unit/india-states.test.ts tests/unit/order-status.test.ts tests/unit/settings.test.ts tests/unit/order-schema.test.ts
git commit -m "feat(commerce): add order, address, promotion and settings schema with order-number sequence

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 2: Pricing engine (pure) and promotions read service

**Files:**
- Create: `src/lib/pricing.ts`, `src/server/services/promotions.ts`
- Modify: `tests/helpers/fixtures.ts` (add `createOrderRow`)
- Test: `tests/unit/pricing.test.ts`, `tests/unit/promotions.test.ts`

**Interfaces:**
- Consumes: `formatPaise` (existing), `PAID_STATUSES` (Task 1), `getSettings` (Task 1), `db`.
- Produces:

```ts
// @/lib/pricing  (pure, client-safe)
export type OfferKind = "BUNDLE_PRICE" | "QTY_PERCENT";
export type CouponKind = "PERCENT" | "FLAT";
export interface PricingLine { unitPricePaise: number; quantity: number; collectionIds: string[] }
export interface PricingOffer { id: string; label: string; type: OfferKind; minQty: number; pricePaise: number | null; percent: number | null; collectionId: string | null; active: boolean; startsAt: Date | null; endsAt: Date | null }
export interface PricingCoupon { code: string; type: CouponKind; value: number; minSubtotalPaise: number; maxDiscountPaise: number | null; startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; perUserLimit: number | null; active: boolean }
export interface PricingSettings { shippingFeePaise: number; freeShippingThresholdPaise: number }
export interface PricingContext { offers: PricingOffer[]; coupon: PricingCoupon | null; settings: PricingSettings; now: Date; couponUsesTotal?: number; couponUsesByUser?: number }
export interface PriceResult {
  subtotalPaise: number;
  offer: { label: string; discountPaise: number } | null;     // best eligible automatic offer (even if not applied)
  coupon: { code: string; discountPaise: number } | null;     // valid coupon evaluation (even if not applied)
  couponError?: string;
  applied: "offer" | "coupon" | null;
  discountPaise: number; shippingPaise: number; totalPaise: number;
}
export function offerDiscount(offer: PricingOffer, lines: PricingLine[]): number;
export function couponDiscount(coupon: PricingCoupon, subtotalPaise: number): number;
export function couponProblem(coupon: PricingCoupon, subtotalPaise: number, ctx: Pick<PricingContext, "now" | "couponUsesTotal" | "couponUsesByUser">): string | null;
export function priceCart(lines: PricingLine[], ctx: PricingContext): PriceResult;
export function discountLabel(r: PriceResult): string | null;   // "Offer: Any 3 for ₹999" | "Code SAVE10" | null
// @/server/services/promotions
export const UNKNOWN_COUPON: "This code is not valid";
export function normalizeCouponCode(code: string): string;       // trim + uppercase
export function getLiveOffers(now?: Date): Promise<PricingOffer[]>;
export function findCoupon(code: string): Promise<PricingCoupon | null>;
export function couponUses(code: string, userId: string | null): Promise<{ total: number; byUser: number }>;
export function quote(args: { lines: PricingLine[]; couponCode?: string | null; userId: string | null; now?: Date }): Promise<PriceResult>;
// tests/helpers/fixtures (added)
export function createOrderRow(userId: string, over?: Partial<{...}>): Promise<Order>;   // minimal PAID order row
```

Rules (spec §2, §4): the best automatic offer and a valid coupon are both evaluated; the customer gets the larger discount, never both; **a tie goes to the offer** (the coupon stays unused, so it does not consume a usage). Percent discounts round down to whole paise. `BUNDLE_PRICE` sorts eligible units cheapest-first and prices each complete group of `minQty` at `min(pricePaise, group's normal price)`; groups repeat; leftover units pay full price. Coupon date window is inclusive at both ends. Shipping is free when the **discounted** subtotal is `>=` the threshold, and zero for an empty cart. Total never goes below zero.

- [ ] **Step 1: Failing tests**

Create `tests/unit/pricing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { discountLabel, priceCart, type PricingContext, type PricingCoupon, type PricingOffer } from "@/lib/pricing";

const settings = { shippingFeePaise: 7900, freeShippingThresholdPaise: 99900 };
const now = new Date("2026-10-01T10:00:00Z");
const line = (unitPricePaise: number, quantity = 1, collectionIds: string[] = []) => ({ unitPricePaise, quantity, collectionIds });
const ctx = (over: Partial<PricingContext> = {}): PricingContext => ({ offers: [], coupon: null, settings, now, couponUsesTotal: 0, couponUsesByUser: 0, ...over });
const coupon = (over: Partial<PricingCoupon> = {}): PricingCoupon => ({
  code: "SAVE", type: "FLAT", value: 10000, minSubtotalPaise: 0, maxDiscountPaise: null,
  startsAt: null, endsAt: null, usageLimit: null, perUserLimit: null, active: true, ...over,
});
const offer = (over: Partial<PricingOffer> = {}): PricingOffer => ({
  id: "o1", label: "Any 3 for ₹999", type: "BUNDLE_PRICE", minQty: 3, pricePaise: 99900, percent: null,
  collectionId: null, active: true, startsAt: null, endsAt: null, ...over,
});

describe("priceCart basics and shipping", () => {
  it("prices an empty cart at zero with no shipping", () => {
    expect(priceCart([], ctx())).toEqual({ subtotalPaise: 0, offer: null, coupon: null, applied: null, discountPaise: 0, shippingPaise: 0, totalPaise: 0 });
  });

  it("adds flat shipping below the threshold", () => {
    expect(priceCart([line(59900)], ctx())).toMatchObject({ subtotalPaise: 59900, shippingPaise: 7900, totalPaise: 67800 });
  });

  it("makes shipping free exactly at the threshold", () => {
    expect(priceCart([line(99900)], ctx())).toMatchObject({ shippingPaise: 0, totalPaise: 99900 });
    expect(priceCart([line(99899)], ctx())).toMatchObject({ shippingPaise: 7900, totalPaise: 107799 });
  });

  it("checks the threshold against the discounted subtotal", () => {
    const r = priceCart([line(54900, 2)], ctx({ coupon: coupon({ value: 20000 }) }));
    expect(r).toMatchObject({ subtotalPaise: 109800, applied: "coupon", discountPaise: 20000, shippingPaise: 7900, totalPaise: 97700 });
  });
});

describe("coupons", () => {
  it("rounds percent discounts down to whole paise", () => {
    const r = priceCart([line(33333, 3)], ctx({ coupon: coupon({ type: "PERCENT", value: 10 }) }));
    expect(r).toMatchObject({ subtotalPaise: 99999, discountPaise: 9999, shippingPaise: 7900, totalPaise: 97900 });
  });

  it("caps percent discounts at maxDiscountPaise", () => {
    const r = priceCart([line(100000, 2)], ctx({ coupon: coupon({ type: "PERCENT", value: 50, maxDiscountPaise: 15000 }) }));
    expect(r).toMatchObject({ discountPaise: 15000, shippingPaise: 0, totalPaise: 185000 });
  });

  it("never discounts more than the subtotal and never goes negative", () => {
    const r = priceCart([line(59900)], ctx({ coupon: coupon({ value: 100000 }) }));
    expect(r).toMatchObject({ discountPaise: 59900, shippingPaise: 7900, totalPaise: 7900 });
  });

  it("explains a minimum subtotal shortfall", () => {
    const r = priceCart([line(59900)], ctx({ coupon: coupon({ minSubtotalPaise: 100000 }) }));
    expect(r.couponError).toBe("Add ₹401 more to use this code");
    expect(r).toMatchObject({ coupon: null, applied: null, discountPaise: 0 });
  });

  it("respects the date window inclusively", () => {
    const early = priceCart([line(59900)], ctx({ coupon: coupon({ startsAt: new Date("2026-10-02T00:00:00Z") }) }));
    expect(early.couponError).toBe("This code is not active yet");
    const late = priceCart([line(59900)], ctx({ coupon: coupon({ endsAt: new Date("2026-09-30T00:00:00Z") }) }));
    expect(late.couponError).toBe("This code has expired");
    const edge = priceCart([line(59900)], ctx({ coupon: coupon({ startsAt: now, endsAt: now }) }));
    expect(edge.couponError).toBeUndefined();
    expect(edge.applied).toBe("coupon");
  });

  it("rejects inactive codes and exhausted usage", () => {
    expect(priceCart([line(59900)], ctx({ coupon: coupon({ active: false }) })).couponError).toBe("This code is not active");
    expect(priceCart([line(59900)], ctx({ coupon: coupon({ usageLimit: 5 }), couponUsesTotal: 5 })).couponError).toBe("This code has reached its usage limit");
    expect(priceCart([line(59900)], ctx({ coupon: coupon({ usageLimit: 5 }), couponUsesTotal: 4 })).couponError).toBeUndefined();
    expect(priceCart([line(59900)], ctx({ coupon: coupon({ perUserLimit: 1 }), couponUsesByUser: 1 })).couponError).toBe("You have already used this code");
  });
});

describe("offers", () => {
  it("groups the cheapest eligible units first", () => {
    const r = priceCart([line(59900, 2), line(49900, 2)], ctx({ offers: [offer()] }));
    // cheapest three: 49900 + 49900 + 59900 = 159700 → 99900, saving 59800; the 4th unit pays full price
    expect(r).toMatchObject({ subtotalPaise: 219600, offer: { label: "Any 3 for ₹999", discountPaise: 59800 }, applied: "offer", discountPaise: 59800, shippingPaise: 0, totalPaise: 159800 });
  });

  it("repeats bundle groups", () => {
    const r = priceCart([line(59900, 6)], ctx({ offers: [offer()] }));
    expect(r).toMatchObject({ discountPaise: 159600, totalPaise: 199800 });
  });

  it("never makes a group cost more than its normal price", () => {
    const r = priceCart([line(29900, 3)], ctx({ offers: [offer()] }));
    expect(r).toMatchObject({ offer: null, applied: null, discountPaise: 0, totalPaise: 97600 });
  });

  it("only counts units from the offer's collection", () => {
    const lines = [line(59900, 2, ["c1"]), line(59900, 1, ["c2"])];
    expect(priceCart(lines, ctx({ offers: [offer({ collectionId: "c1", minQty: 2 })] })).discountPaise).toBe(19900);
    expect(priceCart(lines, ctx({ offers: [offer({ collectionId: "c1", minQty: 3 })] })).offer).toBeNull();
  });

  it("applies quantity percent offers at the minimum quantity", () => {
    const pct = offer({ type: "QTY_PERCENT", percent: 10, pricePaise: null, label: "10% off 3+" });
    expect(priceCart([line(33333, 3)], ctx({ offers: [pct] })).discountPaise).toBe(9999);
    expect(priceCart([line(33333, 2)], ctx({ offers: [pct] })).offer).toBeNull();
  });

  it("picks the best live offer and ignores inactive or out-of-window ones", () => {
    const offers = [
      offer({ id: "a", label: "A", type: "QTY_PERCENT", percent: 10, pricePaise: null, minQty: 2 }),
      offer({ id: "b", label: "B", minQty: 2, pricePaise: 99900 }),
      offer({ id: "c", label: "C", minQty: 2, pricePaise: 1000, active: false }),
      offer({ id: "d", label: "D", minQty: 2, pricePaise: 1000, endsAt: new Date("2026-09-01T00:00:00Z") }),
      offer({ id: "e", label: "E", minQty: 2, pricePaise: 1000, startsAt: new Date("2026-11-01T00:00:00Z") }),
    ];
    expect(priceCart([line(59900, 2)], ctx({ offers })).offer).toEqual({ label: "B", discountPaise: 19900 });
  });
});

describe("offer versus coupon", () => {
  const lines = [line(59900, 2), line(49900, 2)];

  it("applies the offer when it saves more, but still reports the coupon", () => {
    const r = priceCart(lines, ctx({ offers: [offer()], coupon: coupon() }));
    expect(r).toMatchObject({ applied: "offer", discountPaise: 59800, coupon: { code: "SAVE", discountPaise: 10000 } });
    expect(discountLabel(r)).toBe("Offer: Any 3 for ₹999");
  });

  it("applies the coupon when it saves more", () => {
    const r = priceCart(lines, ctx({ offers: [offer()], coupon: coupon({ type: "PERCENT", value: 50 }) }));
    expect(r).toMatchObject({ applied: "coupon", discountPaise: 109800, shippingPaise: 0, totalPaise: 109800 });
    expect(discountLabel(r)).toBe("Code SAVE");
  });

  it("gives a tie to the offer", () => {
    const r = priceCart([line(59900, 2)], ctx({ offers: [offer({ minQty: 2 })], coupon: coupon({ value: 19900 }) }));
    expect(r.applied).toBe("offer");
    expect(discountLabel(priceCart([line(59900)], ctx()))).toBeNull();
  });
});
```

Add to `tests/helpers/fixtures.ts` (and `import type { OrderStatus } from "@prisma/client"` next to the existing type import):

```ts
export async function createOrderRow(
  userId: string,
  over: Partial<{ status: OrderStatus; couponCode: string | null; offerLabel: string | null; totalPaise: number; paidAt: Date | null; createdAt: Date; number: string; shipName: string; shipPhone: string; shipPincode: string; needsAttention: boolean }> = {},
) {
  const n = next();
  const total = over.totalPaise ?? 59900;
  return db.order.create({
    data: {
      number: over.number ?? `TEST-${n}-${Date.now()}`,
      userId,
      email: `buyer${n}@example.test`,
      status: over.status ?? "PAID",
      needsAttention: over.needsAttention ?? false,
      shipName: over.shipName ?? "Asha Rao",
      shipPhone: over.shipPhone ?? "9876543210",
      shipLine1: "12 MG Road",
      shipCity: "Bengaluru",
      shipState: "Karnataka",
      shipPincode: over.shipPincode ?? "560001",
      subtotalPaise: total,
      totalPaise: total,
      couponCode: over.couponCode ?? null,
      offerLabel: over.offerLabel ?? null,
      paymentProvider: "mock",
      paidAt: over.paidAt === undefined ? new Date() : over.paidAt,
      createdAt: over.createdAt,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
}
```

Create `tests/unit/promotions.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderRow, createUser } from "../helpers/fixtures";
import { couponUses, getLiveOffers, normalizeCouponCode, quote, UNKNOWN_COUPON } from "@/server/services/promotions";

const lines = [{ unitPricePaise: 59900, quantity: 2, collectionIds: ["c1"] }];

describe("promotions service", () => {
  beforeEach(resetDb);

  it("normalises codes", () => {
    expect(normalizeCouponCode("  save10 ")).toBe("SAVE10");
  });

  it("reports unknown codes and applies known ones case-insensitively", async () => {
    const unknown = await quote({ lines, couponCode: "nope", userId: null });
    expect(unknown).toMatchObject({ couponError: UNKNOWN_COUPON, applied: null });
    await db.coupon.create({ data: { code: "SAVE10", type: "PERCENT", value: 10 } });
    const r = await quote({ lines, couponCode: "save10", userId: null });
    expect(r).toMatchObject({ applied: "coupon", discountPaise: 11980, coupon: { code: "SAVE10" } });
  });

  it("counts only paid-like orders toward usage", async () => {
    const u = await createUser();
    const other = await createUser();
    await createOrderRow(u.id, { couponCode: "ONCE", status: "PAID" });
    await createOrderRow(u.id, { couponCode: "ONCE", status: "PENDING_PAYMENT", paidAt: null });
    await createOrderRow(other.id, { couponCode: "ONCE", status: "DELIVERED" });
    await createOrderRow(other.id, { couponCode: "ONCE", status: "CANCELLED" });
    expect(await couponUses("once", u.id)).toEqual({ total: 2, byUser: 1 });
    await db.coupon.create({ data: { code: "ONCE", type: "FLAT", value: 5000, perUserLimit: 1 } });
    expect((await quote({ lines, couponCode: "ONCE", userId: u.id })).couponError).toBe("You have already used this code");
    const fresh = await createUser();
    expect((await quote({ lines, couponCode: "ONCE", userId: fresh.id })).applied).toBe("coupon");
  });

  it("loads only live offers, oldest first", async () => {
    const now = new Date();
    const hour = 3_600_000;
    await db.offer.create({ data: { label: "Live", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900 } });
    await db.offer.create({ data: { label: "Off", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900, active: false } });
    await db.offer.create({ data: { label: "Later", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900, startsAt: new Date(now.getTime() + hour) } });
    await db.offer.create({ data: { label: "Gone", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900, endsAt: new Date(now.getTime() - hour) } });
    expect((await getLiveOffers(now)).map((o) => o.label)).toEqual(["Live"]);
    const r = await quote({ lines, userId: null, now });
    expect(r).toMatchObject({ applied: "offer", offer: { label: "Live", discountPaise: 19900 } });
  });
});
```

Run: `npm test -- tests/unit/pricing.test.ts tests/unit/promotions.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Implement**

Create `src/lib/pricing.ts`:

```ts
import { formatPaise } from "@/lib/money";

export type OfferKind = "BUNDLE_PRICE" | "QTY_PERCENT";
export type CouponKind = "PERCENT" | "FLAT";

export interface PricingLine { unitPricePaise: number; quantity: number; collectionIds: string[] }
export interface PricingOffer {
  id: string; label: string; type: OfferKind; minQty: number; pricePaise: number | null; percent: number | null;
  collectionId: string | null; active: boolean; startsAt: Date | null; endsAt: Date | null;
}
export interface PricingCoupon {
  code: string; type: CouponKind; value: number; minSubtotalPaise: number; maxDiscountPaise: number | null;
  startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; perUserLimit: number | null; active: boolean;
}
export interface PricingSettings { shippingFeePaise: number; freeShippingThresholdPaise: number }
export interface PricingContext {
  offers: PricingOffer[]; coupon: PricingCoupon | null; settings: PricingSettings; now: Date;
  couponUsesTotal?: number; couponUsesByUser?: number;
}
export interface PriceResult {
  subtotalPaise: number;
  offer: { label: string; discountPaise: number } | null;
  coupon: { code: string; discountPaise: number } | null;
  couponError?: string;
  applied: "offer" | "coupon" | null;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
}

function live(x: { active: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
  if (!x.active) return false;
  if (x.startsAt && now < x.startsAt) return false;
  if (x.endsAt && now > x.endsAt) return false;
  return true;
}

export function offerDiscount(offer: PricingOffer, lines: PricingLine[]): number {
  const units: number[] = [];
  for (const l of lines) {
    if (offer.collectionId && !l.collectionIds.includes(offer.collectionId)) continue;
    for (let i = 0; i < l.quantity; i++) units.push(l.unitPricePaise);
  }
  if (offer.minQty < 1 || units.length < offer.minQty) return 0;
  if (offer.type === "QTY_PERCENT") {
    const eligible = units.reduce((s, u) => s + u, 0);
    return Math.floor((eligible * (offer.percent ?? 0)) / 100);
  }
  if (offer.pricePaise === null) return 0;
  units.sort((a, b) => a - b);
  const groups = Math.floor(units.length / offer.minQty);
  let discount = 0;
  for (let g = 0; g < groups; g++) {
    const normal = units.slice(g * offer.minQty, (g + 1) * offer.minQty).reduce((s, u) => s + u, 0);
    discount += normal - Math.min(offer.pricePaise, normal);
  }
  return discount;
}

export function couponDiscount(coupon: PricingCoupon, subtotalPaise: number): number {
  const raw = coupon.type === "PERCENT" ? Math.floor((subtotalPaise * coupon.value) / 100) : coupon.value;
  const capped = coupon.maxDiscountPaise !== null ? Math.min(raw, coupon.maxDiscountPaise) : raw;
  return Math.max(0, Math.min(capped, subtotalPaise));
}

export function couponProblem(
  coupon: PricingCoupon,
  subtotalPaise: number,
  ctx: Pick<PricingContext, "now" | "couponUsesTotal" | "couponUsesByUser">,
): string | null {
  if (!coupon.active) return "This code is not active";
  if (coupon.startsAt && ctx.now < coupon.startsAt) return "This code is not active yet";
  if (coupon.endsAt && ctx.now > coupon.endsAt) return "This code has expired";
  if (coupon.usageLimit !== null && (ctx.couponUsesTotal ?? 0) >= coupon.usageLimit) return "This code has reached its usage limit";
  if (coupon.perUserLimit !== null && (ctx.couponUsesByUser ?? 0) >= coupon.perUserLimit) return "You have already used this code";
  if (subtotalPaise < coupon.minSubtotalPaise) return `Add ${formatPaise(coupon.minSubtotalPaise - subtotalPaise)} more to use this code`;
  return null;
}

export function priceCart(lines: PricingLine[], ctx: PricingContext): PriceResult {
  const subtotalPaise = lines.reduce((s, l) => s + l.unitPricePaise * l.quantity, 0);

  let offer: PriceResult["offer"] = null;
  for (const o of ctx.offers) {
    if (!live(o, ctx.now)) continue;
    const d = Math.min(offerDiscount(o, lines), subtotalPaise);
    if (d > 0 && (!offer || d > offer.discountPaise)) offer = { label: o.label, discountPaise: d };
  }

  let coupon: PriceResult["coupon"] = null;
  let couponError: string | undefined;
  if (ctx.coupon) {
    const problem = couponProblem(ctx.coupon, subtotalPaise, ctx);
    if (problem) couponError = problem;
    else coupon = { code: ctx.coupon.code, discountPaise: couponDiscount(ctx.coupon, subtotalPaise) };
  }

  let applied: PriceResult["applied"] = null;
  let discountPaise = 0;
  if (offer && offer.discountPaise >= (coupon?.discountPaise ?? 0)) {
    applied = "offer";
    discountPaise = offer.discountPaise;
  } else if (coupon && coupon.discountPaise > 0) {
    applied = "coupon";
    discountPaise = coupon.discountPaise;
  }

  const discounted = subtotalPaise - discountPaise;
  const shippingPaise = subtotalPaise === 0 || discounted >= ctx.settings.freeShippingThresholdPaise ? 0 : ctx.settings.shippingFeePaise;
  const totalPaise = Math.max(0, discounted + shippingPaise);
  return { subtotalPaise, offer, coupon, ...(couponError ? { couponError } : {}), applied, discountPaise, shippingPaise, totalPaise };
}

export function discountLabel(r: PriceResult): string | null {
  if (r.applied === "offer" && r.offer) return `Offer: ${r.offer.label}`;
  if (r.applied === "coupon" && r.coupon) return `Code ${r.coupon.code}`;
  return null;
}
```

Create `src/server/services/promotions.ts`:

```ts
import { db } from "@/server/db";
import { PAID_STATUSES } from "@/lib/order-status";
import { priceCart, type PriceResult, type PricingCoupon, type PricingLine, type PricingOffer } from "@/lib/pricing";
import { getSettings } from "@/server/services/settings";

export const UNKNOWN_COUPON = "This code is not valid";

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function getLiveOffers(now: Date = new Date()): Promise<PricingOffer[]> {
  const rows = await db.offer.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((o) => ({
    id: o.id, label: o.label, type: o.type, minQty: o.minQty, pricePaise: o.pricePaise, percent: o.percent,
    collectionId: o.collectionId, active: o.active, startsAt: o.startsAt, endsAt: o.endsAt,
  }));
}

export async function findCoupon(code: string): Promise<PricingCoupon | null> {
  const c = await db.coupon.findUnique({ where: { code: normalizeCouponCode(code) } });
  if (!c) return null;
  return {
    code: c.code, type: c.type, value: c.value, minSubtotalPaise: c.minSubtotalPaise, maxDiscountPaise: c.maxDiscountPaise,
    startsAt: c.startsAt, endsAt: c.endsAt, usageLimit: c.usageLimit, perUserLimit: c.perUserLimit, active: c.active,
  };
}

export async function couponUses(code: string, userId: string | null): Promise<{ total: number; byUser: number }> {
  const where = { couponCode: normalizeCouponCode(code), status: { in: [...PAID_STATUSES] } };
  const [total, byUser] = await Promise.all([
    db.order.count({ where }),
    userId ? db.order.count({ where: { ...where, userId } }) : Promise.resolve(0),
  ]);
  return { total, byUser };
}

/** Server-side price for a set of lines. Always recomputed; never trust a client total. */
export async function quote(args: { lines: PricingLine[]; couponCode?: string | null; userId: string | null; now?: Date }): Promise<PriceResult> {
  const now = args.now ?? new Date();
  const code = args.couponCode ? normalizeCouponCode(args.couponCode) : "";
  const [settings, offers, coupon] = await Promise.all([getSettings(), getLiveOffers(now), code ? findCoupon(code) : Promise.resolve(null)]);
  const uses = coupon ? await couponUses(coupon.code, args.userId) : { total: 0, byUser: 0 };
  const result = priceCart(args.lines, { offers, coupon, settings, now, couponUsesTotal: uses.total, couponUsesByUser: uses.byUser });
  return code && !coupon ? { ...result, couponError: UNKNOWN_COUPON } : result;
}
```

- [ ] **Step 3: Verify and commit**

Run the two test files (GREEN), then the full gate.

```bash
git add src/lib/pricing.ts src/server/services/promotions.ts tests/helpers/fixtures.ts tests/unit/pricing.test.ts tests/unit/promotions.test.ts
git commit -m "feat(commerce): add pricing engine with offers, coupons and shipping

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 3: Addresses — validation, service, account UI, API

**Files:**
- Create: `src/lib/validation/address.ts`, `src/lib/address-format.ts`, `src/server/session-user.ts`, `src/server/services/addresses.ts`, `src/app/(storefront)/account/addresses/page.tsx`, `src/app/(storefront)/account/addresses/actions.ts`, `src/components/storefront/account/address-form.tsx`, `src/components/storefront/account/address-book.tsx`, `src/components/storefront/account/account-nav.tsx`, `src/app/api/v1/addresses/route.ts`, `src/app/api/v1/addresses/[id]/route.ts`, `src/app/api/v1/addresses/[id]/default/route.ts`
- Modify: `src/app/(storefront)/account/page.tsx` (render `<AccountNav />` under the heading)
- Test: `tests/unit/addresses.test.ts`, `tests/unit/address-format.test.ts`, `tests/unit/addresses-api.test.ts`

**Interfaces:**
- Consumes: `INDIA_STATES` (Task 1), `optionalText`, `phoneSchema` (Task 1), `createUser` fixture (Task 1), `db`, `auth`, errors, `zodFieldErrors`, `actionError`, `handle`/`ok`/`parseJson`/`requireApiUser`, `signApiToken`.
- Produces:

```ts
// @/lib/validation/address
export const pincodeSchema: ZodType<string>;
export const addressInputSchema;                                   // see Step 3
export interface AddressFormValues { fullName: string; phone: string; line1: string; line2: string; landmark: string; city: string; state: string; pincode: string; isDefault: boolean }
export const EMPTY_ADDRESS: AddressFormValues;
// @/lib/address-format
export interface AddressLike { line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string }
export function addressLines(a: AddressLike): string[];            // ["12 MG Road", "Indiranagar", "Near Metro", "Bengaluru, Karnataka 560001"]
export function formatPhone(tenDigits: string): string;           // "98765 43210"
export function addressText(name: string, phone: string, a: AddressLike): string;   // multi-line, for Copy buttons and CSV
// @/server/session-user
export function requireUserId(): Promise<string>;                  // UnauthorizedError when signed out
// @/server/services/addresses
export const MAX_ADDRESSES = 10;
export interface AddressView { id: string; fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string; isDefault: boolean }
export function listAddresses(userId: string): Promise<AddressView[]>;           // default first, then newest
export function getAddress(userId: string, id: string): Promise<AddressView>;   // NotFoundError
export function createAddress(userId: string, input: unknown): Promise<AddressView>;
export function updateAddress(userId: string, id: string, input: unknown): Promise<AddressView>;
export function setDefaultAddress(userId: string, id: string): Promise<AddressView[]>;
export function deleteAddress(userId: string, id: string): Promise<void>;
// src/app/(storefront)/account/addresses/actions.ts
export function saveAddressAction(id: string | null, input: AddressFormValues): Promise<ActionResult<AddressView>>;
export function deleteAddressAction(id: string): Promise<ActionResult<AddressView[]>>;
export function setDefaultAddressAction(id: string): Promise<ActionResult<AddressView[]>>;
// components
export function AddressForm(props: { initial?: AddressView | null; onSaved: (a: AddressView) => void; onCancel?: () => void; forceDefault?: boolean }): JSX.Element;
export function AddressBook(props: { addresses: AddressView[] }): JSX.Element;
export function AccountNav(): JSX.Element;
```

Rules (spec §3): phone is 10 digits starting 6–9 (input may contain spaces, `+91`, `0`); pincode 6 digits not starting with 0; state from `INDIA_STATES`; max 10 per user (`ConflictError`); the first address is always the default; making one default clears the others in the same transaction; the current default cannot be un-defaulted by an edit (pick another as default instead); deleting the default promotes the most recently updated remaining address. Other users' addresses are `NotFoundError`.

- [ ] **Step 1: Failing tests**

Create `tests/unit/address-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addressLines, addressText, formatPhone } from "@/lib/address-format";

const a = { line1: "12 MG Road", line2: "Indiranagar", landmark: "near Metro Pillar 40", city: "Bengaluru", state: "Karnataka", pincode: "560001" };

describe("address formatting", () => {
  it("builds printable lines and skips blanks", () => {
    expect(addressLines(a)).toEqual(["12 MG Road", "Indiranagar", "Near Metro Pillar 40", "Bengaluru, Karnataka 560001"]);
    expect(addressLines({ ...a, line2: null, landmark: null })).toEqual(["12 MG Road", "Bengaluru, Karnataka 560001"]);
  });

  it("formats phones and whole blocks", () => {
    expect(formatPhone("9876543210")).toBe("98765 43210");
    expect(addressText("Asha Rao", "9876543210", { ...a, line2: null, landmark: null })).toBe(
      "Asha Rao\n12 MG Road\nBengaluru, Karnataka 560001\nPhone: 98765 43210",
    );
  });
});
```

Create `tests/unit/addresses.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/fixtures";
import { createAddress, deleteAddress, getAddress, listAddresses, MAX_ADDRESSES, setDefaultAddress, updateAddress } from "@/server/services/addresses";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

const addr = (over: Record<string, unknown> = {}) => ({
  fullName: "Asha Rao", phone: "+91 98765-43210", line1: "12 MG Road", line2: "", landmark: "",
  city: "Bengaluru", state: "Karnataka", pincode: "560001", isDefault: false, ...over,
});

describe("addresses service", () => {
  beforeEach(resetDb);

  it("normalises input and makes the first address the default", async () => {
    const u = await createUser();
    const a = await createAddress(u.id, addr());
    expect(a).toMatchObject({ phone: "9876543210", line2: null, landmark: null, isDefault: true });
    const b = await createAddress(u.id, addr({ fullName: "Ravi" }));
    expect(b.isDefault).toBe(false);
    const c = await createAddress(u.id, addr({ fullName: "Meera", isDefault: true }));
    const list = await listAddresses(u.id);
    expect(list[0].id).toBe(c.id);
    expect(list.filter((x) => x.isDefault)).toHaveLength(1);
  });

  it("validates phone, pincode and state", async () => {
    const u = await createUser();
    const err = await createAddress(u.id, addr({ phone: "12345", pincode: "060001", state: "Bombay" })).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys(err.details)).toEqual(expect.arrayContaining(["phone", "pincode", "state"]));
  });

  it("caps each user at ten addresses", async () => {
    const u = await createUser();
    for (let i = 0; i < MAX_ADDRESSES; i++) await createAddress(u.id, addr({ fullName: `Name ${i}` }));
    await expect(createAddress(u.id, addr())).rejects.toBeInstanceOf(ConflictError);
  });

  it("keeps addresses private to their owner", async () => {
    const u = await createUser();
    const other = await createUser();
    const a = await createAddress(u.id, addr());
    await expect(getAddress(other.id, a.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateAddress(other.id, a.id, addr())).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteAddress(other.id, a.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("switches the default and never leaves none", async () => {
    const u = await createUser();
    const a = await createAddress(u.id, addr());
    const b = await createAddress(u.id, addr({ fullName: "Ravi" }));
    expect((await updateAddress(u.id, a.id, addr({ isDefault: false }))).isDefault).toBe(true);
    const list = await setDefaultAddress(u.id, b.id);
    expect(list.find((x) => x.isDefault)?.id).toBe(b.id);
    await deleteAddress(u.id, b.id);
    expect((await listAddresses(u.id))[0]).toMatchObject({ id: a.id, isDefault: true });
    await deleteAddress(u.id, a.id);
    expect(await listAddresses(u.id)).toEqual([]);
  });
});
```

Create `tests/unit/addresses-api.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/fixtures";
import { signApiToken } from "@/server/api-token";
import { GET as list, POST as create } from "@/app/api/v1/addresses/route";
import { DELETE as remove, PATCH as patch } from "@/app/api/v1/addresses/[id]/route";
import { POST as makeDefault } from "@/app/api/v1/addresses/[id]/default/route";

const BASE = "http://localhost:3000";
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });
const body = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", line2: "", landmark: "", city: "Bengaluru", state: "Karnataka", pincode: "560001", isDefault: false };

describe("/api/v1/addresses", () => {
  beforeEach(resetDb);

  it("requires a signed-in user", async () => {
    const res = await list(new NextRequest(`${BASE}/api/v1/addresses`), params({}));
    expect(res.status).toBe(401);
  });

  it("creates, lists, updates, defaults and deletes", async () => {
    const u = await createUser();
    const auth = { authorization: `Bearer ${await signApiToken({ id: u.id, role: "CUSTOMER" })}`, "content-type": "application/json" };
    const created = await create(new NextRequest(`${BASE}/api/v1/addresses`, { method: "POST", headers: auth, body: JSON.stringify(body) }), params({}));
    expect(created.status).toBe(201);
    const a = (await created.json()).data;
    expect(a.isDefault).toBe(true);

    const second = await (await create(new NextRequest(`${BASE}/api/v1/addresses`, { method: "POST", headers: auth, body: JSON.stringify({ ...body, fullName: "Ravi" }) }), params({}))).json();
    const bad = await create(new NextRequest(`${BASE}/api/v1/addresses`, { method: "POST", headers: auth, body: JSON.stringify({ ...body, pincode: "12" }) }), params({}));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.details.pincode).toBeDefined();

    const updated = await patch(new NextRequest(`${BASE}/api/v1/addresses/${a.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ ...body, city: "Mysuru" }) }), params({ id: a.id }));
    expect((await updated.json()).data.city).toBe("Mysuru");

    const defaults = await (await makeDefault(new NextRequest(`${BASE}/api/v1/addresses/${second.data.id}/default`, { method: "POST", headers: auth }), params({ id: second.data.id }))).json();
    expect(defaults.data[0]).toMatchObject({ id: second.data.id, isDefault: true });

    const del = await remove(new NextRequest(`${BASE}/api/v1/addresses/${a.id}`, { method: "DELETE", headers: auth }), params({ id: a.id }));
    expect(del.status).toBe(200);
    const after = await (await list(new NextRequest(`${BASE}/api/v1/addresses`, { headers: auth }), params({}))).json();
    expect(after.data).toHaveLength(1);
  });
});
```

Run: `npm test -- tests/unit/address-format.test.ts tests/unit/addresses.test.ts tests/unit/addresses-api.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Formatting and session helpers**

Create `src/lib/address-format.ts`:

```ts
export interface AddressLike { line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string }

export function addressLines(a: AddressLike): string[] {
  const landmark = a.landmark ? `Near ${a.landmark.replace(/^near\s+/i, "")}` : null;
  return [a.line1, a.line2, landmark, `${a.city}, ${a.state} ${a.pincode}`].filter((s): s is string => Boolean(s));
}

export function formatPhone(tenDigits: string): string {
  return /^\d{10}$/.test(tenDigits) ? `${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}` : tenDigits;
}

export function addressText(name: string, phone: string, a: AddressLike): string {
  return [name, ...addressLines(a), `Phone: ${formatPhone(phone)}`].join("\n");
}
```

Create `src/server/session-user.ts`:

```ts
import { auth } from "@/server/auth";
import { UnauthorizedError } from "@/server/errors";

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}
```

- [ ] **Step 3: Validation and service**

Create `src/lib/validation/address.ts`:

```ts
import { z } from "zod";
import { INDIA_STATES } from "@/lib/india-states";
import { optionalText, phoneSchema } from "@/lib/validation/common";

export const pincodeSchema = z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code");

export const addressInputSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name").max(80),
  phone: phoneSchema,
  line1: z.string().trim().min(3, "Enter house number and street").max(120),
  line2: optionalText(120),
  landmark: optionalText(80),
  city: z.string().trim().min(2, "Enter the city").max(60),
  state: z.enum(INDIA_STATES, { errorMap: () => ({ message: "Choose a state" }) }),
  pincode: pincodeSchema,
  isDefault: z.boolean().default(false),
});

export interface AddressFormValues {
  fullName: string; phone: string; line1: string; line2: string; landmark: string;
  city: string; state: string; pincode: string; isDefault: boolean;
}

export const EMPTY_ADDRESS: AddressFormValues = {
  fullName: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", pincode: "", isDefault: false,
};
```

Create `src/server/services/addresses.ts`:

```ts
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { addressInputSchema } from "@/lib/validation/address";

export const MAX_ADDRESSES = 10;

export interface AddressView {
  id: string; fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null;
  city: string; state: string; pincode: string; isDefault: boolean;
}

const select = {
  id: true, fullName: true, phone: true, line1: true, line2: true, landmark: true,
  city: true, state: true, pincode: true, isDefault: true,
} as const;

function parse(input: unknown) {
  const r = addressInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  return r.data;
}

export async function listAddresses(userId: string): Promise<AddressView[]> {
  return db.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], select });
}

export async function getAddress(userId: string, id: string): Promise<AddressView> {
  const a = await db.address.findFirst({ where: { id, userId }, select });
  if (!a) throw new NotFoundError("Address");
  return a;
}

export async function createAddress(userId: string, input: unknown): Promise<AddressView> {
  const data = parse(input);
  return db.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) throw new ConflictError(`You can save up to ${MAX_ADDRESSES} addresses. Delete one first.`);
    const isDefault = data.isDefault || count === 0;
    if (isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.create({ data: { ...data, userId, isDefault }, select });
  });
}

export async function updateAddress(userId: string, id: string, input: unknown): Promise<AddressView> {
  const data = parse(input);
  return db.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Address");
    const isDefault = existing.isDefault || data.isDefault;
    if (isDefault && !existing.isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.update({ where: { id }, data: { ...data, isDefault }, select });
  });
}

export async function setDefaultAddress(userId: string, id: string): Promise<AddressView[]> {
  await db.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Address");
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    await tx.address.update({ where: { id }, data: { isDefault: true } });
  });
  return listAddresses(userId);
}

export async function deleteAddress(userId: string, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Address");
    await tx.address.delete({ where: { id } });
    if (existing.isDefault) {
      const next = await tx.address.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}
```

- [ ] **Step 4: API routes**

Create `src/app/api/v1/addresses/route.ts`:

```ts
import { z } from "zod";
import { handle, ok, parseJson, requireApiUser } from "@/server/api";
import { createAddress, listAddresses } from "@/server/services/addresses";

const anyObject = z.object({}).passthrough();

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  return ok(await listAddresses(user.id));
});

export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  return ok(await createAddress(user.id, await parseJson(req, anyObject)), { status: 201 });
});
```

Create `src/app/api/v1/addresses/[id]/route.ts`:

```ts
import { z } from "zod";
import { handle, ok, parseJson, requireApiUser } from "@/server/api";
import { deleteAddress, updateAddress } from "@/server/services/addresses";

const anyObject = z.object({}).passthrough();

export const PATCH = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return ok(await updateAddress(user.id, id, await parseJson(req, anyObject)));
});

export const DELETE = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await deleteAddress(user.id, id);
  return ok({ deleted: true });
});
```

Create `src/app/api/v1/addresses/[id]/default/route.ts`:

```ts
import { handle, ok, requireApiUser } from "@/server/api";
import { setDefaultAddress } from "@/server/services/addresses";

export const POST = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return ok(await setDefaultAddress(user.id, id));
});
```

- [ ] **Step 5: Actions**

Create `src/app/(storefront)/account/addresses/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { actionError, type ActionResult } from "@/server/action-result";
import { requireUserId } from "@/server/session-user";
import { createAddress, deleteAddress, listAddresses, setDefaultAddress, updateAddress, type AddressView } from "@/server/services/addresses";
import type { AddressFormValues } from "@/lib/validation/address";

function refresh() {
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
}

export async function saveAddressAction(id: string | null, input: AddressFormValues): Promise<ActionResult<AddressView>> {
  try {
    const userId = await requireUserId();
    const saved = id ? await updateAddress(userId, id, input) : await createAddress(userId, input);
    refresh();
    return { ok: true, data: saved };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteAddressAction(id: string): Promise<ActionResult<AddressView[]>> {
  try {
    const userId = await requireUserId();
    await deleteAddress(userId, id);
    refresh();
    return { ok: true, data: await listAddresses(userId) };
  } catch (err) {
    return actionError(err);
  }
}

export async function setDefaultAddressAction(id: string): Promise<ActionResult<AddressView[]>> {
  try {
    const userId = await requireUserId();
    const list = await setDefaultAddress(userId, id);
    refresh();
    return { ok: true, data: list };
  } catch (err) {
    return actionError(err);
  }
}
```

- [ ] **Step 6: Address form (reused by checkout in Task 7)**

Create `src/components/storefront/account/address-form.tsx`. The labels and button text below are relied on by the e2e specs in Task 13; keep them exactly.

```tsx
"use client";

import { useId, useState, useTransition } from "react";
import { saveAddressAction } from "@/app/(storefront)/account/addresses/actions";
import { FieldError } from "@/components/auth/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INDIA_STATES } from "@/lib/india-states";
import { EMPTY_ADDRESS, type AddressFormValues } from "@/lib/validation/address";
import type { AddressView } from "@/server/services/addresses";

type Errors = Record<string, string[]>;

function toValues(a: AddressView | null | undefined): AddressFormValues {
  if (!a) return EMPTY_ADDRESS;
  return { fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", landmark: a.landmark ?? "", city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault };
}

export function AddressForm({ initial, onSaved, onCancel, forceDefault = false }: {
  initial?: AddressView | null; onSaved: (a: AddressView) => void; onCancel?: () => void; forceDefault?: boolean;
}) {
  const uid = useId();
  const [values, setValues] = useState<AddressFormValues>(() => ({ ...toValues(initial), isDefault: forceDefault || Boolean(initial?.isDefault) }));
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof AddressFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const id = (k: string) => `${uid}-${k}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await saveAddressAction(initial?.id ?? null, values);
      if (res.ok) {
        setErrors({});
        setMessage(null);
        onSaved(res.data);
      } else {
        setErrors(res.fieldErrors ?? {});
        setMessage(res.message);
      }
    });
  }

  const field = "mt-1 h-11 bg-bg";
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" data-testid="address-form" noValidate>
      <div><Label htmlFor={id("name")}>Full name</Label><Input id={id("name")} autoComplete="name" value={values.fullName} onChange={set("fullName")} className={field} aria-invalid={Boolean(errors.fullName)} /><FieldError errors={errors.fullName} /></div>
      <div><Label htmlFor={id("phone")}>Mobile number</Label><Input id={id("phone")} type="tel" inputMode="numeric" autoComplete="tel-national" value={values.phone} onChange={set("phone")} className={field} aria-invalid={Boolean(errors.phone)} /><FieldError errors={errors.phone} /></div>
      <div className="sm:col-span-2"><Label htmlFor={id("line1")}>House, flat, street</Label><Input id={id("line1")} autoComplete="address-line1" value={values.line1} onChange={set("line1")} className={field} aria-invalid={Boolean(errors.line1)} /><FieldError errors={errors.line1} /></div>
      <div className="sm:col-span-2"><Label htmlFor={id("line2")}>Area, locality (optional)</Label><Input id={id("line2")} autoComplete="address-line2" value={values.line2} onChange={set("line2")} className={field} /><FieldError errors={errors.line2} /></div>
      <div><Label htmlFor={id("landmark")}>Landmark (optional)</Label><Input id={id("landmark")} autoComplete="off" value={values.landmark} onChange={set("landmark")} className={field} /><FieldError errors={errors.landmark} /></div>
      <div><Label htmlFor={id("city")}>City</Label><Input id={id("city")} autoComplete="address-level2" value={values.city} onChange={set("city")} className={field} aria-invalid={Boolean(errors.city)} /><FieldError errors={errors.city} /></div>
      <div>
        <Label htmlFor={id("state")}>State</Label>
        <select id={id("state")} autoComplete="address-level1" value={values.state} onChange={set("state")} className="mt-1 h-11 w-full rounded-lg border border-input bg-bg px-2.5 text-base md:text-sm" aria-invalid={Boolean(errors.state)}>
          <option value="">Choose a state</option>
          {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <FieldError errors={errors.state} />
      </div>
      <div><Label htmlFor={id("pincode")}>PIN code</Label><Input id={id("pincode")} inputMode="numeric" maxLength={6} autoComplete="postal-code" value={values.pincode} onChange={set("pincode")} className={field} aria-invalid={Boolean(errors.pincode)} /><FieldError errors={errors.pincode} /></div>
      {!forceDefault && (
        <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
          <input type="checkbox" checked={values.isDefault} onChange={set("isDefault")} className="size-5 accent-brand" />
          Make this my default address
        </label>
      )}
      {message && <p className="text-sm text-danger sm:col-span-2" role="alert">{message}</p>}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending} className="h-11 px-5">{pending ? "Saving…" : "Save address"}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel} className="h-11 px-5">Cancel</Button>}
      </div>
    </form>
  );
}
```

- [ ] **Step 7: Address book, account nav, page**

Create `src/components/storefront/account/address-book.tsx` (client). Responsibilities:
- Props `{ addresses: AddressView[] }`; local state `list`, `editing: string | "new" | null`, `confirmingDelete: string | null`, `useTransition`.
- Renders a `<ul className="grid gap-4 md:grid-cols-2" data-testid="address-list">` of cards (`<li data-testid="address-card">`): full name (bold), `addressLines(a)` each on its own line, `Phone: formatPhone(a.phone)`, a "Default" `Badge` when `isDefault`. Card actions in a wrapping row, each `Button variant="ghost" className="h-11"`: **Edit** (swaps the card for `<AddressForm initial={a} …>`), **Set as default** (hidden on the default; calls `setDefaultAddressAction`, replaces `list` with the result), **Delete** (first click sets `confirmingDelete`, showing "Delete this address?" with **Yes, delete** / **Keep**; Yes calls `deleteAddressAction` and replaces `list`).
- An **Add a new address** button (`h-11`) opens `<AddressForm forceDefault={list.length === 0} …>`; disabled with helper text "You can save up to 10 addresses" when `list.length >= 10`.
- On save, merge the returned address into `list` (if it became default, clear `isDefault` on the others locally) and close the form; `toast.success("Address saved")` from `sonner`. Errors from delete/default go to `toast.error(res.message)`.
- Empty state: "No saved addresses yet. Add one to check out faster." with the add button.

Create `src/components/storefront/account/account-nav.tsx` (client, `usePathname`): a `<nav aria-label="Account">` with a horizontally scrollable row (`flex gap-2 overflow-x-auto`) of pill links, each `min-h-11 inline-flex items-center rounded-full px-4 text-sm`, active one `bg-surface-raised text-text` with `aria-current="page"` (exact match for `/account`, prefix match otherwise). Items for now: **Overview** `/account`, **Addresses** `/account/addresses` (Task 8 inserts **Orders**).

Create `src/app/(storefront)/account/addresses/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/storefront/account/account-nav";
import { AddressBook } from "@/components/storefront/account/address-book";
import { auth } from "@/server/auth";
import { listAddresses } from "@/server/services/addresses";

export const metadata: Metadata = { title: "Addresses" };

export default async function AddressesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=%2Faccount%2Faddresses");
  const addresses = await listAddresses(session.user.id);
  return (
    <div className="container-x space-y-6 py-10" data-testid="addresses-page">
      <h1 className="text-5xl md:text-7xl">Addresses</h1>
      <AccountNav />
      <AddressBook addresses={addresses} />
    </div>
  );
}
```

In `src/app/(storefront)/account/page.tsx` render `<AccountNav />` between the heading block and the `Tabs` (import it). Nothing else changes in this task.

- [ ] **Step 8: Verify and commit**

Run the three test files (GREEN), the full gate, then a manual check on port 3001: register, open `/account/addresses` at a 360 px wide viewport, add two addresses (the first becomes default), switch default, edit, delete; confirm no horizontal scroll and that the form shows inline errors for a bad PIN. Stop the server.

```bash
git add src/lib/validation/address.ts src/lib/address-format.ts src/server/session-user.ts src/server/services/addresses.ts "src/app/(storefront)/account/addresses" "src/app/(storefront)/account/page.tsx" src/components/storefront/account/address-form.tsx src/components/storefront/account/address-book.tsx src/components/storefront/account/account-nav.tsx src/app/api/v1/addresses tests/unit/address-format.test.ts tests/unit/addresses.test.ts tests/unit/addresses-api.test.ts
git commit -m "feat(account): add saved addresses with default handling, UI and API

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 4: Payment providers — Razorpay over fetch, mock, HMAC

**Files:**
- Create: `src/server/payments/types.ts`, `src/server/payments/hmac.ts`, `src/server/payments/razorpay.ts`, `src/server/payments/mock.ts`, `src/server/payments/index.ts`
- Modify: `src/server/errors.ts` (add `PaymentError`), `.env.example`, `.env.test`
- Test: `tests/unit/payments.test.ts`

**Interfaces:**
- Consumes: `DomainError`.
- Produces:

```ts
// @/server/errors (added)
export class PaymentError extends DomainError {}                 // code PAYMENT_ERROR, status 502
// @/server/payments/types
export type ProviderName = "razorpay" | "mock";
export interface ProviderOrder { id: string; amountPaise: number; currency: "INR" }
export interface PaymentProvider {
  readonly name: ProviderName;
  readonly publicKey: string | null;                              // Razorpay key id for Checkout.js; null for mock
  createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder>;
  verifyPaymentSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  refund(paymentId: string, amountPaise: number): Promise<{ id: string }>;
}
// @/server/payments/hmac
export function hmacSha256Hex(secret: string, payload: string): string;
export function safeEqual(a: string, b: string): boolean;       // timingSafeEqual, false on length mismatch
export function verifyHmac(secret: string, payload: string, signature: string | null | undefined): boolean;
// @/server/payments/razorpay
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export class RazorpayProvider implements PaymentProvider { constructor(keyId: string, keySecret: string, webhookSecret: string, fetchImpl?: FetchLike) }
// @/server/payments/mock
export const MOCK_SECRET: string;
export class MockProvider implements PaymentProvider { sign(providerOrderId: string, paymentId: string): string }
export function newMockPaymentId(): string;                      // "mock_pay_…"
// @/server/payments
export function paymentProviderName(): ProviderName;             // PAYMENT_PROVIDER || "mock"; throws on unknown
export function getPaymentProvider(): PaymentProvider;           // cached; refuses mock in production; razorpay needs all three keys
export function isMockPayments(): boolean;                       // mock AND not production
export function resetPaymentProviderCache(): void;               // tests only
export type { PaymentProvider, ProviderName, ProviderOrder };
```

- [ ] **Step 1: Failing tests**

The signature fixtures below were computed with Node's `crypto.createHmac("sha256", key).update(msg).digest("hex")`.

Create `tests/unit/payments.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex, safeEqual, verifyHmac } from "@/server/payments/hmac";
import { RazorpayProvider, type FetchLike } from "@/server/payments/razorpay";
import { MOCK_SECRET, MockProvider, newMockPaymentId } from "@/server/payments/mock";
import { getPaymentProvider, isMockPayments, resetPaymentProviderCache } from "@/server/payments";
import { PaymentError } from "@/server/errors";

// HMAC-SHA256("test_key_secret", "order_TEST123|pay_TEST456")
const ORDER_SIG = "4e29c3db4c2941c4f1b1845d71c004542e3b6439806ce9aeef5e5d9d291c48fe";
const WEBHOOK_BODY = '{"event":"payment.captured"}';
// HMAC-SHA256("whsec_test", WEBHOOK_BODY)
const WEBHOOK_SIG = "4f463a57dd128675850163391f0311888616d57bccca75c774c9cdb28134f851";

function fakeFetch(status: number, body: unknown) {
  return vi.fn<FetchLike>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
const provider = (f: FetchLike) => new RazorpayProvider("rzp_test_key", "test_key_secret", "whsec_test", f);

describe("hmac helpers", () => {
  it("matches known HMAC-SHA256 hex fixtures", () => {
    expect(hmacSha256Hex("test_key_secret", "order_TEST123|pay_TEST456")).toBe(ORDER_SIG);
    expect(hmacSha256Hex("whsec_test", WEBHOOK_BODY)).toBe(WEBHOOK_SIG);
  });

  it("compares safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(verifyHmac("whsec_test", WEBHOOK_BODY, ` ${WEBHOOK_SIG.toUpperCase()} `)).toBe(true);
    expect(verifyHmac("whsec_test", WEBHOOK_BODY, "")).toBe(false);
    expect(verifyHmac("whsec_test", WEBHOOK_BODY, null)).toBe(false);
  });
});

describe("RazorpayProvider", () => {
  it("creates an order with basic auth and a paise amount", async () => {
    const f = fakeFetch(200, { id: "order_ABC", amount: 67800, currency: "INR" });
    const p = provider(f);
    await expect(p.createOrder({ amountPaise: 67800, receipt: "ORD-1001", notes: { orderId: "o1" } })).resolves.toEqual({ id: "order_ABC", amountPaise: 67800, currency: "INR" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("rzp_test_key:test_key_secret").toString("base64")}`);
    expect(JSON.parse(init.body as string)).toEqual({ amount: 67800, currency: "INR", receipt: "ORD-1001", notes: { orderId: "o1" } });
    expect(p.publicKey).toBe("rzp_test_key");
    expect(p.name).toBe("razorpay");
  });

  it("maps API errors and network failures to PaymentError", async () => {
    await expect(provider(fakeFetch(400, { error: { description: "bad" } })).createOrder({ amountPaise: 100, receipt: "r" })).rejects.toBeInstanceOf(PaymentError);
    const down = vi.fn<FetchLike>(async () => { throw new TypeError("fetch failed"); });
    await expect(provider(down).createOrder({ amountPaise: 100, receipt: "r" })).rejects.toBeInstanceOf(PaymentError);
  });

  it("verifies payment and webhook signatures", () => {
    const p = provider(fakeFetch(200, {}));
    expect(p.verifyPaymentSignature({ providerOrderId: "order_TEST123", paymentId: "pay_TEST456", signature: ORDER_SIG })).toBe(true);
    expect(p.verifyPaymentSignature({ providerOrderId: "order_TEST123", paymentId: "pay_OTHER", signature: ORDER_SIG })).toBe(false);
    expect(p.verifyWebhookSignature(WEBHOOK_BODY, WEBHOOK_SIG)).toBe(true);
    expect(p.verifyWebhookSignature(`${WEBHOOK_BODY} `, WEBHOOK_SIG)).toBe(false);
  });

  it("refunds a payment by id", async () => {
    const f = fakeFetch(200, { id: "rfnd_1" });
    await expect(provider(f).refund("pay_1", 5000)).resolves.toEqual({ id: "rfnd_1" });
    expect(f.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/payments/pay_1/refund");
    expect(JSON.parse(f.mock.calls[0][1].body as string)).toEqual({ amount: 5000 });
  });
});

describe("MockProvider", () => {
  it("creates orders, signs and verifies like Razorpay", async () => {
    const m = new MockProvider();
    const o = await m.createOrder({ amountPaise: 67800, receipt: "ORD-1001" });
    expect(o).toMatchObject({ amountPaise: 67800, currency: "INR" });
    expect(o.id).toMatch(/^mock_order_/);
    const pay = newMockPaymentId();
    expect(pay).toMatch(/^mock_pay_/);
    expect(m.verifyPaymentSignature({ providerOrderId: o.id, paymentId: pay, signature: m.sign(o.id, pay) })).toBe(true);
    expect(m.verifyPaymentSignature({ providerOrderId: o.id, paymentId: pay, signature: m.sign(o.id, "x") })).toBe(false);
    expect(m.verifyWebhookSignature(WEBHOOK_BODY, hmacSha256Hex(MOCK_SECRET, WEBHOOK_BODY))).toBe(true);
    expect((await m.refund(pay, 100)).id).toMatch(/^mock_refund_/);
    expect(m.publicKey).toBeNull();
  });
});

describe("getPaymentProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetPaymentProviderCache();
  });

  it("defaults to mock outside production", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "");
    expect(getPaymentProvider()).toBeInstanceOf(MockProvider);
    expect(isMockPayments()).toBe(true);
  });

  it("refuses mock in production", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getPaymentProvider()).toThrow(/not allowed in production/);
    expect(isMockPayments()).toBe(false);
  });

  it("builds Razorpay from env and requires every key", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "razorpay");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    expect(() => getPaymentProvider()).toThrow(/RAZORPAY_WEBHOOK_SECRET/);
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whsec");
    const p = getPaymentProvider();
    expect(p).toBeInstanceOf(RazorpayProvider);
    expect(p.publicKey).toBe("rzp_test_key");
    expect(getPaymentProvider()).toBe(p);
  });

  it("rejects unknown provider names", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "paypal");
    expect(() => getPaymentProvider()).toThrow(/Unknown PAYMENT_PROVIDER/);
  });
});
```

Run: `npm test -- tests/unit/payments.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Implement**

Append to `src/server/errors.ts` (before `ErrorBody`):

```ts
export class PaymentError extends DomainError {
  constructor(message = "The payment could not be processed. Please try again.") {
    super("PAYMENT_ERROR", message, 502);
  }
}
```

Create `src/server/payments/types.ts`:

```ts
export type ProviderName = "razorpay" | "mock";

export interface ProviderOrder { id: string; amountPaise: number; currency: "INR" }

export interface PaymentProvider {
  readonly name: ProviderName;
  readonly publicKey: string | null;
  createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder>;
  verifyPaymentSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  refund(paymentId: string, amountPaise: number): Promise<{ id: string }>;
}
```

Create `src/server/payments/hmac.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyHmac(secret: string, payload: string, signature: string | null | undefined): boolean {
  if (!signature) return false;
  return safeEqual(hmacSha256Hex(secret, payload), signature.trim().toLowerCase());
}
```

Create `src/server/payments/razorpay.ts`:

```ts
import { PaymentError } from "@/server/errors";
import { verifyHmac } from "./hmac";
import type { PaymentProvider, ProviderOrder } from "./types";

const API = "https://api.razorpay.com/v1";
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  readonly publicKey: string;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {
    this.publicKey = keyId;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}${path}`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      console.error("[razorpay] network", path, err);
      throw new PaymentError("Could not reach the payment provider. Please try again.");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[razorpay] ${path} → ${res.status} ${text.slice(0, 500)}`);
      throw new PaymentError();
    }
    return (await res.json()) as T;
  }

  async createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder> {
    const r = await this.post<{ id: string; amount: number }>("/orders", {
      amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes ?? {},
    });
    return { id: r.id, amountPaise: r.amount, currency: "INR" };
  }

  verifyPaymentSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean {
    return verifyHmac(this.keySecret, `${input.providerOrderId}|${input.paymentId}`, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return verifyHmac(this.webhookSecret, rawBody, signature);
  }

  async refund(paymentId: string, amountPaise: number): Promise<{ id: string }> {
    const r = await this.post<{ id: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise });
    return { id: r.id };
  }
}
```

Create `src/server/payments/mock.ts`:

```ts
import { randomBytes } from "node:crypto";
import { hmacSha256Hex, verifyHmac } from "./hmac";
import type { PaymentProvider, ProviderOrder } from "./types";

/** Not a secret: the mock provider only runs outside production. */
export const MOCK_SECRET = "mock_payment_secret";

export function newMockPaymentId(): string {
  return `mock_pay_${randomBytes(9).toString("hex")}`;
}

export class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly publicKey = null;

  async createOrder(input: { amountPaise: number }): Promise<ProviderOrder> {
    return { id: `mock_order_${randomBytes(9).toString("hex")}`, amountPaise: input.amountPaise, currency: "INR" };
  }

  sign(providerOrderId: string, paymentId: string): string {
    return hmacSha256Hex(MOCK_SECRET, `${providerOrderId}|${paymentId}`);
  }

  verifyPaymentSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean {
    return verifyHmac(MOCK_SECRET, `${input.providerOrderId}|${input.paymentId}`, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return verifyHmac(MOCK_SECRET, rawBody, signature);
  }

  async refund(): Promise<{ id: string }> {
    return { id: `mock_refund_${randomBytes(6).toString("hex")}` };
  }
}
```

Create `src/server/payments/index.ts`:

```ts
import { MockProvider } from "./mock";
import { RazorpayProvider } from "./razorpay";
import type { PaymentProvider, ProviderName } from "./types";

export type { PaymentProvider, ProviderName, ProviderOrder } from "./types";

let cached: PaymentProvider | undefined;

export function paymentProviderName(): ProviderName {
  const v = (process.env.PAYMENT_PROVIDER || "mock").trim().toLowerCase();
  if (v !== "razorpay" && v !== "mock") throw new Error(`Unknown PAYMENT_PROVIDER "${v}" (use razorpay or mock)`);
  return v;
}

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const name = paymentProviderName();
  if (name === "mock") {
    if (process.env.NODE_ENV === "production") throw new Error("PAYMENT_PROVIDER=mock is not allowed in production");
    cached = new MockProvider();
    return cached;
  }
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const webhook = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!keyId || !secret || !webhook) {
    throw new Error("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required when PAYMENT_PROVIDER=razorpay");
  }
  cached = new RazorpayProvider(keyId, secret, webhook);
  return cached;
}

export function isMockPayments(): boolean {
  try {
    return paymentProviderName() === "mock" && process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

export function resetPaymentProviderCache(): void {
  cached = undefined;
}
```

Never call `getPaymentProvider()` at module load: pages that use it are dynamic (they read the session), so `next build` never touches it.

Append to `.env.example`:

```bash
# Payments: mock (dev/e2e, refused in production) | razorpay
PAYMENT_PROVIDER="mock"
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""
```

Append to `.env.test`:

```bash
PAYMENT_PROVIDER="mock"
```

- [ ] **Step 3: Verify and commit**

Run the test file (GREEN), then the full gate.

```bash
git add src/server/errors.ts src/server/payments .env.example .env.test tests/unit/payments.test.ts
git commit -m "feat(payments): add Razorpay and mock payment providers with HMAC verification

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 5: Order service — place with reservation, mark paid, expire, cancel/restock, events, order numbers

**Files:**
- Create: `src/server/services/order-records.ts`, `src/server/services/orders.ts`
- Modify: `src/server/errors.ts` (add `StockIssue`, `StockChangedError`)
- Test: `tests/unit/orders.test.ts`

**Interfaces:**
- Consumes: schema and `order_number_seq` (Task 1), `ORDER_STATUS_LABEL`, `isPaidStatus`, `canCancel`, `OrderEventType` (Task 1), `quote` (Task 2), `PricingLine` (Task 2), `createAddress` (Task 3), `getPaymentProvider`, `PaymentError`, `MockProvider` (Task 4), `addItem` (cart), `formatPaise`, `Page`.
- Produces:

```ts
// @/server/errors (added)
export interface StockIssue { variantId: string; name: string; requested: number; available: number }
export class StockChangedError extends DomainError { readonly issues: StockIssue[] }   // code STOCK_CHANGED, 409, details { issues }
// @/server/services/order-records
export type Tx = Prisma.TransactionClient;
export interface ShipAddress { name: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string }
export interface OrderItemView { id: string; productId: string | null; productName: string; productSlug: string; size: string; colorName: string; imageUrl: string | null; sku: string; unitPricePaise: number; quantity: number; lineTotalPaise: number }
export interface OrderView {
  id: string; number: string; status: OrderStatus; userId: string; email: string; createdAt: Date; expiresAt: Date;
  paidAt: Date | null; processingAt: Date | null; shippedAt: Date | null; deliveredAt: Date | null; cancelledAt: Date | null; refundedAt: Date | null;
  subtotalPaise: number; discountPaise: number; shippingPaise: number; totalPaise: number; couponCode: string | null; offerLabel: string | null;
  paymentProvider: string; providerOrderId: string | null; providerPaymentId: string | null;
  carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; customerNote: string | null;
  ship: ShipAddress; items: OrderItemView[]; itemCount: number;
}
export interface OrderSummary { id: string; number: string; status: OrderStatus; createdAt: Date; paidAt: Date | null; totalPaise: number; itemCount: number; firstItemName: string; firstImageUrl: string | null }
export const orderWithItems: Prisma.OrderInclude;  export type OrderRow;
export function toOrderView(o: OrderRow): OrderView;
export function toOrderSummary(o: OrderRow): OrderSummary;
export function orderDiscountLabel(o: { couponCode: string | null; offerLabel: string | null }): string | null;  // "Code X" | "Offer: Y" | null
export function addOrderEvent(tx: Tx, orderId: string, type: OrderEventType, message: string, actorId?: string | null): Promise<void>;
export function getOrderById(id: string): Promise<OrderView>;                    // NotFoundError
// @/server/services/orders
export const ORDER_TTL_MS = 1_800_000; export const MIN_ORDER_PAISE = 100;
export const placeOrderSchema; export type PlaceOrderInput = z.input<typeof placeOrderSchema>;   // { addressId, couponCode?, customerNote? }
export interface CheckoutPayload { orderId: string; number: string; amountPaise: number; currency: "INR"; provider: ProviderName; providerOrderId: string; keyId: string | null; prefill: { name: string; email: string; contact: string } }
export type CheckoutLineRow;                                                      // cart item + variant + product (images, collections)
export function loadCheckoutLines(userId: string): Promise<CheckoutLineRow[]>;
export function unitPriceOf(l: CheckoutLineRow): number;
export function lineName(l: CheckoutLineRow): string;                             // "Tee (Black / M)"
export function toPricingLines(rows: CheckoutLineRow[]): PricingLine[];
export function reconcileCartStock(rows: CheckoutLineRow[]): Promise<{ rows: CheckoutLineRow[]; issues: StockIssue[] }>;  // adjusts cart
export function placeOrder(userId: string, input: unknown): Promise<CheckoutPayload>;
export type PaymentSource = "client" | "webhook" | "mock";
export type MarkPaidOutcome = "paid" | "already_paid" | "attention" | "amount_mismatch";
export function markOrderPaid(orderId: string, paymentId: string, source: PaymentSource, opts?: { amountPaise?: number }): Promise<{ outcome: MarkPaidOutcome; number: string }>;
export function recordPaymentFailure(orderId: string, reason: string): Promise<void>;
export function expireStaleOrders(now?: Date): Promise<number>;
export function cancelOrder(orderId: string, opts?: { actorId?: string | null; reason?: string }): Promise<void>;
export function releaseOrder(orderId: string, from: OrderStatus[], to: "CANCELLED" | "EXPIRED", eventType: OrderEventType, message: string, actorId?: string | null): Promise<boolean>;
export function findOrderByProviderOrderId(providerOrderId: string): Promise<{ id: string; userId: string; number: string; status: OrderStatus; totalPaise: number } | null>;
export function getOrderForUser(userId: string, number: string): Promise<OrderView>;      // NotFoundError for other users
export function listOrdersForUser(userId: string, opts?: { page?: number; pageSize?: number }): Promise<Page<OrderSummary>>;
export function getRetryPayload(userId: string, number: string): Promise<CheckoutPayload>; // ConflictError when no longer payable
```

Behaviour rules:
- `placeOrder`: validate → opportunistically `expireStaleOrders()` (errors logged, never thrown) → address must belong to the user (`ValidationError({ addressId })`) → cart must be non-empty (`ValidationError({ cart })`) → `reconcileCartStock` adjusts short lines (quantity down to stock, or removes the line) and throws `StockChangedError` if anything changed → server-side `quote()` → an entered coupon that is invalid throws `ValidationError({ couponCode: [couponError] })` → total below ₹1 throws `ValidationError({ couponCode: ["Order total must be at least ₹1"] })` → **one transaction**: conditional `stock >= qty` decrement per line (any miss throws `StockChangedError` and rolls back), `nextval('order_number_seq')`, order + items + `CREATED` event → provider `createOrder` outside the transaction; on failure `releaseOrder(…, "CANCELLED", "PAYMENT_FAILED", …)` and throw `PaymentError` → save `providerOrderId`. `couponCode` is stored only when the coupon was applied; `offerLabel` only when the offer was applied. The cart is **not** cleared here (it is cleared on payment).
- `markOrderPaid` is idempotent. Already paid/refunded → `already_paid`. If `amountPaise` is given and differs from `totalPaise` → `needsAttention` + `ATTENTION` event, status unchanged, `amount_mismatch`. `PENDING_PAYMENT` → `PAID` with a conditional update (a lost race re-evaluates). `EXPIRED` → try to re-reserve every line in one transaction; success → `PAID`; any shortfall → `PAID` with `needsAttention` and an `ATTENTION` event (`attention`). `CANCELLED` → keep the status, store the payment id, flag attention ("refund it"). After a successful paid transition: remove the order's variants from the user's cart, reset `Cart.remindedAt`, then (Task 6) notify.
- `releaseOrder` is the only place that restocks: conditional status update from `from` → `to`, increment stock for every item whose `variantId` still exists, one event; returns `false` if the status had already moved.
- `expireStaleOrders(now)`: up to 200 `PENDING_PAYMENT` orders with `expiresAt < now`, each via `releaseOrder(…, "EXPIRED", "EXPIRED", …)`; returns how many it expired.
- `cancelOrder`: only `PENDING_PAYMENT | PAID | PROCESSING` (`ConflictError` otherwise); restocks; event `STATUS_CHANGED` with the reason; (Task 6) notifies. It does not refund; refunds are a separate admin action (Task 9).

- [ ] **Step 1: Failing tests**

Create `tests/unit/orders.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { MockProvider } from "@/server/payments/mock";
import { ConflictError, NotFoundError, PaymentError, StockChangedError, ValidationError } from "@/server/errors";
import {
  cancelOrder, expireStaleOrders, getOrderForUser, getRetryPayload, listOrdersForUser, markOrderPaid, ORDER_TTL_MS, placeOrder,
} from "@/server/services/orders";

const ADDRESS = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };

async function buyer(opts: { stock?: number; qty?: number; price?: number } = {}) {
  const user = await createUser();
  const product = await createProduct({ basePricePaise: opts.price ?? 59900, variants: [{ size: "M", colorName: "Black", stock: opts.stock ?? 5 }] });
  const variant = product.variants[0];
  const address = await createAddress(user.id, ADDRESS);
  await addItem({ userId: user.id }, variant.id, opts.qty ?? 1);
  return { user, product, variant, address };
}
const stockOf = async (id: string) => (await db.productVariant.findUniqueOrThrow({ where: { id } })).stock;
const later = () => new Date(Date.now() + ORDER_TTL_MS + 1000);

describe("placeOrder", () => {
  beforeEach(resetDb);

  it("reserves stock, snapshots items and prices, and numbers orders from ORD-1001", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const payload = await placeOrder(user.id, { addressId: address.id, customerNote: " Gift wrap please " });
    expect(payload).toMatchObject({ number: "ORD-1001", amountPaise: 119800, currency: "INR", provider: "mock", keyId: null, prefill: { name: "Asha Rao", contact: "9876543210", email: user.email } });
    expect(payload.providerOrderId).toMatch(/^mock_order_/);
    expect(await stockOf(variant.id)).toBe(3);
    const order = await db.order.findUniqueOrThrow({ where: { id: payload.orderId }, include: { items: true, events: true } });
    expect(order).toMatchObject({ status: "PENDING_PAYMENT", subtotalPaise: 119800, shippingPaise: 0, totalPaise: 119800, shipCity: "Bengaluru", customerNote: "Gift wrap please", providerOrderId: payload.providerOrderId, paymentProvider: "mock" });
    expect(order.items[0]).toMatchObject({ variantId: variant.id, sku: variant.sku, size: "M", colorName: "Black", unitPricePaise: 59900, quantity: 2, lineTotalPaise: 119800 });
    expect(order.events.map((e) => e.type)).toEqual(["CREATED"]);
    expect(order.expiresAt.getTime() - order.createdAt.getTime()).toBeGreaterThanOrEqual(ORDER_TTL_MS - 5000);
    expect(await db.cartItem.count({ where: { cart: { userId: user.id } } })).toBe(1);
    const second = await buyer();
    expect((await placeOrder(second.user.id, { addressId: second.address.id })).number).toBe("ORD-1002");
  });

  it("adds shipping below the threshold and applies a coupon", async () => {
    const { user, address } = await buyer();
    await db.coupon.create({ data: { code: "TENOFF", type: "FLAT", value: 1000 } });
    const p = await placeOrder(user.id, { addressId: address.id, couponCode: "tenoff" });
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId } });
    expect(o).toMatchObject({ subtotalPaise: 59900, discountPaise: 1000, shippingPaise: 7900, totalPaise: 66800, couponCode: "TENOFF", offerLabel: null });
  });

  it("rejects bad coupons, foreign addresses and empty bags without creating orders", async () => {
    const { user, address } = await buyer();
    const bad = await placeOrder(user.id, { addressId: address.id, couponCode: "NOPE" }).catch((e) => e);
    expect(bad).toBeInstanceOf(ValidationError);
    expect(bad.details.couponCode).toEqual(["This code is not valid"]);
    const other = await buyer();
    await expect(placeOrder(user.id, { addressId: other.address.id })).rejects.toBeInstanceOf(ValidationError);
    const lonely = await createUser();
    const addr = await createAddress(lonely.id, ADDRESS);
    await expect(placeOrder(lonely.id, { addressId: addr.id })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.order.count()).toBe(0);
  });

  it("adjusts the bag and refuses when stock ran short", async () => {
    const { user, variant, address } = await buyer({ qty: 3 });
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 1 } });
    const err = await placeOrder(user.id, { addressId: address.id }).catch((e) => e);
    expect(err).toBeInstanceOf(StockChangedError);
    expect(err.issues).toEqual([expect.objectContaining({ variantId: variant.id, requested: 3, available: 1 })]);
    expect((await db.cartItem.findFirstOrThrow({ where: { variantId: variant.id } })).quantity).toBe(1);
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 0 } });
    await expect(placeOrder(user.id, { addressId: address.id })).rejects.toBeInstanceOf(StockChangedError);
    expect(await db.cartItem.count()).toBe(0);
    expect(await db.order.count()).toBe(0);
  });

  it("cancels the order and releases stock when the provider fails", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const spy = vi.spyOn(MockProvider.prototype, "createOrder").mockRejectedValueOnce(new Error("provider down"));
    await expect(placeOrder(user.id, { addressId: address.id })).rejects.toBeInstanceOf(PaymentError);
    spy.mockRestore();
    const o = await db.order.findFirstOrThrow({ include: { events: true } });
    expect(o.status).toBe("CANCELLED");
    expect(o.events.map((e) => e.type)).toContain("PAYMENT_FAILED");
    expect(await stockOf(variant.id)).toBe(5);
  });
});

describe("markOrderPaid", () => {
  beforeEach(resetDb);

  it("marks paid once, clears only the ordered items from the bag, and is idempotent", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const extra = await createProduct({ variants: [{ size: "L", colorName: "White", stock: 5 }] });
    const p = await placeOrder(user.id, { addressId: address.id });
    await addItem({ userId: user.id }, extra.variants[0].id, 1);
    expect(await markOrderPaid(p.orderId, "pay_1", "client")).toEqual({ outcome: "paid", number: "ORD-1001" });
    expect(await markOrderPaid(p.orderId, "pay_1", "webhook")).toEqual({ outcome: "already_paid", number: "ORD-1001" });
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "PAID", providerPaymentId: "pay_1", needsAttention: false });
    expect(o.paidAt).not.toBeNull();
    expect(o.events.filter((e) => e.type === "PAID")).toHaveLength(1);
    const cart = await db.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(cart.map((c) => c.variantId)).toEqual([extra.variants[0].id]);
    expect(await stockOf(variant.id)).toBe(3);
  });

  it("flags an amount mismatch without marking paid", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    expect((await markOrderPaid(p.orderId, "pay_x", "webhook", { amountPaise: 100 })).outcome).toBe("amount_mismatch");
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "PENDING_PAYMENT", needsAttention: true });
    expect(o.events.map((e) => e.type)).toContain("ATTENTION");
  });

  it("re-reserves stock when payment lands after expiry", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    expect(await expireStaleOrders(later())).toBe(1);
    expect(await stockOf(variant.id)).toBe(5);
    expect((await markOrderPaid(p.orderId, "pay_late", "webhook")).outcome).toBe("paid");
    expect(await stockOf(variant.id)).toBe(3);
    expect(await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).toMatchObject({ status: "PAID", needsAttention: false });
  });

  it("marks a late payment paid but needing attention when stock is gone", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    await expireStaleOrders(later());
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 1 } });
    expect((await markOrderPaid(p.orderId, "pay_late", "webhook")).outcome).toBe("attention");
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "PAID", needsAttention: true });
    expect(o.events.map((e) => e.type)).toEqual(expect.arrayContaining(["PAID", "ATTENTION"]));
    expect(await stockOf(variant.id)).toBe(1);
  });

  it("flags money received for a cancelled order", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    await cancelOrder(p.orderId, { reason: "test" });
    expect((await markOrderPaid(p.orderId, "pay_c", "webhook")).outcome).toBe("attention");
    expect(await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).toMatchObject({ status: "CANCELLED", needsAttention: true, providerPaymentId: "pay_c" });
  });
});

describe("expiry and cancel", () => {
  beforeEach(resetDb);

  it("expires only past-due pending orders, once", async () => {
    const a = await buyer({ qty: 2 });
    const pa = await placeOrder(a.user.id, { addressId: a.address.id });
    const b = await buyer();
    const pb = await placeOrder(b.user.id, { addressId: b.address.id });
    await db.order.update({ where: { id: pb.orderId }, data: { expiresAt: new Date(Date.now() + 3_600_000) } });
    expect(await expireStaleOrders(later())).toBe(1);
    expect(await expireStaleOrders(later())).toBe(0);
    const oa = await db.order.findUniqueOrThrow({ where: { id: pa.orderId }, include: { events: true } });
    expect(oa.status).toBe("EXPIRED");
    expect(oa.events.map((e) => e.type)).toContain("EXPIRED");
    expect(await stockOf(a.variant.id)).toBe(5);
    expect((await db.order.findUniqueOrThrow({ where: { id: pb.orderId } })).status).toBe("PENDING_PAYMENT");
  });

  it("cancels with restock before shipping, and refuses after", async () => {
    const { user, variant, address } = await buyer({ qty: 2 });
    const p = await placeOrder(user.id, { addressId: address.id });
    await markOrderPaid(p.orderId, "pay_1", "client");
    await cancelOrder(p.orderId, { actorId: null, reason: "Customer asked" });
    expect(await stockOf(variant.id)).toBe(5);
    const o = await db.order.findUniqueOrThrow({ where: { id: p.orderId } });
    expect(o.status).toBe("CANCELLED");
    expect(o.cancelledAt).not.toBeNull();
    await expect(cancelOrder(p.orderId)).rejects.toBeInstanceOf(ConflictError);
    const q = await buyer();
    const pq = await placeOrder(q.user.id, { addressId: q.address.id });
    await db.order.update({ where: { id: pq.orderId }, data: { status: "SHIPPED" } });
    await expect(cancelOrder(pq.orderId)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("customer reads and retry", () => {
  beforeEach(resetDb);

  it("lists and reads only the owner's orders", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    const page = await listOrdersForUser(user.id);
    expect(page).toMatchObject({ total: 1, hasMore: false });
    expect(page.items[0]).toMatchObject({ number: p.number, itemCount: 1, totalPaise: 67800 });
    const view = await getOrderForUser(user.id, p.number);
    expect(view.ship).toMatchObject({ name: "Asha Rao", city: "Bengaluru", pincode: "560001" });
    const stranger = await createUser();
    await expect(getOrderForUser(stranger.id, p.number)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns a retry payload only while the order is payable", async () => {
    const { user, address } = await buyer();
    const p = await placeOrder(user.id, { addressId: address.id });
    expect(await getRetryPayload(user.id, p.number)).toMatchObject({ orderId: p.orderId, providerOrderId: p.providerOrderId, amountPaise: 67800 });
    await markOrderPaid(p.orderId, "pay_1", "client");
    await expect(getRetryPayload(user.id, p.number)).rejects.toBeInstanceOf(ConflictError);
  });
});
```

Run: `npm test -- tests/unit/orders.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Errors**

Append to `src/server/errors.ts` (before `ErrorBody`):

```ts
export interface StockIssue { variantId: string; name: string; requested: number; available: number }

export class StockChangedError extends DomainError {
  constructor(public readonly issues: StockIssue[]) {
    super("STOCK_CHANGED", "Some items just sold out or ran low, so we updated your bag. Please review it and try again.", 409, { issues });
  }
}
```

- [ ] **Step 3: Order records**

Create `src/server/services/order-records.ts`:

```ts
import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import type { OrderEventType } from "@/lib/order-status";

export type Tx = Prisma.TransactionClient;

export interface ShipAddress { name: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string }
export interface OrderItemView {
  id: string; productId: string | null; productName: string; productSlug: string; size: string; colorName: string;
  imageUrl: string | null; sku: string; unitPricePaise: number; quantity: number; lineTotalPaise: number;
}
export interface OrderView {
  id: string; number: string; status: OrderStatus; userId: string; email: string; createdAt: Date; expiresAt: Date;
  paidAt: Date | null; processingAt: Date | null; shippedAt: Date | null; deliveredAt: Date | null; cancelledAt: Date | null; refundedAt: Date | null;
  subtotalPaise: number; discountPaise: number; shippingPaise: number; totalPaise: number;
  couponCode: string | null; offerLabel: string | null;
  paymentProvider: string; providerOrderId: string | null; providerPaymentId: string | null;
  carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; customerNote: string | null;
  ship: ShipAddress; items: OrderItemView[]; itemCount: number;
}
export interface OrderSummary {
  id: string; number: string; status: OrderStatus; createdAt: Date; paidAt: Date | null; totalPaise: number;
  itemCount: number; firstItemName: string; firstImageUrl: string | null;
}

export const orderWithItems = { items: { orderBy: { id: "asc" as const } } } satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderWithItems }>;

export function toOrderView(o: OrderRow): OrderView {
  return {
    id: o.id, number: o.number, status: o.status, userId: o.userId, email: o.email, createdAt: o.createdAt, expiresAt: o.expiresAt,
    paidAt: o.paidAt, processingAt: o.processingAt, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt, cancelledAt: o.cancelledAt, refundedAt: o.refundedAt,
    subtotalPaise: o.subtotalPaise, discountPaise: o.discountPaise, shippingPaise: o.shippingPaise, totalPaise: o.totalPaise,
    couponCode: o.couponCode, offerLabel: o.offerLabel,
    paymentProvider: o.paymentProvider, providerOrderId: o.providerOrderId, providerPaymentId: o.providerPaymentId,
    carrier: o.carrier, trackingNumber: o.trackingNumber, trackingUrl: o.trackingUrl, customerNote: o.customerNote,
    ship: { name: o.shipName, phone: o.shipPhone, line1: o.shipLine1, line2: o.shipLine2, landmark: o.shipLandmark, city: o.shipCity, state: o.shipState, pincode: o.shipPincode },
    items: o.items.map((i) => ({
      id: i.id, productId: i.productId, productName: i.productName, productSlug: i.productSlug, size: i.size, colorName: i.colorName,
      imageUrl: i.imageUrl, sku: i.sku, unitPricePaise: i.unitPricePaise, quantity: i.quantity, lineTotalPaise: i.lineTotalPaise,
    })),
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
  };
}

export function toOrderSummary(o: OrderRow): OrderSummary {
  return {
    id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, paidAt: o.paidAt, totalPaise: o.totalPaise,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    firstItemName: o.items[0]?.productName ?? "",
    firstImageUrl: o.items.find((i) => i.imageUrl)?.imageUrl ?? null,
  };
}

export function orderDiscountLabel(o: { couponCode: string | null; offerLabel: string | null }): string | null {
  if (o.couponCode) return `Code ${o.couponCode}`;
  if (o.offerLabel) return `Offer: ${o.offerLabel}`;
  return null;
}

export async function addOrderEvent(tx: Tx, orderId: string, type: OrderEventType, message: string, actorId?: string | null): Promise<void> {
  await tx.orderEvent.create({ data: { orderId, type, message: message.slice(0, 1000), actorId: actorId ?? null } });
}

export async function getOrderById(id: string): Promise<OrderView> {
  const o = await db.order.findUnique({ where: { id }, include: orderWithItems });
  if (!o) throw new NotFoundError("Order");
  return toOrderView(o);
}
```

- [ ] **Step 4: Order service**

Create `src/server/services/orders.ts`:

```ts
import type { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, PaymentError, StockChangedError, ValidationError, type StockIssue } from "@/server/errors";
import { getPaymentProvider, type ProviderName } from "@/server/payments";
import { quote } from "@/server/services/promotions";
import { addOrderEvent, orderWithItems, toOrderSummary, toOrderView, type OrderSummary, type OrderView, type Tx } from "@/server/services/order-records";
import type { Page } from "@/server/services/catalog";
import { canCancel, isPaidStatus, ORDER_STATUS_LABEL, type OrderEventType } from "@/lib/order-status";
import { formatPaise } from "@/lib/money";
import type { PricingLine } from "@/lib/pricing";

export const ORDER_TTL_MS = 30 * 60 * 1000;
export const MIN_ORDER_PAISE = 100;

export const placeOrderSchema = z.object({
  addressId: z.string().min(1, "Choose a delivery address"),
  couponCode: z.string().trim().max(40).nullish(),
  customerNote: z.string().trim().max(300, "Keep the note under 300 characters").nullish(),
});
export type PlaceOrderInput = z.input<typeof placeOrderSchema>;

export interface CheckoutPayload {
  orderId: string; number: string; amountPaise: number; currency: "INR"; provider: ProviderName;
  providerOrderId: string; keyId: string | null; prefill: { name: string; email: string; contact: string };
}

const checkoutLineInclude = {
  variant: {
    include: {
      product: { include: { images: { orderBy: { sortOrder: "asc" as const } }, collections: { select: { collectionId: true } } } },
    },
  },
} satisfies Prisma.CartItemInclude;
export type CheckoutLineRow = Prisma.CartItemGetPayload<{ include: typeof checkoutLineInclude }>;

export async function loadCheckoutLines(userId: string): Promise<CheckoutLineRow[]> {
  return db.cartItem.findMany({ where: { cart: { userId } }, orderBy: { createdAt: "asc" }, include: checkoutLineInclude });
}

export function unitPriceOf(l: CheckoutLineRow): number {
  return l.variant.pricePaise ?? l.variant.product.basePricePaise;
}

export function lineName(l: CheckoutLineRow): string {
  return `${l.variant.product.name} (${l.variant.colorName} / ${l.variant.size})`;
}

export function toPricingLines(rows: CheckoutLineRow[]): PricingLine[] {
  return rows.map((l) => ({ unitPricePaise: unitPriceOf(l), quantity: l.quantity, collectionIds: l.variant.product.collections.map((c) => c.collectionId) }));
}

export async function reconcileCartStock(rows: CheckoutLineRow[]): Promise<{ rows: CheckoutLineRow[]; issues: StockIssue[] }> {
  const kept: CheckoutLineRow[] = [];
  const issues: StockIssue[] = [];
  for (const l of rows) {
    const available = l.variant.product.status === "ACTIVE" ? Math.max(0, l.variant.stock) : 0;
    if (l.quantity <= available) {
      kept.push(l);
      continue;
    }
    issues.push({ variantId: l.variantId, name: lineName(l), requested: l.quantity, available });
    if (available === 0) {
      await db.cartItem.delete({ where: { id: l.id } });
    } else {
      await db.cartItem.update({ where: { id: l.id }, data: { quantity: available } });
      kept.push({ ...l, quantity: available });
    }
  }
  return { rows: kept, issues };
}

async function nextOrderNumber(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
  return `ORD-${rows[0].n.toString()}`;
}

function snapshot(l: CheckoutLineRow) {
  const p = l.variant.product;
  const unit = unitPriceOf(l);
  const image = p.images.find((i) => i.colorName === l.variant.colorName) ?? p.images[0];
  return {
    productId: p.id, variantId: l.variantId, productName: p.name, productSlug: p.slug, size: l.variant.size,
    colorName: l.variant.colorName, imageUrl: image?.url ?? null, sku: l.variant.sku,
    unitPricePaise: unit, quantity: l.quantity, lineTotalPaise: unit * l.quantity,
  };
}

export async function placeOrder(userId: string, input: unknown): Promise<CheckoutPayload> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodFieldErrors(parsed.error));
  const { addressId, couponCode, customerNote } = parsed.data;

  await expireStaleOrders().catch((err) => console.error("[orders] opportunistic expiry failed", err));

  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new NotFoundError("User");
  const address = await db.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new ValidationError({ addressId: ["Choose a delivery address"] });

  const loaded = await loadCheckoutLines(userId);
  if (loaded.length === 0) throw new ValidationError({ cart: ["Your bag is empty"] });
  const { rows, issues } = await reconcileCartStock(loaded);
  if (issues.length) throw new StockChangedError(issues);

  const now = new Date();
  const price = await quote({ lines: toPricingLines(rows), couponCode, userId, now });
  if (couponCode?.trim() && price.couponError) throw new ValidationError({ couponCode: [price.couponError] });
  if (price.totalPaise < MIN_ORDER_PAISE) throw new ValidationError({ couponCode: ["Order total must be at least ₹1"] });

  const provider = getPaymentProvider();

  const order = await db.$transaction(async (tx) => {
    for (const l of rows) {
      const r = await tx.productVariant.updateMany({ where: { id: l.variantId, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
      if (r.count !== 1) {
        const fresh = await tx.productVariant.findUnique({ where: { id: l.variantId }, select: { stock: true } });
        throw new StockChangedError([{ variantId: l.variantId, name: lineName(l), requested: l.quantity, available: fresh?.stock ?? 0 }]);
      }
    }
    const number = await nextOrderNumber(tx);
    return tx.order.create({
      data: {
        number, userId, email: user.email, status: "PENDING_PAYMENT",
        shipName: address.fullName, shipPhone: address.phone, shipLine1: address.line1, shipLine2: address.line2,
        shipLandmark: address.landmark, shipCity: address.city, shipState: address.state, shipPincode: address.pincode,
        subtotalPaise: price.subtotalPaise, discountPaise: price.discountPaise, shippingPaise: price.shippingPaise, totalPaise: price.totalPaise,
        couponCode: price.applied === "coupon" && price.coupon ? price.coupon.code : null,
        offerLabel: price.applied === "offer" && price.offer ? price.offer.label : null,
        paymentProvider: provider.name,
        customerNote: customerNote?.trim() || null,
        expiresAt: new Date(now.getTime() + ORDER_TTL_MS),
        items: { create: rows.map(snapshot) },
        events: { create: { type: "CREATED", message: `Order placed for ${formatPaise(price.totalPaise)}` } },
      },
    });
  });

  let providerOrderId: string;
  try {
    providerOrderId = (await provider.createOrder({ amountPaise: order.totalPaise, receipt: order.number, notes: { orderId: order.id, number: order.number } })).id;
  } catch (err) {
    console.error("[orders] provider createOrder failed", order.number, err);
    await releaseOrder(order.id, ["PENDING_PAYMENT"], "CANCELLED", "PAYMENT_FAILED", "Could not start the payment; order cancelled and stock released");
    throw err instanceof PaymentError ? err : new PaymentError("Could not start the payment. Please try again.");
  }
  await db.order.update({ where: { id: order.id }, data: { providerOrderId } });

  return {
    orderId: order.id, number: order.number, amountPaise: order.totalPaise, currency: "INR", provider: provider.name,
    providerOrderId, keyId: provider.publicKey, prefill: { name: address.fullName, email: user.email, contact: address.phone },
  };
}

export async function releaseOrder(
  orderId: string, from: OrderStatus[], to: "CANCELLED" | "EXPIRED", eventType: OrderEventType, message: string, actorId?: string | null,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const r = await tx.order.updateMany({ where: { id: orderId, status: { in: from } }, data: { status: to, ...(to === "CANCELLED" ? { cancelledAt: new Date() } : {}) } });
    if (r.count !== 1) return false;
    const items = await tx.orderItem.findMany({ where: { orderId, variantId: { not: null } }, select: { variantId: true, quantity: true } });
    for (const it of items) {
      await tx.productVariant.updateMany({ where: { id: it.variantId! }, data: { stock: { increment: it.quantity } } });
    }
    await addOrderEvent(tx, orderId, eventType, message, actorId);
    return true;
  });
}

export async function expireStaleOrders(now: Date = new Date()): Promise<number> {
  const due = await db.order.findMany({ where: { status: "PENDING_PAYMENT", expiresAt: { lt: now } }, select: { id: true }, orderBy: { expiresAt: "asc" }, take: 200 });
  let expired = 0;
  for (const o of due) {
    if (await releaseOrder(o.id, ["PENDING_PAYMENT"], "EXPIRED", "EXPIRED", "Payment not received within 30 minutes; stock released")) expired++;
  }
  return expired;
}

export async function cancelOrder(orderId: string, opts: { actorId?: string | null; reason?: string } = {}): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) throw new NotFoundError("Order");
  if (!canCancel(order.status)) throw new ConflictError(`A ${ORDER_STATUS_LABEL[order.status].toLowerCase()} order cannot be cancelled`);
  const reason = opts.reason?.trim();
  const ok = await releaseOrder(orderId, ["PENDING_PAYMENT", "PAID", "PROCESSING"], "CANCELLED", "STATUS_CHANGED", `Cancelled${reason ? `: ${reason}` : ""}; stock restocked`, opts.actorId);
  if (!ok) throw new ConflictError("This order just changed. Reload and try again.");
  // Task 6 adds: await notifyOrder(orderId, "cancelled");
}

class ReReserveFailed extends Error {}

async function flagAttention(orderId: string, message: string, extra: { providerPaymentId?: string } = {}): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { needsAttention: true, ...extra } });
    await addOrderEvent(tx, orderId, "ATTENTION", message);
  });
}

async function afterPaid(orderId: string, userId: string, items: { variantId: string | null }[]): Promise<void> {
  const variantIds = items.map((i) => i.variantId).filter((v): v is string => v !== null);
  try {
    await db.cartItem.deleteMany({ where: { cart: { userId }, variantId: { in: variantIds } } });
    await db.cart.updateMany({ where: { userId }, data: { remindedAt: null } });
  } catch (err) {
    console.error("[orders] cart cleanup failed", orderId, err);
  }
  // Task 6 adds: await notifyOrder(orderId, "paid");
}

export type PaymentSource = "client" | "webhook" | "mock";
export type MarkPaidOutcome = "paid" | "already_paid" | "attention" | "amount_mismatch";

export async function markOrderPaid(
  orderId: string, paymentId: string, source: PaymentSource, opts: { amountPaise?: number } = {},
): Promise<{ outcome: MarkPaidOutcome; number: string }> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new NotFoundError("Order");
  const number = order.number;
  if (isPaidStatus(order.status) || order.status === "REFUNDED") return { outcome: "already_paid", number };

  if (opts.amountPaise !== undefined && opts.amountPaise !== order.totalPaise) {
    await flagAttention(order.id, `Payment ${paymentId} was for ${formatPaise(opts.amountPaise)} but the order total is ${formatPaise(order.totalPaise)}. Check it in the payment dashboard.`);
    return { outcome: "amount_mismatch", number };
  }

  const paid = { status: "PAID" as const, paidAt: new Date(), providerPaymentId: paymentId };

  if (order.status === "PENDING_PAYMENT") {
    const won = await db.$transaction(async (tx) => {
      const u = await tx.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT" }, data: paid });
      if (u.count !== 1) return false;
      await addOrderEvent(tx, order.id, "PAID", `Payment ${paymentId} received (${source})`);
      return true;
    });
    if (!won) return markOrderPaid(orderId, paymentId, source, opts);
    await afterPaid(order.id, order.userId, order.items);
    return { outcome: "paid", number };
  }

  if (order.status === "EXPIRED") {
    const result = await db
      .$transaction(async (tx) => {
        const u = await tx.order.updateMany({ where: { id: order.id, status: "EXPIRED" }, data: paid });
        if (u.count !== 1) return "changed" as const;
        for (const it of order.items) {
          if (!it.variantId) throw new ReReserveFailed();
          const r = await tx.productVariant.updateMany({ where: { id: it.variantId, stock: { gte: it.quantity } }, data: { stock: { decrement: it.quantity } } });
          if (r.count !== 1) throw new ReReserveFailed();
        }
        await addOrderEvent(tx, order.id, "PAID", `Payment ${paymentId} received after the order expired (${source}); stock re-reserved`);
        return "reserved" as const;
      })
      .catch((err: unknown) => {
        if (err instanceof ReReserveFailed) return "short" as const;
        throw err;
      });
    if (result === "changed") return markOrderPaid(orderId, paymentId, source, opts);
    if (result === "short") {
      const won = await db.$transaction(async (tx) => {
        const u = await tx.order.updateMany({ where: { id: order.id, status: "EXPIRED" }, data: { ...paid, needsAttention: true } });
        if (u.count !== 1) return false;
        await addOrderEvent(tx, order.id, "PAID", `Payment ${paymentId} received after the order expired (${source})`);
        await addOrderEvent(tx, order.id, "ATTENTION", "Paid after expiry but some items are no longer in stock. Restock them, or cancel and refund.");
        return true;
      });
      if (!won) return markOrderPaid(orderId, paymentId, source, opts);
      await afterPaid(order.id, order.userId, order.items);
      return { outcome: "attention", number };
    }
    await afterPaid(order.id, order.userId, order.items);
    return { outcome: "paid", number };
  }

  // CANCELLED: money arrived for an order that no longer holds stock. Record it once; the admin refunds.
  if (!(order.needsAttention && order.providerPaymentId === paymentId)) {
    await flagAttention(order.id, `Payment ${paymentId} arrived for a ${ORDER_STATUS_LABEL[order.status].toLowerCase()} order. Refund it from the order page.`, { providerPaymentId: paymentId });
  }
  return { outcome: "attention", number };
}

export async function recordPaymentFailure(orderId: string, reason: string): Promise<void> {
  await addOrderEvent(db, orderId, "PAYMENT_FAILED", reason.slice(0, 300));
}

export async function findOrderByProviderOrderId(providerOrderId: string) {
  return db.order.findUnique({ where: { providerOrderId }, select: { id: true, userId: true, number: true, status: true, totalPaise: true } });
}

export async function getOrderForUser(userId: string, number: string): Promise<OrderView> {
  const o = await db.order.findFirst({ where: { number, userId }, include: orderWithItems });
  if (!o) throw new NotFoundError("Order");
  return toOrderView(o);
}

export async function listOrdersForUser(userId: string, opts: { page?: number; pageSize?: number } = {}): Promise<Page<OrderSummary>> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 10, 1), 50);
  const page = Math.max(opts.page ?? 1, 1);
  const where = { userId };
  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: orderWithItems }),
  ]);
  return { items: rows.map(toOrderSummary), total, page, pageSize, hasMore: page * pageSize < total };
}

export async function getRetryPayload(userId: string, number: string): Promise<CheckoutPayload> {
  const o = await db.order.findFirst({ where: { number, userId } });
  if (!o) throw new NotFoundError("Order");
  const provider = getPaymentProvider();
  if (o.status !== "PENDING_PAYMENT" || o.expiresAt <= new Date() || !o.providerOrderId || o.paymentProvider !== provider.name) {
    throw new ConflictError("This order can no longer be paid. Place a new order from your bag.");
  }
  return {
    orderId: o.id, number: o.number, amountPaise: o.totalPaise, currency: "INR", provider: provider.name,
    providerOrderId: o.providerOrderId, keyId: provider.publicKey, prefill: { name: o.shipName, email: o.email, contact: o.shipPhone },
  };
}
```

Note: `Page` must include exactly the fields of the existing `Page<T>` in `@/server/services/catalog`; if it has more, fill them the same way `listAdminProducts` does.

- [ ] **Step 5: Verify and commit**

Run the test file (GREEN), then the full gate.

```bash
git add src/server/errors.ts src/server/services/order-records.ts src/server/services/orders.ts tests/unit/orders.test.ts
git commit -m "feat(orders): place orders with stock reservation, idempotent payment, expiry and cancel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 6: Email templates, SMTP driver, notification service

**Files:**
- Create: `src/server/adapters/email/smtp.ts`, `src/server/emails/templates.ts`, `src/server/services/notifications.ts`
- Modify: `src/server/adapters/email/index.ts` (smtp branch), `src/server/services/orders.ts` (wire notifications), `package.json`/`package-lock.json` (nodemailer), `.env.example`
- Test: `tests/unit/email-templates.test.ts`, `tests/unit/notifications.test.ts`, `tests/unit/smtp-email.test.ts`

**Interfaces:**
- Consumes: `OrderView`, `getOrderById`, `addOrderEvent` (Task 5), `getSettings` (Task 1), `addressLines`, `formatPhone` (Task 3), `escapeHtml`, `formatPaise`, `BRAND`, `getEmail`.
- Produces:

```ts
// @/server/adapters/email/smtp
export class SmtpEmail implements EmailAdapter { constructor(url: string, from: string) }
// @/server/emails/templates
export interface RenderedEmail { subject: string; html: string; text: string }
export function siteUrl(): string;                                   // NEXT_PUBLIC_SITE_URL without trailing slash
export function orderConfirmationEmail(o: OrderView): RenderedEmail;
export function adminNewOrderEmail(o: OrderView): RenderedEmail;
export function orderShippedEmail(o: OrderView): RenderedEmail;
export function orderDeliveredEmail(o: OrderView): RenderedEmail;
export function orderCancelledEmail(o: OrderView): RenderedEmail;
export function orderRefundedEmail(o: OrderView): RenderedEmail;
export interface LowStockRow { productName: string; size: string; colorName: string; sku: string; stock: number }
export function lowStockDigestEmail(rows: LowStockRow[], threshold: number): RenderedEmail;
export interface DailySummary { dateLabel: string; paidOrders: number; revenuePaise: number; toShip: number; needsAttention: number; lowStock: number }
export function dailySummaryEmail(s: DailySummary): RenderedEmail;
export function abandonedCartEmail(args: { name: string | null; items: { name: string; size: string; colorName: string }[] }): RenderedEmail;
// @/server/services/notifications
export type OrderNotice = "paid" | "shipped" | "delivered" | "cancelled" | "refunded";
export function sendEmailSafely(msg: EmailMessage): Promise<boolean>;   // never throws
export function notifyOrder(orderId: string, notice: OrderNotice): Promise<void>;   // never throws; records EMAIL_SENT / EMAIL_FAILED
export type AdminSendResult = "sent" | "failed" | "no-recipient";
export function sendToAdmin(rendered: RenderedEmail): Promise<AdminSendResult>;
```

Rules (spec §2, §8): every dynamic value in HTML goes through `escapeHtml`; subjects are single-line; tracking links are included only for `http(s)` URLs; sending failures are logged and recorded as `EMAIL_FAILED` events and never block the order flow. The paid notice also emails `StoreSetting.adminNotifyEmail` when set.

- [ ] **Step 1: Install**

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

- [ ] **Step 2: Failing tests**

Create `tests/unit/email-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  abandonedCartEmail, adminNewOrderEmail, dailySummaryEmail, lowStockDigestEmail, orderConfirmationEmail, orderShippedEmail,
} from "@/server/emails/templates";
import type { OrderView } from "@/server/services/order-records";

function sampleOrder(over: Partial<OrderView> = {}): OrderView {
  const now = new Date("2026-10-01T10:00:00Z");
  return {
    id: "o1", number: "ORD-1001", status: "PAID", userId: "u1", email: "buyer@example.test", createdAt: now, expiresAt: now,
    paidAt: now, processingAt: null, shippedAt: null, deliveredAt: null, cancelledAt: null, refundedAt: null,
    subtotalPaise: 119800, discountPaise: 19900, shippingPaise: 0, totalPaise: 99900, couponCode: null, offerLabel: "Any 2 for ₹999",
    paymentProvider: "mock", providerOrderId: "mock_order_1", providerPaymentId: "mock_pay_1",
    carrier: null, trackingNumber: null, trackingUrl: null, customerNote: "<b>ring twice</b>",
    ship: { name: "Asha <script>alert(1)</script> Rao", phone: "9876543210", line1: "12 MG Road", line2: null, landmark: null, city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    items: [{ id: "i1", productId: "p1", productName: "Tee & <Co>", productSlug: "tee", size: "M", colorName: "Black", imageUrl: null, sku: "SKU-1", unitPricePaise: 59900, quantity: 2, lineTotalPaise: 119800 }],
    itemCount: 2,
    ...over,
  };
}

describe("order emails", () => {
  it("escapes customer-controlled text in the confirmation", () => {
    const m = orderConfirmationEmail(sampleOrder());
    expect(m.subject).toBe("Order ORD-1001 confirmed");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("Asha &lt;script&gt;");
    expect(m.html).toContain("Tee &amp; &lt;Co&gt;");
    expect(m.html).toContain("₹999");
    expect(m.html).toContain("/account/orders/ORD-1001");
    expect(m.text).toContain("ORD-1001");
  });

  it("gives the admin a link to the order and the escaped note", () => {
    const m = adminNewOrderEmail(sampleOrder());
    expect(m.subject).toBe("New order ORD-1001 · ₹999");
    expect(m.html).toContain("/admin/orders/o1");
    expect(m.html).toContain("&lt;b&gt;ring twice&lt;/b&gt;");
  });

  it("links tracking only for http(s) URLs", () => {
    const ok = orderShippedEmail(sampleOrder({ status: "SHIPPED", carrier: "Delhivery", trackingNumber: "AWB123", trackingUrl: "https://www.delhivery.com/track/package/AWB123" }));
    expect(ok.subject).toBe("Order ORD-1001 has shipped");
    expect(ok.html).toContain('href="https://www.delhivery.com/track/package/AWB123"');
    const bad = orderShippedEmail(sampleOrder({ status: "SHIPPED", carrier: "Other", trackingNumber: "X1", trackingUrl: "javascript:alert(1)" }));
    expect(bad.html).not.toContain("javascript:");
    expect(bad.html).toContain("X1");
  });
});

describe("operations emails", () => {
  it("summarises low stock, the day, and abandoned bags", () => {
    const low = lowStockDigestEmail([{ productName: "Tee <1>", size: "M", colorName: "Black", sku: "S1", stock: 2 }], 5);
    expect(low.subject).toBe("Low stock: 1 variant at or below 5");
    expect(low.html).toContain("Tee &lt;1&gt;");
    const day = dailySummaryEmail({ dateLabel: "1 Oct 2026", paidOrders: 3, revenuePaise: 299700, toShip: 2, needsAttention: 1, lowStock: 4 });
    expect(day.subject).toContain("1 Oct 2026");
    expect(day.html).toContain("₹2,997");
    const cart = abandonedCartEmail({ name: "Ravi", items: [{ name: "Tee", size: "L", colorName: "White" }] });
    expect(cart.subject).toBe("You left something in your bag");
    expect(cart.html).toContain("/cart");
    expect(`${low.subject}${day.subject}${cart.subject}`).not.toMatch(/[\r\n]/);
  });
});
```

Create `tests/unit/notifications.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { getEmail, type ConsoleEmail } from "@/server/adapters/email";
import { notifyOrder, sendToAdmin } from "@/server/services/notifications";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { markOrderPaid, placeOrder } from "@/server/services/orders";

const outbox = () => getEmail() as ConsoleEmail;
const setAdminEmail = (adminNotifyEmail: string | null) =>
  db.storeSetting.upsert({ where: { id: 1 }, update: { adminNotifyEmail }, create: { id: 1, adminNotifyEmail } });

describe("notifications", () => {
  beforeEach(async () => {
    await resetDb();
    outbox().sent.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it("emails the customer and the admin and records both", async () => {
    const u = await createUser();
    const o = await createOrderRow(u.id, { status: "PAID" });
    await setAdminEmail("owner@example.test");
    await notifyOrder(o.id, "paid");
    expect(outbox().sent.map((m) => m.to)).toEqual([o.email, "owner@example.test"]);
    expect(outbox().sent[0].subject).toMatch(/confirmed/);
    const events = await db.orderEvent.findMany({ where: { orderId: o.id } });
    expect(events.filter((e) => e.type === "EMAIL_SENT")).toHaveLength(2);
  });

  it("records EMAIL_FAILED and never throws", async () => {
    const u = await createUser();
    const o = await createOrderRow(u.id, { status: "SHIPPED" });
    vi.spyOn(outbox(), "send").mockRejectedValue(new Error("smtp down"));
    await expect(notifyOrder(o.id, "shipped")).resolves.toBeUndefined();
    expect((await db.orderEvent.findMany({ where: { orderId: o.id } })).map((e) => e.type)).toEqual(["EMAIL_FAILED"]);
    await expect(notifyOrder("missing-order", "paid")).resolves.toBeUndefined();
  });

  it("reports whether an admin email could be sent", async () => {
    await setAdminEmail(null);
    expect(await sendToAdmin({ subject: "s", html: "<p>h</p>", text: "h" })).toBe("no-recipient");
    await setAdminEmail("owner@example.test");
    expect(await sendToAdmin({ subject: "s", html: "<p>h</p>", text: "h" })).toBe("sent");
  });

  it("sends the confirmation when an order is paid", async () => {
    const user = await createUser();
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 3 }] });
    const address = await createAddress(user.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await addItem({ userId: user.id }, p.variants[0].id, 1);
    const placed = await placeOrder(user.id, { addressId: address.id });
    await markOrderPaid(placed.orderId, "pay_1", "client");
    expect(outbox().sent.some((m) => m.to === user.email && m.subject === `Order ${placed.number} confirmed`)).toBe(true);
  });
});
```

Create `tests/unit/smtp-email.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock("nodemailer", () => ({ default: { createTransport } }));

import { SmtpEmail } from "@/server/adapters/email/smtp";

describe("SmtpEmail", () => {
  it("sends through a transport built from SMTP_URL", async () => {
    const mail = new SmtpEmail("smtps://user:pass@smtp.example.com:465", "Shop <no-reply@example.com>");
    await mail.send({ to: "a@b.c", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    expect(createTransport).toHaveBeenCalledWith("smtps://user:pass@smtp.example.com:465");
    expect(sendMail).toHaveBeenCalledWith({ from: "Shop <no-reply@example.com>", to: "a@b.c", subject: "Hi", html: "<p>hi</p>", text: "hi" });
  });
});
```

Run: `npm test -- tests/unit/email-templates.test.ts tests/unit/notifications.test.ts tests/unit/smtp-email.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: SMTP driver**

Create `src/server/adapters/email/smtp.ts`:

```ts
import nodemailer, { type Transporter } from "nodemailer";
import type { EmailAdapter, EmailMessage } from "./types";

export class SmtpEmail implements EmailAdapter {
  private readonly transport: Transporter;
  constructor(url: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(msg: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
  }
}
```

In `src/server/adapters/email/index.ts` import `SmtpEmail` and add, between the `ses` branch and the console fallback:

```ts
  } else if (process.env.EMAIL_DRIVER === "smtp") {
    const url = process.env.SMTP_URL;
    const from = process.env.EMAIL_FROM;
    if (!url || !from) throw new Error("SMTP_URL and EMAIL_FROM are required when EMAIL_DRIVER=smtp");
    cached = new SmtpEmail(url, from);
```

In `.env.example` change the adapter comment to `# Adapters: local|s3 and console|ses|smtp` and add:

```bash
# SMTP (only when EMAIL_DRIVER=smtp), e.g. smtps://user:app-password@smtp.gmail.com:465
SMTP_URL=""
```

- [ ] **Step 4: Templates**

Create `src/server/emails/templates.ts`:

```ts
import { BRAND } from "@/config/brand";
import { addressLines, formatPhone } from "@/lib/address-format";
import { escapeHtml as e } from "@/lib/escape-html";
import { formatPaise } from "@/lib/money";
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
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
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
```

`layout` escapes the heading itself, so headings are always passed as plain text (never pre-escaped).

- [ ] **Step 5: Notification service and wiring**

Create `src/server/services/notifications.ts`:

```ts
import { db } from "@/server/db";
import { getEmail, type EmailMessage } from "@/server/adapters/email";
import {
  adminNewOrderEmail, orderCancelledEmail, orderConfirmationEmail, orderDeliveredEmail, orderRefundedEmail, orderShippedEmail, type RenderedEmail,
} from "@/server/emails/templates";
import { addOrderEvent, getOrderById } from "@/server/services/order-records";
import { getSettings } from "@/server/services/settings";

export type OrderNotice = "paid" | "shipped" | "delivered" | "cancelled" | "refunded";
export type AdminSendResult = "sent" | "failed" | "no-recipient";

const CUSTOMER = {
  paid: { render: orderConfirmationEmail, label: "Order confirmation" },
  shipped: { render: orderShippedEmail, label: "Shipped" },
  delivered: { render: orderDeliveredEmail, label: "Delivered" },
  cancelled: { render: orderCancelledEmail, label: "Cancellation" },
  refunded: { render: orderRefundedEmail, label: "Refund" },
} as const;

export async function sendEmailSafely(msg: EmailMessage): Promise<boolean> {
  try {
    await getEmail().send(msg);
    return true;
  } catch (err) {
    console.error("[email] send failed", msg.to, msg.subject, err);
    return false;
  }
}

async function sendAndRecord(orderId: string, to: string, rendered: RenderedEmail, label: string): Promise<void> {
  const ok = await sendEmailSafely({ to, ...rendered });
  await addOrderEvent(db, orderId, ok ? "EMAIL_SENT" : "EMAIL_FAILED", `${label} email ${ok ? "sent" : "failed"} → ${to}`);
}

export async function notifyOrder(orderId: string, notice: OrderNotice): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    const t = CUSTOMER[notice];
    await sendAndRecord(orderId, order.email, t.render(order), t.label);
    if (notice === "paid") {
      const settings = await getSettings();
      if (settings.adminNotifyEmail) await sendAndRecord(orderId, settings.adminNotifyEmail, adminNewOrderEmail(order), "Admin new-order");
    }
  } catch (err) {
    console.error("[notify] failed", orderId, notice, err);
  }
}

export async function sendToAdmin(rendered: RenderedEmail): Promise<AdminSendResult> {
  const settings = await getSettings();
  if (!settings.adminNotifyEmail) return "no-recipient";
  return (await sendEmailSafely({ to: settings.adminNotifyEmail, ...rendered })) ? "sent" : "failed";
}
```

In `src/server/services/orders.ts` import `notifyOrder` from `@/server/services/notifications` and replace the two `// Task 6 adds:` comments with the real calls: `await notifyOrder(orderId, "paid");` at the end of `afterPaid`, and `await notifyOrder(orderId, "cancelled");` at the end of `cancelOrder`. (`notifyOrder` never throws, so order state changes are never undone by an email problem.)

- [ ] **Step 6: Verify and commit**

Run the three new test files plus `tests/unit/orders.test.ts` (GREEN), then the full gate.

```bash
git add package.json package-lock.json .env.example src/server/adapters/email/smtp.ts src/server/adapters/email/index.ts src/server/emails/templates.ts src/server/services/notifications.ts src/server/services/orders.ts tests/unit/email-templates.test.ts tests/unit/notifications.test.ts tests/unit/smtp-email.test.ts
git commit -m "feat(email): add order and operations emails, SMTP driver and best-effort notifications

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 7: Checkout — page, Razorpay Checkout.js client, verify and webhook routes, mock pay page, order status page, cart preview

**Files:**
- Create: `src/lib/dates.ts`, `src/server/services/checkout.ts`, `src/app/(storefront)/checkout/actions.ts`, `src/components/storefront/checkout/checkout-form.tsx`, `src/components/storefront/checkout/pay.ts`, `src/components/storefront/checkout/retry-payment-button.tsx`, `src/components/storefront/checkout/auto-refresh.tsx`, `src/components/storefront/price-breakup.tsx`, `src/app/(storefront)/checkout/mock-pay/[orderId]/page.tsx`, `src/app/(storefront)/orders/[number]/success/page.tsx`, `src/app/api/payments/verify/route.ts`, `src/app/api/webhooks/razorpay/route.ts`, `src/app/api/v1/checkout/route.ts`, `src/app/api/v1/checkout/verify/route.ts`
- Modify: `src/app/(storefront)/checkout/page.tsx` (replace the placeholder), `src/server/cart-ref.ts` (add `getCurrentCartPreview`), `src/app/(storefront)/layout.tsx`, `src/app/(storefront)/cart/page.tsx`, `src/components/storefront/cart-panel.tsx`, `src/components/storefront/free-shipping-bar.tsx`, `tests/e2e/product-cart.spec.ts`
- Test: `tests/unit/dates.test.ts`, `tests/unit/checkout.test.ts`, `tests/unit/payment-routes.test.ts`

**Interfaces:**
- Consumes: `priceCart`, `PriceResult`, `discountLabel` (Task 2), `getLiveOffers`, `quote` (Task 2), `listAddresses`, `AddressView`, `AddressForm`, `requireUserId` (Task 3), `getPaymentProvider`, `paymentProviderName`, `isMockPayments`, `MockProvider`, `newMockPaymentId`, `hmacSha256Hex`, `MOCK_SECRET` (Task 4), `loadCheckoutLines`, `reconcileCartStock`, `toPricingLines`, `unitPriceOf`, `placeOrder`, `placeOrderSchema`, `PlaceOrderInput`, `CheckoutPayload`, `markOrderPaid`, `MarkPaidOutcome`, `recordPaymentFailure`, `findOrderByProviderOrderId`, `getOrderForUser`, `getRetryPayload` (Task 5), `orderDiscountLabel` (Task 5), `getSettings` (Task 1), `isPaidStatus` (Task 1), `rateLimit`, `RateLimitedError`, `handle`/`ok`/`parseJson`/`requireApiUser`.
- Produces:

```ts
// @/lib/dates (Task 11 extends)
export const IST_TIME_ZONE = "Asia/Kolkata";
export function formatDateIst(d: Date): string;        // "1 Oct 2026"
export function formatDateTimeIst(d: Date): string;    // "1 Oct 2026, 1:30 am"
export function formatTimeIst(d: Date): string;        // "1:30 am"
// @/server/services/checkout
export interface CheckoutLineView { variantId: string; productName: string; productSlug: string; imageUrl: string | null; size: string; colorName: string; unitPricePaise: number; quantity: number; lineTotalPaise: number }
export interface CheckoutView { lines: CheckoutLineView[]; addresses: AddressView[]; price: PriceResult; stockIssues: StockIssue[]; email: string; freeShippingThresholdPaise: number }
export function getCheckoutView(userId: string, couponCode?: string | null): Promise<CheckoutView>;   // reconciles stock (adjusts cart)
export function quoteForUser(userId: string, couponCode: string | null): Promise<PriceResult>;
export interface CartPricingPreview { offerLabel: string | null; discountPaise: number; discountedSubtotalPaise: number; shippingPaise: number; totalPaise: number; freeShippingThresholdPaise: number }
export function previewCartPricing(ref: CartRef): Promise<CartPricingPreview>;
export const verifyPaymentSchema; export type VerifyPaymentInput;                  // { orderId, providerOrderId, paymentId, signature }
export function confirmClientPayment(userId: string, input: unknown): Promise<{ outcome: MarkPaidOutcome; number: string }>;
export function getOwnedOrderRef(userId: string, orderId: string): Promise<{ id: string; number: string; status: OrderStatus; totalPaise: number; providerOrderId: string | null; paymentProvider: string }>;
export type WebhookResult = { status: 200 | 400; handled: string };
export function handleRazorpayWebhook(rawBody: string, signature: string | null): Promise<WebhookResult>;
// @/server/cart-ref (added)
export function getCurrentCartPreview(): Promise<CartPricingPreview | null>;
// src/app/(storefront)/checkout/actions.ts
export function quoteCheckoutAction(couponCode: string | null): Promise<ActionResult<PriceResult>>;
export function placeOrderAction(input: PlaceOrderInput): Promise<ActionResult<CheckoutPayload>>;
export function retryPaymentAction(number: string): Promise<ActionResult<CheckoutPayload>>;
export function mockPayAction(orderId: string, outcome: "succeed" | "fail"): Promise<void>;   // redirects
// client
export function loadRazorpay(): Promise<void>;
export interface PayNav { push(href: string): void; replace(href: string): void }
export function startPayment(payload: CheckoutPayload, nav: PayNav): Promise<void>;
export function orderStatusUrl(number: string, payment?: "failed" | "dismissed" | "verifying"): string;   // /orders/<n>/success[?payment=…]
export function PriceBreakup(props: { subtotalPaise: number; discountPaise: number; discountLabel: string | null; shippingPaise: number; totalPaise: number; className?: string }): JSX.Element;
export function RetryPaymentButton(props: { number: string; className?: string }): JSX.Element;
export function AutoRefresh(props: { intervalMs?: number; maxTries?: number }): null;
export function CheckoutForm(props: { view: CheckoutView; provider: ProviderName }): JSX.Element;
// routes: POST /api/payments/verify, POST /api/webhooks/razorpay, GET|POST /api/v1/checkout, POST /api/v1/checkout/verify
```

Flow (spec §5): `/checkout` requires sign-in (`redirect("/login?next=%2Fcheckout")`; the guest cart merges on login). The page reconciles stock on every render and shows what changed. **Pay** → `placeOrderAction` → `startPayment`: `mock` navigates to `/checkout/mock-pay/<orderId>`; `razorpay` opens Checkout.js with `order_id`, prefill name/email/contact; its `handler` POSTs to `/api/payments/verify` then `router.replace("/orders/<n>/success")`; dismissing goes to `/orders/<n>/success?payment=dismissed`, which shows **Retry payment** until expiry. The webhook is the second, independent path to "paid". The order status page at `/orders/<n>/success` handles every state so Task 7 is self-contained (Task 8 adds the account order pages).

- [ ] **Step 1: Failing tests**

Create `tests/unit/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDateIst, formatDateTimeIst, formatTimeIst } from "@/lib/dates";

describe("IST formatting", () => {
  const d = new Date("2026-09-30T20:00:00Z"); // 1 Oct 2026, 01:30 IST
  it("formats in Asia/Kolkata regardless of server time zone", () => {
    expect(formatDateIst(d)).toBe("1 Oct 2026");
    expect(formatTimeIst(d)).toMatch(/^1:30\s?am$/i);
    expect(formatDateTimeIst(d)).toMatch(/^1 Oct 2026,? 1:30\s?am$/i);
  });
});
```

Create `tests/unit/checkout.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { placeOrder } from "@/server/services/orders";
import { MOCK_SECRET, MockProvider } from "@/server/payments/mock";
import { hmacSha256Hex } from "@/server/payments/hmac";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { confirmClientPayment, getCheckoutView, handleRazorpayWebhook, previewCartPricing } from "@/server/services/checkout";

const ADDRESS = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };
const mock = new MockProvider();

async function placed(qty = 1) {
  const user = await createUser();
  const product = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
  const address = await createAddress(user.id, ADDRESS);
  await addItem({ userId: user.id }, product.variants[0].id, qty);
  const payload = await placeOrder(user.id, { addressId: address.id });
  return { user, product, address, payload };
}

function signed(body: unknown) {
  const raw = JSON.stringify(body);
  return { raw, sig: hmacSha256Hex(MOCK_SECRET, raw) };
}

const captured = (providerOrderId: string, paymentId: string, amount: number) => ({
  event: "payment.captured",
  payload: { payment: { entity: { id: paymentId, order_id: providerOrderId, amount, status: "captured" } } },
});

describe("checkout view and preview", () => {
  beforeEach(resetDb);

  it("returns lines, addresses and a server price, and reports stock it adjusted", async () => {
    const user = await createUser();
    const p = await createProduct({ basePricePaise: 59900, variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    await createAddress(user.id, ADDRESS);
    await addItem({ userId: user.id }, p.variants[0].id, 3);
    await db.productVariant.update({ where: { id: p.variants[0].id }, data: { stock: 2 } });
    const view = await getCheckoutView(user.id);
    expect(view.stockIssues).toEqual([expect.objectContaining({ requested: 3, available: 2 })]);
    expect(view.lines).toEqual([expect.objectContaining({ quantity: 2, unitPricePaise: 59900, lineTotalPaise: 119800, size: "M" })]);
    expect(view.addresses).toHaveLength(1);
    expect(view.price).toMatchObject({ subtotalPaise: 119800, shippingPaise: 0, totalPaise: 119800 });
  });

  it("previews offers for any cart, including guests", async () => {
    const p = await createProduct({ basePricePaise: 59900, variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    await db.offer.create({ data: { label: "Any 2 for ₹999", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900 } });
    await addItem({ guestToken: "guest-1" }, p.variants[0].id, 2);
    expect(await previewCartPricing({ guestToken: "guest-1" })).toMatchObject({ offerLabel: "Any 2 for ₹999", discountPaise: 19900, discountedSubtotalPaise: 99900, shippingPaise: 0, totalPaise: 99900 });
    expect((await previewCartPricing({ guestToken: "nobody" })).totalPaise).toBe(0);
  });
});

describe("client payment confirmation", () => {
  beforeEach(resetDb);

  it("marks the order paid with a valid signature", async () => {
    const { user, payload } = await placed();
    const r = await confirmClientPayment(user.id, { orderId: payload.orderId, providerOrderId: payload.providerOrderId, paymentId: "mock_pay_1", signature: mock.sign(payload.providerOrderId, "mock_pay_1") });
    expect(r).toEqual({ outcome: "paid", number: payload.number });
  });

  it("rejects bad signatures, foreign orders and mismatched provider orders", async () => {
    const { user, payload } = await placed();
    const base = { orderId: payload.orderId, providerOrderId: payload.providerOrderId, paymentId: "mock_pay_1" };
    await expect(confirmClientPayment(user.id, { ...base, signature: "deadbeef" })).rejects.toBeInstanceOf(ForbiddenError);
    const o = await db.order.findUniqueOrThrow({ where: { id: payload.orderId }, include: { events: true } });
    expect(o.status).toBe("PENDING_PAYMENT");
    expect(o.events.map((e) => e.type)).toContain("PAYMENT_FAILED");
    const stranger = await createUser();
    await expect(confirmClientPayment(stranger.id, { ...base, signature: mock.sign(payload.providerOrderId, "mock_pay_1") })).rejects.toBeInstanceOf(NotFoundError);
    await expect(confirmClientPayment(user.id, { ...base, providerOrderId: "mock_order_other", signature: mock.sign("mock_order_other", "mock_pay_1") })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("Razorpay webhook handling", () => {
  beforeEach(resetDb);

  it("rejects bad signatures", async () => {
    const { raw } = signed({ event: "payment.captured" });
    expect(await handleRazorpayWebhook(raw, "nope")).toEqual({ status: 400, handled: "bad-signature" });
    expect(await handleRazorpayWebhook(raw, null)).toEqual({ status: 400, handled: "bad-signature" });
  });

  it("marks paid on payment.captured, idempotently", async () => {
    const { payload } = await placed();
    const { raw, sig } = signed(captured(payload.providerOrderId, "pay_wh_1", payload.amountPaise));
    expect(await handleRazorpayWebhook(raw, sig)).toEqual({ status: 200, handled: "paid" });
    expect(await handleRazorpayWebhook(raw, sig)).toEqual({ status: 200, handled: "already_paid" });
    expect((await db.order.findUniqueOrThrow({ where: { id: payload.orderId } })).providerPaymentId).toBe("pay_wh_1");
  });

  it("flags order.paid with the wrong amount", async () => {
    const { payload } = await placed();
    const body = { event: "order.paid", payload: { order: { entity: { id: payload.providerOrderId, amount_paid: 100 } }, payment: { entity: { id: "pay_x", order_id: payload.providerOrderId, amount: 100 } } } };
    const { raw, sig } = signed(body);
    expect(await handleRazorpayWebhook(raw, sig)).toEqual({ status: 200, handled: "amount_mismatch" });
  });

  it("acknowledges unknown orders and records failures", async () => {
    const unknown = signed(captured("order_unknown", "pay_1", 100));
    expect(await handleRazorpayWebhook(unknown.raw, unknown.sig)).toEqual({ status: 200, handled: "unknown-order" });
    const { payload } = await placed();
    const failed = signed({ event: "payment.failed", payload: { payment: { entity: { id: "pay_f", order_id: payload.providerOrderId, error_description: "Card declined" } } } });
    expect(await handleRazorpayWebhook(failed.raw, failed.sig)).toEqual({ status: 200, handled: "payment-failed" });
    const events = await db.orderEvent.findMany({ where: { orderId: payload.orderId, type: "PAYMENT_FAILED" } });
    expect(events[0].message).toContain("Card declined");
  });
});
```

Create `tests/unit/payment-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { signApiToken } from "@/server/api-token";
import { MOCK_SECRET, MockProvider } from "@/server/payments/mock";
import { hmacSha256Hex } from "@/server/payments/hmac";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { POST as verify } from "@/app/api/payments/verify/route";
import { GET as checkoutGet, POST as checkoutPost } from "@/app/api/v1/checkout/route";

const BASE = "http://localhost:3000";
const params = { params: Promise.resolve({}) };

describe("payment routes", () => {
  beforeEach(resetDb);

  it("runs the API checkout, client verification and webhook", async () => {
    const user = await createUser();
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    const address = await createAddress(user.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await addItem({ userId: user.id }, p.variants[0].id, 1);
    const headers = { authorization: `Bearer ${await signApiToken({ id: user.id, role: "CUSTOMER" })}`, "content-type": "application/json" };

    const view = await (await checkoutGet(new NextRequest(`${BASE}/api/v1/checkout`, { headers }), params)).json();
    expect(view.data.price.totalPaise).toBe(67800);

    const placed = await checkoutPost(new NextRequest(`${BASE}/api/v1/checkout`, { method: "POST", headers, body: JSON.stringify({ addressId: address.id }) }), params);
    expect(placed.status).toBe(201);
    const payload = (await placed.json()).data;

    const badVerify = await verify(new NextRequest(`${BASE}/api/payments/verify`, { method: "POST", headers, body: JSON.stringify({ orderId: payload.orderId, providerOrderId: payload.providerOrderId, paymentId: "p1", signature: "bad" }) }), params);
    expect(badVerify.status).toBe(403);

    const sig = new MockProvider().sign(payload.providerOrderId, "p1");
    const good = await verify(new NextRequest(`${BASE}/api/payments/verify`, { method: "POST", headers, body: JSON.stringify({ orderId: payload.orderId, providerOrderId: payload.providerOrderId, paymentId: "p1", signature: sig }) }), params);
    expect((await good.json()).data).toEqual({ outcome: "paid", number: payload.number });

    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "p1", order_id: payload.providerOrderId, amount: payload.amountPaise } } } });
    const dup = await webhook(new Request(`${BASE}/api/webhooks/razorpay`, { method: "POST", body: raw, headers: { "x-razorpay-signature": hmacSha256Hex(MOCK_SECRET, raw) } }));
    expect(dup.status).toBe(200);
    expect((await dup.json()).handled).toBe("already_paid");
    const forged = await webhook(new Request(`${BASE}/api/webhooks/razorpay`, { method: "POST", body: raw, headers: { "x-razorpay-signature": "0".repeat(64) } }));
    expect(forged.status).toBe(400);
  });
});
```

Run: `npm test -- tests/unit/dates.test.ts tests/unit/checkout.test.ts tests/unit/payment-routes.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Dates and checkout service**

Create `src/lib/dates.ts`:

```ts
export const IST_TIME_ZONE = "Asia/Kolkata";

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });

export function formatDateIst(d: Date): string {
  return dateFmt.format(d);
}

export function formatTimeIst(d: Date): string {
  return timeFmt.format(d).toLowerCase();
}

export function formatDateTimeIst(d: Date): string {
  return `${formatDateIst(d)}, ${formatTimeIst(d)}`;
}
```

Create `src/server/services/checkout.ts`:

```ts
import { z } from "zod";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ForbiddenError, NotFoundError, ValidationError, type StockIssue } from "@/server/errors";
import { getPaymentProvider } from "@/server/payments";
import { listAddresses, type AddressView } from "@/server/services/addresses";
import type { CartRef } from "@/server/services/cart";
import {
  findOrderByProviderOrderId, loadCheckoutLines, markOrderPaid, recordPaymentFailure, reconcileCartStock, toPricingLines, unitPriceOf,
  type CheckoutLineRow, type MarkPaidOutcome,
} from "@/server/services/orders";
import { getLiveOffers, quote } from "@/server/services/promotions";
import { getSettings } from "@/server/services/settings";
import { priceCart, type PriceResult } from "@/lib/pricing";

export interface CheckoutLineView {
  variantId: string; productName: string; productSlug: string; imageUrl: string | null; size: string; colorName: string;
  unitPricePaise: number; quantity: number; lineTotalPaise: number;
}
export interface CheckoutView {
  lines: CheckoutLineView[]; addresses: AddressView[]; price: PriceResult; stockIssues: StockIssue[]; email: string; freeShippingThresholdPaise: number;
}
export interface CartPricingPreview {
  offerLabel: string | null; discountPaise: number; discountedSubtotalPaise: number; shippingPaise: number; totalPaise: number; freeShippingThresholdPaise: number;
}

function toLineView(l: CheckoutLineRow): CheckoutLineView {
  const p = l.variant.product;
  const unit = unitPriceOf(l);
  const image = p.images.find((i) => i.colorName === l.variant.colorName) ?? p.images[0];
  return {
    variantId: l.variantId, productName: p.name, productSlug: p.slug, imageUrl: image?.url ?? null, size: l.variant.size,
    colorName: l.variant.colorName, unitPricePaise: unit, quantity: l.quantity, lineTotalPaise: unit * l.quantity,
  };
}

export async function getCheckoutView(userId: string, couponCode?: string | null): Promise<CheckoutView> {
  const [loaded, addresses, user, settings] = await Promise.all([
    loadCheckoutLines(userId), listAddresses(userId), db.user.findUnique({ where: { id: userId }, select: { email: true } }), getSettings(),
  ]);
  if (!user) throw new NotFoundError("User");
  const { rows, issues } = await reconcileCartStock(loaded);
  const price = await quote({ lines: toPricingLines(rows), couponCode, userId });
  return { lines: rows.map(toLineView), addresses, price, stockIssues: issues, email: user.email, freeShippingThresholdPaise: settings.freeShippingThresholdPaise };
}

export async function quoteForUser(userId: string, couponCode: string | null): Promise<PriceResult> {
  return quote({ lines: toPricingLines(await loadCheckoutLines(userId)), couponCode, userId });
}

export async function previewCartPricing(ref: CartRef): Promise<CartPricingPreview> {
  const items = await db.cartItem.findMany({
    where: { cart: "userId" in ref ? { userId: ref.userId } : { guestToken: ref.guestToken } },
    include: { variant: { include: { product: { select: { basePricePaise: true, collections: { select: { collectionId: true } } } } } } },
  });
  const [settings, offers] = await Promise.all([getSettings(), items.length ? getLiveOffers() : Promise.resolve([])]);
  const lines = items.map((i) => ({
    unitPricePaise: i.variant.pricePaise ?? i.variant.product.basePricePaise,
    quantity: i.quantity,
    collectionIds: i.variant.product.collections.map((c) => c.collectionId),
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
    await recordPaymentFailure(order.id, `Rejected a payment confirmation with an invalid signature (${paymentId})`);
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
    const amount = event === "order.paid" ? (rzOrder?.amount_paid ?? payment.amount) : payment.amount;
    const r = await markOrderPaid(order.id, payment.id, "webhook", { amountPaise: amount });
    return { status: 200, handled: r.outcome };
  }
  if (event === "payment.failed") {
    await recordPaymentFailure(order.id, `Payment failed${payment?.error_description ? `: ${payment.error_description}` : ""}`);
    return { status: 200, handled: "payment-failed" };
  }
  return { status: 200, handled: "ignored" };
}
```

Append to `src/server/cart-ref.ts`:

```ts
import { previewCartPricing, type CartPricingPreview } from "@/server/services/checkout";

/** Offer-aware totals for the cart drawer and bag page; null when there is no cart yet. */
export async function getCurrentCartPreview(): Promise<CartPricingPreview | null> {
  const ref = await resolveCartRef({ create: false });
  return ref ? previewCartPricing(ref) : null;
}
```

(Move that import to the top of the file with the others.)

- [ ] **Step 3: Routes**

Create `src/app/api/payments/verify/route.ts`:

```ts
import { handle, ok, parseJson, requireApiUser } from "@/server/api";
import { RateLimitedError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { confirmClientPayment, verifyPaymentSchema } from "@/server/services/checkout";

export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const rl = rateLimit(`verify:${user.id}`, 20, 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  return ok(await confirmClientPayment(user.id, await parseJson(req, verifyPaymentSchema)));
});
```

Create `src/app/api/webhooks/razorpay/route.ts` (reads the **raw** body; never parse before verifying):

```ts
import { NextResponse } from "next/server";
import { handleRazorpayWebhook } from "@/server/services/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const raw = await req.text();
    const r = await handleRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"));
    return NextResponse.json({ handled: r.handled }, { status: r.status });
  } catch (err) {
    // 500 makes Razorpay retry later; every handler path is idempotent.
    console.error("[webhook:razorpay]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
```

Create `src/app/api/v1/checkout/route.ts`:

```ts
import { handle, ok, parseJson, requireApiUser } from "@/server/api";
import { RateLimitedError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { getCheckoutView } from "@/server/services/checkout";
import { placeOrder, placeOrderSchema } from "@/server/services/orders";

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  return ok(await getCheckoutView(user.id, req.nextUrl.searchParams.get("coupon")));
});

export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const rl = rateLimit(`place-order:${user.id}`, 10, 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  return ok(await placeOrder(user.id, await parseJson(req, placeOrderSchema)), { status: 201 });
});
```

Create `src/app/api/v1/checkout/verify/route.ts`:

```ts
import { POST as verify } from "@/app/api/payments/verify/route";

export const POST = verify;
```

- [ ] **Step 4: Actions**

Create `src/app/(storefront)/checkout/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { actionError, type ActionResult } from "@/server/action-result";
import { RateLimitedError } from "@/server/errors";
import { getPaymentProvider, isMockPayments } from "@/server/payments";
import { MockProvider, newMockPaymentId } from "@/server/payments/mock";
import { rateLimit } from "@/server/rate-limit";
import { requireUserId } from "@/server/session-user";
import { confirmClientPayment, getOwnedOrderRef, quoteForUser } from "@/server/services/checkout";
import { getRetryPayload, placeOrder, recordPaymentFailure, type CheckoutPayload, type PlaceOrderInput } from "@/server/services/orders";
import type { PriceResult } from "@/lib/pricing";

export async function quoteCheckoutAction(couponCode: string | null): Promise<ActionResult<PriceResult>> {
  try {
    const userId = await requireUserId();
    return { ok: true, data: await quoteForUser(userId, couponCode?.trim() || null) };
  } catch (err) {
    return actionError(err);
  }
}

export async function placeOrderAction(input: PlaceOrderInput): Promise<ActionResult<CheckoutPayload>> {
  try {
    const userId = await requireUserId();
    const rl = rateLimit(`place-order:${userId}`, 10, 60_000);
    if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
    const payload = await placeOrder(userId, input);
    revalidatePath("/", "layout");
    return { ok: true, data: payload };
  } catch (err) {
    return actionError(err);
  }
}

export async function retryPaymentAction(number: string): Promise<ActionResult<CheckoutPayload>> {
  try {
    return { ok: true, data: await getRetryPayload(await requireUserId(), number) };
  } catch (err) {
    return actionError(err);
  }
}

/** Dev/e2e only: simulates the Razorpay popup. Refused in production and for the razorpay provider. */
export async function mockPayAction(orderId: string, outcome: "succeed" | "fail"): Promise<void> {
  if (!isMockPayments()) notFound();
  const provider = getPaymentProvider();
  if (!(provider instanceof MockProvider)) notFound();
  const userId = await requireUserId();
  const order = await getOwnedOrderRef(userId, orderId);
  if (outcome === "succeed" && order.providerOrderId) {
    const paymentId = newMockPaymentId();
    const r = await confirmClientPayment(userId, { orderId, providerOrderId: order.providerOrderId, paymentId, signature: provider.sign(order.providerOrderId, paymentId) });
    revalidatePath("/", "layout");
    redirect(`/orders/${encodeURIComponent(r.number)}/success`);
  }
  await recordPaymentFailure(order.id, "Test payment failed (mock provider)");
  redirect(`/orders/${encodeURIComponent(order.number)}/success?payment=failed`);
}
```

- [ ] **Step 5: Client payment helper and small components**

Create `src/components/storefront/checkout/pay.ts`:

```ts
import { BRAND } from "@/config/brand";
import type { CheckoutPayload } from "@/server/services/orders";

interface RazorpaySuccess { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
interface RazorpayInstance { open(): void }
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;
declare global {
  interface Window { Razorpay?: RazorpayCtor }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Could not open the payment window. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface PayNav { push(href: string): void; replace(href: string): void }

export function orderStatusUrl(number: string, payment?: "failed" | "dismissed" | "verifying"): string {
  return `/orders/${encodeURIComponent(number)}/success${payment ? `?payment=${payment}` : ""}`;
}

export async function startPayment(payload: CheckoutPayload, nav: PayNav): Promise<void> {
  if (payload.provider === "mock") {
    nav.push(`/checkout/mock-pay/${encodeURIComponent(payload.orderId)}`);
    return;
  }
  await loadRazorpay();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Could not open the payment window. Please try again.");
  new Razorpay({
    key: payload.keyId,
    amount: payload.amountPaise,
    currency: payload.currency,
    name: BRAND.name,
    description: `Order ${payload.number}`,
    order_id: payload.providerOrderId,
    prefill: payload.prefill,
    theme: { color: "#111111" },
    retry: { enabled: true },
    handler: async (resp: RazorpaySuccess) => {
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: payload.orderId, providerOrderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }),
        });
        nav.replace(orderStatusUrl(payload.number, res.ok ? undefined : "verifying"));
      } catch {
        nav.replace(orderStatusUrl(payload.number, "verifying"));
      }
    },
    modal: { ondismiss: () => nav.push(orderStatusUrl(payload.number, "dismissed")) },
  }).open();
}
```

Create `src/components/storefront/checkout/retry-payment-button.tsx` (client): `useRouter`, `useTransition`; on click calls `retryPaymentAction(number)`; `ok` → `await startPayment(res.data, router)` (catch → `toast.error(err.message)`); not ok → `toast.error(res.message)` then `router.refresh()`. Renders `<Button className={cn("h-12 w-full sm:w-auto px-6", className)} data-testid="retry-payment">` labelled "Retry payment" / "Opening…".

Create `src/components/storefront/checkout/auto-refresh.tsx` (client): `useEffect` sets an interval of `intervalMs` (default 3000) calling `router.refresh()` up to `maxTries` (default 10) times, then stops; returns `null`. Used while a payment is confirming.

Create `src/components/storefront/price-breakup.tsx` (server-safe, no hooks):

```tsx
import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/money";

export function PriceBreakup({ subtotalPaise, discountPaise, discountLabel, shippingPaise, totalPaise, className }: {
  subtotalPaise: number; discountPaise: number; discountLabel: string | null; shippingPaise: number; totalPaise: number; className?: string;
}) {
  return (
    <dl className={cn("space-y-2 text-sm", className)} data-testid="price-breakup">
      <div className="flex justify-between gap-4"><dt className="text-text-muted">Subtotal</dt><dd>{formatPaise(subtotalPaise)}</dd></div>
      {discountPaise > 0 && (
        <div className="flex justify-between gap-4 text-brand"><dt>{discountLabel ?? "Discount"}</dt><dd data-testid="price-discount">−{formatPaise(discountPaise)}</dd></div>
      )}
      <div className="flex justify-between gap-4"><dt className="text-text-muted">Shipping</dt><dd>{shippingPaise === 0 ? "Free" : formatPaise(shippingPaise)}</dd></div>
      <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
        <dt className="font-medium">Total</dt>
        <dd className="font-display text-2xl" data-testid="price-total">{formatPaise(totalPaise)}</dd>
      </div>
      <p className="text-xs text-text-muted">Inclusive of all taxes.</p>
    </dl>
  );
}
```

- [ ] **Step 6: Checkout page and form**

Replace `src/app/(storefront)/checkout/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/storefront/checkout/checkout-form";
import { Button } from "@/components/ui/button";
import { auth } from "@/server/auth";
import { paymentProviderName } from "@/server/payments";
import { getCheckoutView } from "@/server/services/checkout";

export const metadata: Metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=%2Fcheckout");
  const view = await getCheckoutView(session.user.id);
  if (view.lines.length === 0) {
    return (
      <div className="container-x py-16 text-center" data-testid="checkout-empty">
        <h1 className="text-5xl">Your bag is empty</h1>
        {view.stockIssues.length > 0 && <p className="mt-3 text-text-muted" role="status">Items in your bag just sold out.</p>}
        <Button render={<Link href="/collections/new-drops" />} nativeButton={false} className="mt-6 h-11 px-6">Shop new drops</Button>
      </div>
    );
  }
  // Remount the form when the server-side bag changes (e.g. after a stock adjustment + router.refresh()).
  const key = view.lines.map((l) => `${l.variantId}:${l.quantity}`).join(",");
  return <CheckoutForm key={key} view={view} provider={paymentProviderName()} />;
}
```

Create `src/components/storefront/checkout/checkout-form.tsx` (client). Responsibilities and markup:

- Props `{ view: CheckoutView; provider: ProviderName }`. State: `addresses` (from `view.addresses`), `selectedId` (default address id, else first, else `null`), `adding` (`true` when there are no addresses), `couponInput` (""), `appliedCode` (`string | null`), `couponError` (`string | null`), `price` (`view.price`), `note` (""), `pending` via `useTransition`. `const router = useRouter()`.
- Root: `<div className="container-x grid gap-8 pb-36 pt-6 lg:grid-cols-[1fr_380px] lg:gap-12 lg:pb-12" data-testid="checkout-page">`; `h1` "Checkout" (`text-4xl md:text-6xl`). Everything is one column at 360 px.
- **Stock banner** (when `view.stockIssues.length`): `role="status"` panel listing "`name`: only `available` left, we updated your bag" (or "sold out, removed").
- **Deliver to** `<fieldset>` with `<legend>`: each saved address is `<label data-testid="address-option" className="flex min-h-11 cursor-pointer gap-3 rounded-md border border-border p-4 has-[:checked]:border-brand">` containing `<input type="radio" name="address" className="mt-1 size-5 accent-brand" checked={selectedId === a.id} onChange={() => setSelectedId(a.id)} />` and the name, `addressLines(a)`, `formatPhone(a.phone)`. Below: **Add a new address** (`Button variant="secondary" className="h-11"`, text exactly "Add a new address") toggles `<AddressForm forceDefault={addresses.length === 0} onSaved={(a) => { setAddresses((l) => [a, ...l.map((x) => (a.isDefault ? { ...x, isDefault: false } : x))]); setSelectedId(a.id); setAdding(false); }} onCancel={addresses.length ? () => setAdding(false) : undefined} />`, plus a "Manage addresses" link to `/account/addresses`.
- **Your bag**: the line list, collapsed under `lg` to the first two lines with a "Show all N items" toggle button (`h-11`, `aria-expanded`); always fully shown at `lg`. Each line: 56 px thumbnail using `next/image` exactly like `cart-line.tsx`, name, `colorName / size`, `× quantity`, line total. Link "Edit bag" → `/cart`.
- **Coupon**: `<Label htmlFor="coupon">Coupon code</Label>`, `<Input id="coupon" className="h-11 uppercase" autoCapitalize="characters" autoComplete="off" aria-describedby="coupon-msg" aria-invalid={Boolean(couponError)} />` and **Apply** (`h-11`). Apply → `start(async () => { const r = await quoteCheckoutAction(couponInput); if (!r.ok) return setCouponError(r.message); setPrice(r.data); if (r.data.couponError) { setCouponError(r.data.couponError); setAppliedCode(null); } else { setCouponError(null); setAppliedCode(couponInput.trim().toUpperCase()); } })`. When applied, the input is replaced by a chip "`CODE` applied" with a **Remove** button (`aria-label={`Remove code ${code}`}`, `h-11`) which re-quotes with `null`. `<p id="coupon-msg" role="alert" aria-live="polite">` shows `couponError` in `text-danger`.
- **Offer / coupon notice** (`data-testid="discount-notice"`, `aria-live="polite"`): if a code is applied but `price.applied === "offer"` and `price.coupon`: "Your code {code} saves {₹}, but the “{offer.label}” offer saves more, so we applied the offer." Else if `price.applied === "offer"`: "Offer applied: {label} (−₹x)". Else if `price.applied === "coupon"`: "Code {code} applied (−₹x)". Else nothing.
- **Note**: `<label htmlFor="note">Note for us (optional)</label>` + `<textarea id="note" maxLength={300} rows={3} className="w-full rounded-md border border-input bg-bg p-3 text-base">` + counter `{note.length}/300`.
- **Summary** `<aside className="h-fit space-y-4 rounded-md border border-border bg-surface p-5 lg:sticky lg:top-24">`: `<PriceBreakup … discountLabel={discountLabel(price)} />` and a free-shipping hint when `price.shippingPaise > 0`: "Add ₹x more for free delivery" (`view.freeShippingThresholdPaise - (price.subtotalPaise - price.discountPaise)`).
- **Pay bar** — one element, fixed on mobile, inline on desktop: `<div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0">` containing a row "Total" + `formatPaise(price.totalPaise)` (mobile only, `lg:hidden`) and `<Button data-testid="pay-button" size="lg" className="h-12 w-full font-display text-lg tracking-wide" disabled={pending || !selectedId || adding}>` labelled `Pay {formatPaise(price.totalPaise)}` (or "Starting payment…" while pending); under it `provider === "mock" ? "Test mode: no real money moves." : "Secure payment by Razorpay: UPI, cards, netbanking, wallets."` in `text-xs text-text-muted`.
- **Pay** handler: `start(async () => { const r = await placeOrderAction({ addressId: selectedId!, couponCode: appliedCode, customerNote: note }); if (!r.ok) { if (r.fieldErrors?.couponCode) { setCouponError(r.fieldErrors.couponCode[0]); setAppliedCode(null); } toast.error(r.message); router.refresh(); return; } try { await startPayment(r.data, router); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not open the payment window"); router.push(orderStatusUrl(r.data.number, "dismissed")); } })`.
- Accessibility: every control has a visible label; the radio group is a `fieldset/legend`; errors use `role="alert"`; the pay button's disabled reason is shown as helper text ("Choose or add a delivery address") when `!selectedId`.

- [ ] **Step 7: Mock pay page and order status page**

Create `src/app/(storefront)/checkout/mock-pay/[orderId]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { mockPayAction } from "@/app/(storefront)/checkout/actions";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { auth } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { isMockPayments } from "@/server/payments";
import { getOwnedOrderRef } from "@/server/services/checkout";

export const metadata: Metadata = { title: "Test payment", robots: { index: false } };

export default async function MockPayPage({ params }: { params: Promise<{ orderId: string }> }) {
  if (!isMockPayments()) notFound();
  const { orderId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=${encodeURIComponent(`/checkout/mock-pay/${orderId}`)}`);
  const order = await getOwnedOrderRef(session.user.id, orderId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  if (order.status !== "PENDING_PAYMENT") redirect(`/orders/${encodeURIComponent(order.number)}/success`);
  return (
    <div className="container-x flex min-h-[60dvh] items-center justify-center py-10">
      <div className="w-full max-w-sm space-y-6 rounded-md border border-dashed border-border bg-surface p-6 text-center" data-testid="mock-pay">
        <p className="text-xs uppercase tracking-widest text-text-muted">Test payment · no money moves</p>
        <p className="font-display text-4xl">{formatPaise(order.totalPaise)}</p>
        <p className="text-sm text-text-muted">Order {order.number}</p>
        <form action={mockPayAction.bind(null, order.id, "succeed")}>
          <Button type="submit" className="h-12 w-full" data-testid="mock-pay-succeed">Pay successfully</Button>
        </form>
        <form action={mockPayAction.bind(null, order.id, "fail")}>
          <Button type="submit" variant="secondary" className="h-12 w-full" data-testid="mock-pay-fail">Fail the payment</Button>
        </form>
      </div>
    </div>
  );
}
```

Create `src/app/(storefront)/orders/[number]/success/page.tsx` (server). Behaviour:
- `auth()`; signed out → `redirect("/login?next=" + encodeURIComponent(path))`. `getOrderForUser(userId, number)`; `NotFoundError` → `notFound()`. `searchParams.payment` is `"failed" | "dismissed" | "verifying" | undefined`.
- **Paid-like** (`isPaidStatus`): `<section data-testid="order-success">` with a check icon, `h1` "Order confirmed", `<p data-testid="order-number" className="font-display text-3xl">{order.number}</p>`, "We emailed a confirmation to {order.email}.", item list (thumbnail, name, variant, qty, line total), `<PriceBreakup … discountLabel={orderDiscountLabel(order)} />`, the ship-to block (`addressLines`), buttons (`h-11`) **View order** → `/account/orders/{number}` and **Keep shopping** → `/collections/new-drops`.
- **PENDING_PAYMENT** with `payment` undefined or `"verifying"`: "Confirming your payment…" with a spinner, `<AutoRefresh />`, and the note "This takes a few seconds. You can safely leave; we will email you when it is confirmed."
- **PENDING_PAYMENT** with `"failed"`/`"dismissed"`: `h1` "Payment not completed", "Your items are held until {formatTimeIst(order.expiresAt)}." and `<RetryPaymentButton number={order.number} />`, plus "Back to bag" link.
- **EXPIRED / CANCELLED**: "This order was not paid in time" / "This order was cancelled", with "Back to bag".
- **REFUNDED**: "This order was refunded."
- Mobile: single column, `container-x max-w-2xl py-10`, buttons full width under `sm`.

- [ ] **Step 8: Cart drawer and bag page preview**

- `src/components/storefront/free-shipping-bar.tsx`: add optional prop `thresholdPaise?: number` (default `BRAND.freeShippingThresholdPaise`) and use it instead of the constant.
- `src/components/storefront/cart-panel.tsx`: add optional prop `preview?: CartPricingPreview | null` (type-only import from `@/server/services/checkout`). When `preview?.discountPaise`, render above the subtotal a row `<p data-testid="cart-offer" className="text-sm text-brand">{preview.offerLabel}: −{formatPaise(preview.discountPaise)}</p>`; pass `subtotalPaise={preview?.discountedSubtotalPaise ?? cart.subtotalPaise}` and `thresholdPaise={preview?.freeShippingThresholdPaise}` to `FreeShippingBar`; change the helper text to "Taxes included. Coupons and shipping at checkout." Make the Checkout button `h-12`.
- `src/app/(storefront)/layout.tsx`: after loading `cart`, `const preview = cart.itemCount > 0 ? await getCurrentCartPreview() : null;` and pass `preview` to the drawer's `CartPanel`.
- `src/app/(storefront)/cart/page.tsx`: same, for the page variant.

- [ ] **Step 9: Update the Phase 1 e2e expectations**

In `tests/e2e/product-cart.spec.ts` replace the "checkout placeholder shows the bag summary" test with:

```ts
test("checkout asks guests to log in and keeps the destination", async ({ page }) => {
  await addFirstProductToBag(page);
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/);
});
```

and in "clicking checkout in the drawer navigates and closes the drawer" change the URL assertion to `await expect(page).toHaveURL(/(\/checkout|next=%2Fcheckout)/);` (guests are now redirected to log in).

- [ ] **Step 10: Verify and commit**

Run the three new test files (GREEN), then the full gate. Manual check on port 3001 (mock provider): as a signed-in user with items, open `/checkout` at 360 px and at desktop width: add an address, apply an invalid code (inline error), apply a valid code created with `npx prisma studio` or SQL, remove it, pay → mock page → **Pay successfully** → status page shows "Order confirmed"; repeat with **Fail the payment** → "Payment not completed" → **Retry payment** reaches the mock page again. Confirm the pay bar stays visible on mobile without covering content and there is no horizontal scroll. Stop the server.

```bash
git add src/lib/dates.ts src/server/services/checkout.ts src/server/cart-ref.ts "src/app/(storefront)/checkout" "src/app/(storefront)/orders" "src/app/(storefront)/layout.tsx" "src/app/(storefront)/cart/page.tsx" src/components/storefront/checkout src/components/storefront/price-breakup.tsx src/components/storefront/cart-panel.tsx src/components/storefront/free-shipping-bar.tsx src/app/api/payments src/app/api/webhooks src/app/api/v1/checkout tests/unit/dates.test.ts tests/unit/checkout.test.ts tests/unit/payment-routes.test.ts tests/e2e/product-cart.spec.ts
git commit -m "feat(checkout): add checkout with Razorpay and mock payments, verification, webhook and order status page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 8: Account orders, GST invoice (customer print view), orders API

**Files:**
- Create: `src/lib/gst.ts`, `src/components/print/invoice-document.tsx`, `src/components/print/print-toolbar.tsx`, `src/components/print/page-size.tsx`, `src/app/invoice/[number]/page.tsx`, `src/app/(storefront)/account/orders/page.tsx`, `src/app/(storefront)/account/orders/[number]/page.tsx`, `src/components/storefront/account/order-status-pill.tsx`, `src/components/storefront/account/order-stepper.tsx`, `src/components/storefront/account/order-card.tsx`, `src/app/api/v1/orders/route.ts`, `src/app/api/v1/orders/[number]/route.ts`
- Modify: `src/app/(storefront)/account/page.tsx` (recent orders in the Orders tab), `src/components/storefront/account/account-nav.tsx` (add Orders), `src/app/globals.css` (print rules)
- Test: `tests/unit/gst.test.ts`, `tests/unit/orders-api.test.ts`

**Interfaces:**
- Consumes: `OrderView`, `OrderSummary`, `orderDiscountLabel`, `getOrderForUser`, `listOrdersForUser` (Task 5), `getSettings`, `StoreSettings` (Task 1), `isPaidStatus`, `ORDER_STATUS_LABEL` (Task 1), `addressLines`, `formatPhone` (Task 3), `PriceBreakup`, `RetryPaymentButton`, `formatDateIst`, `formatDateTimeIst` (Task 7), `AccountNav` (Task 3), `BRAND`.
- Produces:

```ts
// @/lib/gst
export const HSN_TSHIRT = "6109"; export const SAC_SHIPPING = "9965";
export interface GstSettings { gstRateLowPct: number; gstRateHighPct: number; gstThresholdPaise: number; sellerState: string }
export interface InvoiceItemInput { description: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }
export interface InvoiceLine { description: string; hsn: string; quantity: number; ratePct: number; grossPaise: number; discountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }
export interface InvoiceTotals { grossPaise: number; discountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }
export interface Invoice { intraState: boolean; lines: InvoiceLine[]; totals: InvoiceTotals }
export function gstRateFor(unitPricePaise: number, s: GstSettings): number;
export function splitInclusive(grossPaise: number, ratePct: number): { taxablePaise: number; taxPaise: number };
export function allocateDiscount(amounts: number[], discountPaise: number): number[];     // proportional, largest remainder, sums exactly
export function buildInvoice(args: { items: InvoiceItemInput[]; discountPaise: number; shippingPaise: number; shipState: string; settings: GstSettings }): Invoice;
export function invoiceFromOrder(order: OrderView, settings: GstSettings): Invoice;
// components
export function InvoiceDocument(props: { order: OrderView; settings: StoreSettings }): JSX.Element;   // A4, class "print-page"
export function PrintToolbar(props: { backHref: string; backLabel?: string; autoPrint?: boolean }): JSX.Element;
export function PageSize(props: { size: string; margin: string }): JSX.Element;                    // <style>@page{…}</style>
export function OrderStatusPill(props: { status: OrderStatus }): JSX.Element;
export function OrderStepper(props: { order: OrderView }): JSX.Element;
export function OrderCard(props: { order: OrderSummary }): JSX.Element;
// routes: GET /api/v1/orders?page=, GET /api/v1/orders/[number]; pages /account/orders, /account/orders/[number], /invoice/[number]
```

Invoice rules (spec §2 Tax): prices are GST-inclusive; tax is extracted per line. Rate per line = `gstRateLowPct` when the **unit price** ≤ `gstThresholdPaise`, else `gstRateHighPct`; HSN `6109`. The order discount is allocated to item lines in proportion to their totals (largest remainder, exact). Shipping is its own line (SAC `9965`) taxed at the highest item rate. `taxable = round(net × 100 / (100 + rate))`, `tax = net − taxable`. Intra-state (seller state = ship state, seller state set) → CGST = ⌊tax/2⌋, SGST = the rest; otherwise IGST. The invoice total always equals the order total. Invoice number = order number; invoice date = `paidAt`.

- [ ] **Step 1: Failing tests**

Create `tests/unit/gst.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allocateDiscount, buildInvoice, gstRateFor, splitInclusive } from "@/lib/gst";

const settings = { gstRateLowPct: 5, gstRateHighPct: 18, gstThresholdPaise: 250000, sellerState: "Tamil Nadu" };

describe("GST helpers", () => {
  it("picks the rate by unit price with an inclusive threshold", () => {
    expect(gstRateFor(250000, settings)).toBe(5);
    expect(gstRateFor(250001, settings)).toBe(18);
  });

  it("extracts tax from inclusive amounts", () => {
    expect(splitInclusive(105000, 5)).toEqual({ taxablePaise: 100000, taxPaise: 5000 });
    expect(splitInclusive(59900, 5)).toEqual({ taxablePaise: 57048, taxPaise: 2852 });
  });

  it("allocates a discount exactly by largest remainder", () => {
    expect(allocateDiscount([59900, 40100], 10000)).toEqual([5990, 4010]);
    expect(allocateDiscount([1, 1, 1], 2)).toEqual([1, 1, 0]);
    expect(allocateDiscount([100], 500)).toEqual([100]);
    expect(allocateDiscount([0, 0], 10)).toEqual([0, 0]);
  });
});

describe("buildInvoice", () => {
  it("splits CGST and SGST within the seller's state and keeps the order total", () => {
    const inv = buildInvoice({
      items: [{ description: "Tee (Black / M)", quantity: 2, unitPricePaise: 59900, lineTotalPaise: 119800 }],
      discountPaise: 19900, shippingPaise: 0, shipState: "Tamil Nadu", settings,
    });
    expect(inv.intraState).toBe(true);
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]).toMatchObject({ hsn: "6109", ratePct: 5, grossPaise: 119800, discountPaise: 19900, taxablePaise: 95143, cgstPaise: 2378, sgstPaise: 2379, igstPaise: 0, totalPaise: 99900 });
    expect(inv.totals.totalPaise).toBe(99900);
  });

  it("uses IGST across states and taxes shipping at the highest item rate", () => {
    const inv = buildInvoice({
      items: [{ description: "Premium Tee", quantity: 1, unitPricePaise: 300000, lineTotalPaise: 300000 }],
      discountPaise: 0, shippingPaise: 7900, shipState: "Karnataka", settings,
    });
    expect(inv.intraState).toBe(false);
    expect(inv.lines[0]).toMatchObject({ ratePct: 18, taxablePaise: 254237, igstPaise: 45763, cgstPaise: 0 });
    expect(inv.lines[1]).toMatchObject({ description: "Shipping charges", hsn: "9965", ratePct: 18, taxablePaise: 6695, igstPaise: 1205 });
    expect(inv.totals).toMatchObject({ igstPaise: 46968, totalPaise: 307900 });
  });

  it("treats an unset seller state as inter-state", () => {
    const inv = buildInvoice({ items: [{ description: "Tee", quantity: 1, unitPricePaise: 59900, lineTotalPaise: 59900 }], discountPaise: 0, shippingPaise: 0, shipState: "", settings: { ...settings, sellerState: "" } });
    expect(inv.intraState).toBe(false);
  });
});
```

Create `tests/unit/orders-api.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createOrderRow, createUser } from "../helpers/fixtures";
import { signApiToken } from "@/server/api-token";
import { GET as listOrders } from "@/app/api/v1/orders/route";
import { GET as getOrder } from "@/app/api/v1/orders/[number]/route";

const BASE = "http://localhost:3000";

describe("/api/v1/orders", () => {
  beforeEach(resetDb);

  it("lists and reads only the caller's orders", async () => {
    const u = await createUser();
    const other = await createUser();
    const mine = await createOrderRow(u.id, { number: "ORD-1001" });
    await createOrderRow(other.id, { number: "ORD-1002" });
    const headers = { authorization: `Bearer ${await signApiToken({ id: u.id, role: "CUSTOMER" })}` };
    const list = await (await listOrders(new NextRequest(`${BASE}/api/v1/orders`, { headers }), { params: Promise.resolve({}) })).json();
    expect(list.data.items.map((o: { number: string }) => o.number)).toEqual([mine.number]);
    const one = await getOrder(new NextRequest(`${BASE}/api/v1/orders/ORD-1001`, { headers }), { params: Promise.resolve({ number: "ORD-1001" }) });
    expect((await one.json()).data.ship.city).toBe("Bengaluru");
    const theirs = await getOrder(new NextRequest(`${BASE}/api/v1/orders/ORD-1002`, { headers }), { params: Promise.resolve({ number: "ORD-1002" }) });
    expect(theirs.status).toBe(404);
  });
});
```

Run: `npm test -- tests/unit/gst.test.ts tests/unit/orders-api.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: GST library**

Create `src/lib/gst.ts`:

```ts
import type { OrderView } from "@/server/services/order-records";

export const HSN_TSHIRT = "6109";
export const SAC_SHIPPING = "9965";

export interface GstSettings { gstRateLowPct: number; gstRateHighPct: number; gstThresholdPaise: number; sellerState: string }
export interface InvoiceItemInput { description: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }
export interface InvoiceLine {
  description: string; hsn: string; quantity: number; ratePct: number; grossPaise: number; discountPaise: number;
  taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number;
}
export interface InvoiceTotals { grossPaise: number; discountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }
export interface Invoice { intraState: boolean; lines: InvoiceLine[]; totals: InvoiceTotals }

export function gstRateFor(unitPricePaise: number, s: GstSettings): number {
  return unitPricePaise <= s.gstThresholdPaise ? s.gstRateLowPct : s.gstRateHighPct;
}

export function splitInclusive(grossPaise: number, ratePct: number): { taxablePaise: number; taxPaise: number } {
  const taxablePaise = Math.round((grossPaise * 100) / (100 + ratePct));
  return { taxablePaise, taxPaise: grossPaise - taxablePaise };
}

export function allocateDiscount(amounts: number[], discountPaise: number): number[] {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (total <= 0 || discountPaise <= 0) return amounts.map(() => 0);
  const d = Math.min(discountPaise, total);
  const raw = amounts.map((a) => (a * d) / total);
  const out = raw.map((r) => Math.floor(r));
  let rest = d - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i] += 1;
    rest -= 1;
  }
  return out;
}

export function buildInvoice(args: { items: InvoiceItemInput[]; discountPaise: number; shippingPaise: number; shipState: string; settings: GstSettings }): Invoice {
  const { items, settings } = args;
  const intraState = settings.sellerState !== "" && settings.sellerState === args.shipState;
  const discounts = allocateDiscount(items.map((i) => i.lineTotalPaise), args.discountPaise);
  const rows = items.map((it, i) => ({
    description: it.description, hsn: HSN_TSHIRT, quantity: it.quantity, ratePct: gstRateFor(it.unitPricePaise, settings),
    grossPaise: it.lineTotalPaise, discountPaise: discounts[i],
  }));
  if (args.shippingPaise > 0) {
    rows.push({ description: "Shipping charges", hsn: SAC_SHIPPING, quantity: 1, ratePct: Math.max(0, ...rows.map((r) => r.ratePct)), grossPaise: args.shippingPaise, discountPaise: 0 });
  }
  const lines: InvoiceLine[] = rows.map((r) => {
    const net = r.grossPaise - r.discountPaise;
    const { taxablePaise, taxPaise } = splitInclusive(net, r.ratePct);
    const cgstPaise = intraState ? Math.floor(taxPaise / 2) : 0;
    const sgstPaise = intraState ? taxPaise - cgstPaise : 0;
    return { ...r, taxablePaise, cgstPaise, sgstPaise, igstPaise: intraState ? 0 : taxPaise, totalPaise: net };
  });
  const sum = (k: keyof InvoiceTotals) => lines.reduce((s, l) => s + l[k], 0);
  return {
    intraState,
    lines,
    totals: { grossPaise: sum("grossPaise"), discountPaise: sum("discountPaise"), taxablePaise: sum("taxablePaise"), cgstPaise: sum("cgstPaise"), sgstPaise: sum("sgstPaise"), igstPaise: sum("igstPaise"), totalPaise: sum("totalPaise") },
  };
}

export function invoiceFromOrder(order: OrderView, settings: GstSettings): Invoice {
  return buildInvoice({
    items: order.items.map((i) => ({ description: `${i.productName} (${i.colorName} / ${i.size}) · ${i.sku}`, quantity: i.quantity, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise })),
    discountPaise: order.discountPaise, shippingPaise: order.shippingPaise, shipState: order.ship.state, settings,
  });
}
```

(`import type` from `order-records` keeps `src/lib` client-safe: it is erased at compile time.)

- [ ] **Step 3: Print building blocks**

Append to `src/app/globals.css`:

```css
@media print {
  html, body { background: #fff !important; color: #000 !important; }
  .print-page { break-after: page; }
  .print-page:last-child { break-after: auto; }
  .no-print { display: none !important; }
}
```

Create `src/components/print/page-size.tsx`:

```tsx
export function PageSize({ size, margin }: { size: string; margin: string }) {
  return <style>{`@page { size: ${size}; margin: ${margin}; }`}</style>;
}
```

Create `src/components/print/print-toolbar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar({ backHref, backLabel = "Back", autoPrint = false }: { backHref: string; backLabel?: string; autoPrint?: boolean }) {
  useEffect(() => {
    // Skip in automated browsers so e2e runs never block on the print dialog.
    if (!autoPrint || navigator.webdriver) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint]);
  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-bg p-3 print:hidden" data-testid="print-toolbar">
      <Link href={backHref} className="inline-flex min-h-11 items-center px-2 text-sm text-text-muted hover:text-text">← {backLabel}</Link>
      <Button onClick={() => window.print()} className="ml-auto h-11 px-5"><Printer className="size-4" /> Print</Button>
    </div>
  );
}
```

Create `src/components/print/invoice-document.tsx` (server component, no hooks; black on white regardless of the dark theme):

```tsx
import { BRAND } from "@/config/brand";
import { addressLines, formatPhone } from "@/lib/address-format";
import { formatDateIst } from "@/lib/dates";
import { invoiceFromOrder } from "@/lib/gst";
import { formatPaise } from "@/lib/money";
import type { OrderView } from "@/server/services/order-records";
import type { StoreSettings } from "@/server/services/settings";

const rupees = (p: number) => (p / 100).toFixed(2);

export function InvoiceDocument({ order, settings }: { order: OrderView; settings: StoreSettings }) {
  const inv = invoiceFromOrder(order, settings);
  const title = settings.gstin ? "Tax Invoice" : "Invoice";
  return (
    <article className="print-page mx-auto w-full max-w-[210mm] bg-white p-6 text-[12px] leading-snug text-black sm:p-10" data-testid="invoice">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/20 pb-4">
        <div>
          <p className="text-xl font-bold uppercase">{settings.sellerName || BRAND.name}</p>
          <p className="whitespace-pre-line">{settings.sellerAddress}</p>
          {settings.sellerState && <p>State: {settings.sellerState}</p>}
          {settings.gstin && <p>GSTIN: {settings.gstin}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{title}</p>
          <p>Invoice no: {order.number}</p>
          <p>Date: {formatDateIst(order.paidAt ?? order.createdAt)}</p>
          <p>Place of supply: {order.ship.state}</p>
        </div>
      </header>
      <section className="grid gap-4 border-b border-black/20 py-4 sm:grid-cols-2">
        <div>
          <p className="font-bold">Bill to / Ship to</p>
          <p>{order.ship.name}</p>
          {addressLines(order.ship).map((l) => <p key={l}>{l}</p>)}
          <p>Phone: {formatPhone(order.ship.phone)}</p>
          <p>{order.email}</p>
        </div>
      </section>
      <div className="overflow-x-auto">
        <table className="mt-4 w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-black/40 text-left">
              <th className="py-1 pr-2">#</th><th className="pr-2">Description</th><th className="pr-2">HSN/SAC</th><th className="pr-2 text-right">Qty</th>
              <th className="pr-2 text-right">Gross</th><th className="pr-2 text-right">Discount</th><th className="pr-2 text-right">Taxable</th>
              {inv.intraState ? <><th className="pr-2 text-right">CGST</th><th className="pr-2 text-right">SGST</th></> : <th className="pr-2 text-right">IGST</th>}
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-black/10 align-top">
                <td className="py-1 pr-2">{i + 1}</td><td className="pr-2">{l.description}</td><td className="pr-2">{l.hsn}</td><td className="pr-2 text-right">{l.quantity}</td>
                <td className="pr-2 text-right">{rupees(l.grossPaise)}</td><td className="pr-2 text-right">{rupees(l.discountPaise)}</td><td className="pr-2 text-right">{rupees(l.taxablePaise)}</td>
                {inv.intraState
                  ? <><td className="pr-2 text-right">{rupees(l.cgstPaise)} <span className="text-black/60">({l.ratePct / 2}%)</span></td><td className="pr-2 text-right">{rupees(l.sgstPaise)} <span className="text-black/60">({l.ratePct / 2}%)</span></td></>
                  : <td className="pr-2 text-right">{rupees(l.igstPaise)} <span className="text-black/60">({l.ratePct}%)</span></td>}
                <td className="text-right">{rupees(l.totalPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={6} className="pt-2 text-right pr-2">Totals</td>
              <td className="pt-2 pr-2 text-right">{rupees(inv.totals.taxablePaise)}</td>
              {inv.intraState ? <><td className="pt-2 pr-2 text-right">{rupees(inv.totals.cgstPaise)}</td><td className="pt-2 pr-2 text-right">{rupees(inv.totals.sgstPaise)}</td></> : <td className="pt-2 pr-2 text-right">{rupees(inv.totals.igstPaise)}</td>}
              <td className="pt-2 text-right">{rupees(inv.totals.totalPaise)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-4 text-right text-base font-bold">Amount paid: {formatPaise(order.totalPaise)}</p>
      <footer className="mt-6 space-y-1 border-t border-black/20 pt-3 text-black/70">
        <p>All prices are inclusive of GST. Amounts in ₹.</p>
        {order.providerPaymentId && <p>Payment reference: {order.providerPaymentId}</p>}
        <p>This is a computer-generated invoice and does not need a signature.</p>
      </footer>
    </article>
  );
}
```

- [ ] **Step 4: Customer invoice route (outside the storefront chrome)**

Create `src/app/invoice/[number]/page.tsx` (root layout only, so no header/footer):

```tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { InvoiceDocument } from "@/components/print/invoice-document";
import { PageSize } from "@/components/print/page-size";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { isPaidStatus } from "@/lib/order-status";
import { auth } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getOrderForUser } from "@/server/services/orders";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

export default async function InvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=${encodeURIComponent(`/invoice/${number}`)}`);
  const order = await getOrderForUser(session.user.id, number).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  if (!isPaidStatus(order.status) && order.status !== "REFUNDED") notFound();
  const settings = await getSettings();
  return (
    <div className="min-h-dvh bg-neutral-200 print:bg-white">
      <PageSize size="A4" margin="12mm" />
      <PrintToolbar backHref={`/account/orders/${encodeURIComponent(order.number)}`} backLabel="Order" />
      <div className="p-2 sm:p-6 print:p-0"><InvoiceDocument order={order} settings={settings} /></div>
    </div>
  );
}
```

- [ ] **Step 5: Account order pages and components**

`src/components/storefront/account/order-status-pill.tsx`: `<span data-testid="order-status" className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide …">{ORDER_STATUS_LABEL[status]}</span>` with tones: PENDING_PAYMENT amber (`bg-amber-500/15 text-amber-300`), PAID/PROCESSING `bg-surface-raised text-text`, SHIPPED/DELIVERED `bg-brand text-brand-ink`, CANCELLED/EXPIRED/REFUNDED `border border-border text-text-muted`.

`src/components/storefront/account/order-card.tsx`: a `Link` to `/account/orders/{number}` with `data-testid="account-order-row"`, `className="flex min-h-11 items-center gap-4 rounded-md border border-border bg-surface p-4 hover:border-text-muted"`: 56 px thumbnail (`next/image`, `firstImageUrl`, neutral block when null), then `number` (font-medium) and `formatDateIst(createdAt) · {itemCount} item(s)` (muted), then on the right `OrderStatusPill` above `formatPaise(totalPaise)`. Wraps cleanly at 360 px (`min-w-0` + `truncate` on the name column).

`src/components/storefront/account/order-stepper.tsx` (server): `data-testid="order-stepper"`, `<ol aria-label="Order progress">` with four steps **Confirmed** (`paidAt`), **Packed** (`processingAt`), **Shipped** (`shippedAt`), **Delivered** (`deliveredAt`). A step is done when its timestamp is set (or a later one is); the current step has `aria-current="step"`. Each step shows its date via `formatDateIst`. Vertical list on mobile (`flex-col`), horizontal with connecting bars from `sm`. For `PENDING_PAYMENT` all steps are pending. For `CANCELLED`/`EXPIRED`/`REFUNDED` render a single status panel instead ("Cancelled on …", "Not paid in time", "Refunded on …").

Create `src/app/(storefront)/account/orders/page.tsx`: auth guard (`redirect("/login?next=%2Faccount%2Forders")`), `h1` "Orders", `<AccountNav />`, `listOrdersForUser(userId, { page })` (page from `searchParams.page`, default 1, pageSize 10); list of `OrderCard`s in a `<ul className="space-y-3">`; **Newer / Older** pagination links (`min-h-11`) when applicable; empty state `data-testid="orders-empty"` "No orders yet" with "Browse new drops".

Create `src/app/(storefront)/account/orders/[number]/page.tsx`:
- Auth guard (next = this path); `getOrderForUser` (`NotFoundError` → `notFound()`); `getSettings()` only for the support line.
- Header: back link "← Orders", `h1` with the order number, `OrderStatusPill`, "Placed {formatDateTimeIst(createdAt)}".
- If `PENDING_PAYMENT` and `expiresAt > now`: amber panel (`role="status"`) "Payment not completed. Your items are held until {formatTimeIst(expiresAt)}." + `<RetryPaymentButton number={…} />`. When `searchParams.payment === "failed"` add "The last attempt failed. No money was taken." first.
- `<OrderStepper order={order} />`.
- Tracking card when `trackingNumber`: carrier, number (selectable, `font-mono`), and when `trackingUrl` is `http(s)` a `Button` link "Track parcel" (`target="_blank" rel="noopener noreferrer"`, `h-11`).
- Items list (thumbnail, name linked to `/products/{productSlug}`, `colorName / size`, qty, line total).
- `<PriceBreakup … discountLabel={orderDiscountLabel(order)} />`.
- "Delivering to" block with `addressLines` + phone; the customer note if any.
- When paid-like or refunded: `Button` link **Download invoice** → `/invoice/{number}` (`target="_blank"`, `data-testid="invoice-link"`, `h-11`).
- Footer: "Need help? Email {BRAND.supportEmail} with your order number."
- Layout: single column under `lg`; `lg:grid-cols-[1fr_340px]` with the price/address column on the right.

`src/app/(storefront)/account/page.tsx`: in the **Orders** tab replace the placeholder with the three most recent orders (`listOrdersForUser(userId, { pageSize: 3 })`) rendered as `OrderCard`s plus a "View all orders" link to `/account/orders`; keep `data-testid="orders-empty"` for the empty state (copy: "No orders yet. Your orders and tracking links will live here.").

`src/components/storefront/account/account-nav.tsx`: insert **Orders** `/account/orders` between Overview and Addresses.

- [ ] **Step 6: API**

Create `src/app/api/v1/orders/route.ts`:

```ts
import { handle, ok, requireApiUser } from "@/server/api";
import { listOrdersForUser } from "@/server/services/orders";

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1") || 1;
  return ok(await listOrdersForUser(user.id, { page }));
});
```

Create `src/app/api/v1/orders/[number]/route.ts`:

```ts
import { handle, ok, requireApiUser } from "@/server/api";
import { getOrderForUser } from "@/server/services/orders";

export const GET = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { number } = await ctx.params;
  return ok(await getOrderForUser(user.id, number));
});
```

- [ ] **Step 7: Verify and commit**

Run the two new test files (GREEN), then the full gate. Manual check on port 3001: place and pay a mock order, open `/account/orders` and the detail at 360 px (stepper vertical, no horizontal scroll, the invoice table scrolls inside its own box), open `/invoice/ORD-…`, print preview shows only the invoice on white A4. Stop the server.

```bash
git add src/lib/gst.ts src/components/print src/app/invoice "src/app/(storefront)/account" src/components/storefront/account src/app/api/v1/orders src/app/globals.css tests/unit/gst.test.ts tests/unit/orders-api.test.ts
git commit -m "feat(account): add order history, order detail with stepper and GST invoice

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 9: Admin orders — list with tabs/search/bulk, detail with quick actions, tracking, notes, timeline, contact links, cancel/refund, CSV, nav badge

**Files:**
- Create: `src/lib/carriers.ts`, `src/lib/contact-links.ts`, `src/lib/csv.ts`, `src/lib/order-tabs.ts`, `src/lib/validation/orders.ts`, `src/server/services/admin-orders.ts`, `src/app/admin/orders/page.tsx`, `src/app/admin/orders/[id]/page.tsx`, `src/app/admin/orders/actions.ts`, `src/app/admin/orders/export/route.ts`, `src/components/admin/orders/order-status-badge.tsx`, `src/components/admin/orders/orders-table.tsx`, `src/components/admin/orders/order-actions.tsx`, `src/components/admin/orders/tracking-form.tsx`, `src/components/admin/orders/admin-note-form.tsx`, `src/components/admin/orders/order-timeline.tsx`, `src/components/admin/copy-button.tsx`
- Modify: `src/components/admin/admin-nav.tsx` (Orders item, badge, mobile scroll), `src/app/admin/layout.tsx` (pass the to-ship count)
- Test: `tests/unit/carriers.test.ts`, `tests/unit/contact-links.test.ts`, `tests/unit/csv.test.ts`, `tests/unit/admin-orders.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `requireAdminPage`, `OrderView`, `orderWithItems`, `toOrderView`, `addOrderEvent`, `orderDiscountLabel` (Task 5), `cancelOrder`, `placeOrder`, `markOrderPaid` (Task 5), `notifyOrder` (Task 6), `getPaymentProvider`, `paymentProviderName` (Task 4), `PAID_STATUSES`, `fulfilmentRank`, `nextFulfilmentStatus`, `ORDER_STATUS_LABEL`, `FulfilmentStatus` (Task 1), `addressText`, `addressLines`, `formatPhone` (Task 3), `formatDateIst`, `formatDateTimeIst` (Task 7), `PriceBreakup` (Task 7), `paiseToRupees`, `formatPaise`, `Page`, `BRAND`, fixtures.
- Produces:

```ts
// @/lib/carriers
export interface Carrier { id: string; name: string; trackingUrl: string | null }   // "{n}" = tracking number
export const CARRIERS: readonly Carrier[];  export type CarrierId; export const CARRIER_IDS: [CarrierId, ...CarrierId[]];
export function carrierById(id: string): Carrier | undefined;
export function trackingUrlFor(carrierId: string, trackingNumber: string, customUrl?: string | null): string | null;
// @/lib/contact-links
export function telLink(phone10: string): string;                                   // tel:+919876543210
export function whatsappLink(phone10: string, text: string): string;               // https://wa.me/919876543210?text=…
export function orderWhatsappText(args: { number: string; name: string; brand: string }): string;
// @/lib/csv
export type CsvCell = string | number | null | undefined;
export function toCsv(rows: CsvCell[][]): string;                                   // RFC 4180, CRLF, formula-injection safe
// @/lib/order-tabs
export type OrderTab = "to-ship" | "pending" | "shipped" | "delivered" | "closed" | "all";
export const ORDER_TABS: readonly { id: OrderTab; label: string; statuses: readonly OrderStatus[] | null }[];
export function parseOrderTab(s: string | undefined | null): OrderTab;            // default "to-ship"
// @/lib/validation/orders
export const trackingInputSchema; export type TrackingInput = z.input<typeof trackingInputSchema>;   // { carrier, trackingNumber, trackingUrl? }
export const adminNoteSchema: ZodType<string>;                                     // ≤ 2000
export const cancelReasonSchema: ZodType<string>;                                  // ≤ 200
// @/server/services/admin-orders
export interface AdminOrderFilter { tab?: OrderTab; q?: string; attention?: boolean; page?: number; pageSize?: number }
export interface AdminOrderRow { id: string; number: string; createdAt: Date; paidAt: Date | null; status: OrderStatus; needsAttention: boolean; customerName: string; email: string; phone: string; city: string; pincode: string; itemCount: number; totalPaise: number; unshippedDays: number | null }
export interface OrderTabCount { id: OrderTab; label: string; count: number }
export interface AdminOrderList extends Page<AdminOrderRow> { tabs: OrderTabCount[]; attentionCount: number; activeTab: OrderTab }
export interface AdminOrderEvent { id: string; type: string; message: string; createdAt: Date; actorName: string | null }
export interface AdminOrderDetail extends OrderView { needsAttention: boolean; adminNote: string | null; customer: { id: string; name: string | null; email: string; paidOrderCount: number }; events: AdminOrderEvent[] }
export function adminOrderWhere(f: AdminOrderFilter): Prisma.OrderWhereInput;
export function listAdminOrders(f?: AdminOrderFilter, now?: Date): Promise<AdminOrderList>;
export function getAdminOrder(id: string): Promise<AdminOrderDetail>;
export function advanceOrderStatus(id: string, to: FulfilmentStatus, actorId: string | null, opts?: { notify?: boolean }): Promise<void>;
export function saveTracking(id: string, input: unknown, actorId: string | null, opts: { markShipped: boolean }): Promise<void>;
export function setAdminNote(id: string, note: unknown, actorId: string | null): Promise<void>;
export function clearAttention(id: string, actorId: string | null): Promise<void>;
export function bulkMarkProcessing(ids: string[], actorId: string | null): Promise<number>;
export function adminCancelOrder(id: string, reason: unknown, actorId: string | null): Promise<void>;
export function refundOrder(id: string, actorId: string | null): Promise<{ refundId: string | null }>;
export function exportOrdersCsv(sel: AdminOrderFilter & { ids?: string[] }): Promise<string>;
export function countToShip(): Promise<number>;
// src/app/admin/orders/actions.ts — every action: requireAdmin(), service call, revalidatePath("/", "layout"), ActionResult
export function advanceStatusAction(id: string, to: FulfilmentStatus): Promise<ActionResult<null>>;
export function saveTrackingAction(id: string, input: TrackingInput, markShipped: boolean): Promise<ActionResult<null>>;
export function saveAdminNoteAction(id: string, note: string): Promise<ActionResult<null>>;
export function clearAttentionAction(id: string): Promise<ActionResult<null>>;
export function cancelOrderAction(id: string, reason: string): Promise<ActionResult<null>>;
export function refundOrderAction(id: string): Promise<ActionResult<{ refundId: string | null }>>;
export function bulkMarkProcessingAction(ids: string[]): Promise<ActionResult<{ updated: number }>>;
// components
export function AdminNav(props: { toShipCount: number }): JSX.Element;
export function OrderStatusBadge(props: { status: OrderStatus }): JSX.Element;
export function OrdersTable(props: { rows: AdminOrderRow[]; exportQuery: string }): JSX.Element;
export function OrderActions(props: { order: Pick<AdminOrderDetail, "id" | "number" | "status" | "totalPaise" | "providerPaymentId" | "paymentProvider"> }): JSX.Element;
export function TrackingForm(props: { orderId: string; status: OrderStatus; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null }): JSX.Element;
export function AdminNoteForm(props: { orderId: string; note: string | null }): JSX.Element;
export function OrderTimeline(props: { events: AdminOrderEvent[] }): JSX.Element;
export function CopyButton(props: { text: string; label: string; className?: string }): JSX.Element;
```

Rules: "To ship" (PAID + PROCESSING) is the default tab and lists **oldest paid first** (FIFO packing); other tabs list newest first. A search (`q`) looks across **all** statuses (the tab is ignored and "All" is highlighted) by order number, name, email, and, when the query has ≥ 4 digits, phone and pincode. Status only moves forward along PAID → PROCESSING → SHIPPED → DELIVERED (skipping ahead is allowed and fills the skipped timestamps). Shipped and delivered transitions email the customer. Refund uses the provider API when the order was paid through the currently configured provider, otherwise it records a manual refund; it restocks only if the order had not shipped. The nav badge shows the "to ship" count.

- [ ] **Step 1: Failing tests (pure helpers)**

Create `tests/unit/carriers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CARRIERS, carrierById, trackingUrlFor } from "@/lib/carriers";

describe("carriers", () => {
  it("lists the spec's carriers with Other last", () => {
    expect(CARRIERS.map((c) => c.name)).toEqual(["Delhivery", "DTDC", "India Post", "Blue Dart", "Xpressbees", "Ekart", "Shadowfax", "Other"]);
    expect(carrierById("delhivery")?.name).toBe("Delhivery");
    expect(carrierById("nope")).toBeUndefined();
  });

  it("builds tracking URLs from templates, prefers a custom http(s) URL, and returns null otherwise", () => {
    expect(trackingUrlFor("delhivery", "AWB 12/3")).toBe("https://www.delhivery.com/track/package/AWB%2012%2F3");
    expect(trackingUrlFor("other", "X1")).toBeNull();
    expect(trackingUrlFor("other", "X1", "https://track.example.com/X1")).toBe("https://track.example.com/X1");
    expect(trackingUrlFor("delhivery", "X1", "javascript:alert(1)")).toBe("https://www.delhivery.com/track/package/X1");
  });
});
```

Create `tests/unit/contact-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { orderWhatsappText, telLink, whatsappLink } from "@/lib/contact-links";

describe("contact links", () => {
  it("builds tel and wa.me links for Indian mobiles", () => {
    expect(telLink("9876543210")).toBe("tel:+919876543210");
    const text = orderWhatsappText({ number: "ORD-1001", name: "Asha Rao", brand: "Shop" });
    expect(text).toBe("Hi Asha, this is Shop about your order ORD-1001.");
    expect(whatsappLink("9876543210", text)).toBe("https://wa.me/919876543210?text=Hi%20Asha%2C%20this%20is%20Shop%20about%20your%20order%20ORD-1001.");
  });
});
```

Create `tests/unit/csv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("quotes, escapes and neutralises spreadsheet formulas", () => {
    expect(toCsv([["a", "b,c", 'say "hi"', null, 12], ["line\nbreak", "=SUM(A1)", "+91 98765", "-x", "@me"]])).toBe(
      'a,"b,c","say ""hi""",,12\r\n"line\nbreak",\'=SUM(A1),\'+91 98765,\'-x,\'@me\r\n',
    );
  });
});
```

Run: `npm test -- tests/unit/carriers.test.ts tests/unit/contact-links.test.ts tests/unit/csv.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Pure helpers**

Create `src/lib/carriers.ts`:

```ts
export interface Carrier { id: string; name: string; trackingUrl: string | null }

// "{n}" is replaced by the URL-encoded tracking number. Templates are best effort: verify each once with a real
// AWB before launch (README) and edit here if a carrier changes its site. null = no public deep link.
export const CARRIERS = [
  { id: "delhivery", name: "Delhivery", trackingUrl: "https://www.delhivery.com/track/package/{n}" },
  { id: "dtdc", name: "DTDC", trackingUrl: "https://www.dtdc.in/tracking.asp?strCnno={n}" },
  { id: "india-post", name: "India Post", trackingUrl: null },
  { id: "bluedart", name: "Blue Dart", trackingUrl: "https://www.bluedart.com/tracking?trackFor=0&trackNo={n}" },
  { id: "xpressbees", name: "Xpressbees", trackingUrl: "https://www.xpressbees.com/shipment/tracking?awbNo={n}" },
  { id: "ekart", name: "Ekart", trackingUrl: "https://ekartlogistics.com/shipmenttrack/{n}" },
  { id: "shadowfax", name: "Shadowfax", trackingUrl: null },
  { id: "other", name: "Other", trackingUrl: null },
] as const satisfies readonly Carrier[];

export type CarrierId = (typeof CARRIERS)[number]["id"];
export const CARRIER_IDS = CARRIERS.map((c) => c.id) as [CarrierId, ...CarrierId[]];

export function carrierById(id: string): Carrier | undefined {
  return CARRIERS.find((c) => c.id === id);
}

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u).protocol;
    return p === "https:" || p === "http:";
  } catch {
    return false;
  }
}

export function trackingUrlFor(carrierId: string, trackingNumber: string, customUrl?: string | null): string | null {
  if (customUrl && isHttpUrl(customUrl)) return customUrl;
  const template = carrierById(carrierId)?.trackingUrl;
  return template ? template.replace("{n}", encodeURIComponent(trackingNumber)) : null;
}
```

Create `src/lib/contact-links.ts`:

```ts
export function telLink(phone10: string): string {
  return `tel:+91${phone10}`;
}

export function whatsappLink(phone10: string, text: string): string {
  return `https://wa.me/91${phone10}?text=${encodeURIComponent(text)}`;
}

export function orderWhatsappText({ number, name, brand }: { number: string; name: string; brand: string }): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  return `Hi ${first}, this is ${brand} about your order ${number}.`;
}
```

Create `src/lib/csv.ts`:

```ts
export type CsvCell = string | number | null | undefined;

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  // A leading = + - @ (or tab/CR) would be run as a formula by Excel/Sheets.
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
```

Create `src/lib/order-tabs.ts`:

```ts
import type { OrderStatus } from "@prisma/client";

export type OrderTab = "to-ship" | "pending" | "shipped" | "delivered" | "closed" | "all";

export const ORDER_TABS: readonly { id: OrderTab; label: string; statuses: readonly OrderStatus[] | null }[] = [
  { id: "to-ship", label: "To ship", statuses: ["PAID", "PROCESSING"] },
  { id: "pending", label: "Awaiting payment", statuses: ["PENDING_PAYMENT"] },
  { id: "shipped", label: "Shipped", statuses: ["SHIPPED"] },
  { id: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  { id: "closed", label: "Cancelled / refunded", statuses: ["CANCELLED", "EXPIRED", "REFUNDED"] },
  { id: "all", label: "All", statuses: null },
];

export function parseOrderTab(s: string | undefined | null): OrderTab {
  return ORDER_TABS.some((t) => t.id === s) ? (s as OrderTab) : "to-ship";
}
```

Create `src/lib/validation/orders.ts`:

```ts
import { z } from "zod";
import { CARRIER_IDS } from "@/lib/carriers";

export const trackingInputSchema = z.object({
  carrier: z.enum(CARRIER_IDS, { errorMap: () => ({ message: "Choose a carrier" }) }),
  trackingNumber: z.string().trim().min(4, "Enter the tracking number").max(40).regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only"),
  trackingUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v ?? null),
    z.string().trim().url("Enter a full link").max(500).refine((u) => /^https?:\/\//i.test(u), "Use an http(s) link").nullable(),
  ),
});
export type TrackingInput = z.input<typeof trackingInputSchema>;

export const adminNoteSchema = z.string().max(2000, "Keep notes under 2000 characters");
export const cancelReasonSchema = z.string().trim().max(200, "Keep the reason under 200 characters");
```

Run the three test files (GREEN).

- [ ] **Step 3: Failing service tests**

Create `tests/unit/admin-orders.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { markOrderPaid, placeOrder } from "@/server/services/orders";
import { getEmail, type ConsoleEmail } from "@/server/adapters/email";
import {
  advanceOrderStatus, bulkMarkProcessing, clearAttention, countToShip, exportOrdersCsv, getAdminOrder, listAdminOrders, refundOrder, saveTracking, setAdminNote,
} from "@/server/services/admin-orders";
import { ConflictError, ValidationError } from "@/server/errors";

const DAY = 86_400_000;

async function paidOrder(qty = 1) {
  const user = await createUser({ name: "Asha Rao" });
  const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
  const address = await createAddress(user.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
  await addItem({ userId: user.id }, p.variants[0].id, qty);
  const placed = await placeOrder(user.id, { addressId: address.id });
  await markOrderPaid(placed.orderId, "mock_pay_1", "client");
  return { user, variantId: p.variants[0].id, orderId: placed.orderId, number: placed.number };
}
const stockOf = async (id: string) => (await db.productVariant.findUniqueOrThrow({ where: { id } })).stock;

describe("admin orders list", () => {
  beforeEach(resetDb);

  it("defaults to To ship, oldest paid first, with tab counts and age", async () => {
    const u = await createUser();
    const now = new Date();
    const old = await createOrderRow(u.id, { status: "PAID", paidAt: new Date(now.getTime() - 3 * DAY) });
    const fresh = await createOrderRow(u.id, { status: "PROCESSING", paidAt: now });
    await createOrderRow(u.id, { status: "SHIPPED" });
    await createOrderRow(u.id, { status: "PENDING_PAYMENT", paidAt: null });
    await createOrderRow(u.id, { status: "EXPIRED", paidAt: null, needsAttention: true });
    const list = await listAdminOrders({}, now);
    expect(list.activeTab).toBe("to-ship");
    expect(list.items.map((r) => r.id)).toEqual([old.id, fresh.id]);
    expect(list.items[0].unshippedDays).toBe(3);
    expect(Object.fromEntries(list.tabs.map((t) => [t.id, t.count]))).toEqual({ "to-ship": 2, pending: 1, shipped: 1, delivered: 0, closed: 1, all: 5 });
    expect(list.attentionCount).toBe(1);
    expect((await listAdminOrders({ attention: true, tab: "all" })).items).toHaveLength(1);
  });

  it("searches across all statuses by number, name, email, phone and pincode", async () => {
    const u = await createUser();
    const a = await createOrderRow(u.id, { status: "SHIPPED", number: "ORD-2001", shipName: "Meera Iyer", shipPhone: "9123456780", shipPincode: "600002" });
    await createOrderRow(u.id, { status: "PAID", number: "ORD-2002" });
    for (const q of ["ord-2001", "meera", "91234", "600002"]) {
      const r = await listAdminOrders({ q });
      expect(r.activeTab).toBe("all");
      expect(r.items.map((x) => x.id)).toEqual([a.id]);
    }
  });
});

describe("admin order actions", () => {
  beforeEach(async () => {
    await resetDb();
    (getEmail() as ConsoleEmail).sent.length = 0;
  });

  it("moves forward only, fills timestamps and emails on shipped", async () => {
    const { orderId } = await paidOrder();
    await advanceOrderStatus(orderId, "PROCESSING", null);
    await expect(advanceOrderStatus(orderId, "PROCESSING", null)).rejects.toBeInstanceOf(ConflictError);
    await advanceOrderStatus(orderId, "DELIVERED", null);
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe("DELIVERED");
    expect(o.processingAt && o.shippedAt && o.deliveredAt).toBeTruthy();
    expect((getEmail() as ConsoleEmail).sent.map((m) => m.subject)).toEqual(expect.arrayContaining([expect.stringMatching(/was delivered/)]));
    const u = await createUser();
    const pending = await createOrderRow(u.id, { status: "PENDING_PAYMENT", paidAt: null });
    await expect(advanceOrderStatus(pending.id, "SHIPPED", null)).rejects.toBeInstanceOf(ConflictError);
  });

  it("saves tracking, builds the URL and marks shipped", async () => {
    const { orderId, number } = await paidOrder();
    await expect(saveTracking(orderId, { carrier: "delhivery", trackingNumber: "x" }, null, { markShipped: true })).rejects.toBeInstanceOf(ValidationError);
    await saveTracking(orderId, { carrier: "delhivery", trackingNumber: "AWB123456", trackingUrl: "" }, "admin-1", { markShipped: true });
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { events: true } });
    expect(o).toMatchObject({ status: "SHIPPED", carrier: "Delhivery", trackingNumber: "AWB123456", trackingUrl: "https://www.delhivery.com/track/package/AWB123456" });
    expect(o.events.map((e) => e.type)).toEqual(expect.arrayContaining(["TRACKING_UPDATED", "STATUS_CHANGED", "EMAIL_SENT"]));
    expect((getEmail() as ConsoleEmail).sent.some((m) => m.subject === `Order ${number} has shipped`)).toBe(true);
  });

  it("records notes, clears attention and shows actor names on the timeline", async () => {
    const admin = await createUser({ name: "Owner", role: "ADMIN" });
    const { orderId } = await paidOrder();
    await db.order.update({ where: { id: orderId }, data: { needsAttention: true } });
    await setAdminNote(orderId, "Customer wants XL instead", admin.id);
    await clearAttention(orderId, admin.id);
    const d = await getAdminOrder(orderId);
    expect(d).toMatchObject({ adminNote: "Customer wants XL instead", needsAttention: false, customer: { name: "Asha Rao", paidOrderCount: 1 } });
    expect(d.events[0].actorName).toBe("Owner");
  });

  it("bulk-marks only paid orders as processing", async () => {
    const a = await paidOrder();
    const u = await createUser();
    const shipped = await createOrderRow(u.id, { status: "SHIPPED" });
    expect(await bulkMarkProcessing([a.orderId, shipped.id, "missing"], null)).toBe(1);
    expect(await countToShip()).toBe(1);
  });

  it("refunds through the provider and restocks unshipped orders only", async () => {
    const a = await paidOrder(2);
    expect(await stockOf(a.variantId)).toBe(3);
    const r = await refundOrder(a.orderId, null);
    expect(r.refundId).toMatch(/^mock_refund_/);
    expect(await stockOf(a.variantId)).toBe(5);
    const o = await db.order.findUniqueOrThrow({ where: { id: a.orderId }, include: { events: true } });
    expect(o.status).toBe("REFUNDED");
    expect(o.events.find((e) => e.type === "REFUNDED")?.message).toContain(r.refundId!);
    const b = await paidOrder(1);
    await advanceOrderStatus(b.orderId, "SHIPPED", null);
    await refundOrder(b.orderId, null);
    expect(await stockOf(b.variantId)).toBe(4);
    await expect(refundOrder(b.orderId, null)).rejects.toBeInstanceOf(ConflictError);
  });

  it("exports CSV with rupee amounts and safe cells", async () => {
    const u = await createUser();
    const o = await createOrderRow(u.id, { status: "PAID", number: "ORD-3001", shipName: "=HYPERLINK(\"x\")", totalPaise: 54950 });
    const csv = await exportOrdersCsv({ ids: [o.id] });
    const [header, row] = csv.trim().split("\r\n");
    expect(header.startsWith("Order,Placed (IST),Status,Customer,Phone")).toBe(true);
    expect(row).toContain("ORD-3001");
    expect(row).toContain("549.50");
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
```

Run: `npm test -- tests/unit/admin-orders.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 4: Service**

Create `src/server/services/admin-orders.ts`:

```ts
import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { getPaymentProvider, paymentProviderName } from "@/server/payments";
import { notifyOrder } from "@/server/services/notifications";
import { addOrderEvent, orderWithItems, toOrderView, type OrderView } from "@/server/services/order-records";
import { cancelOrder } from "@/server/services/orders";
import type { Page } from "@/server/services/catalog";
import { carrierById, trackingUrlFor } from "@/lib/carriers";
import { toCsv } from "@/lib/csv";
import { formatDateTimeIst } from "@/lib/dates";
import { paiseToRupees } from "@/lib/money";
import { fulfilmentRank, ORDER_STATUS_LABEL, PAID_STATUSES, type FulfilmentStatus } from "@/lib/order-status";
import { ORDER_TABS, type OrderTab } from "@/lib/order-tabs";
import { adminNoteSchema, cancelReasonSchema, trackingInputSchema } from "@/lib/validation/orders";

const DAY = 86_400_000;

export interface AdminOrderFilter { tab?: OrderTab; q?: string; attention?: boolean; page?: number; pageSize?: number }
export interface AdminOrderRow {
  id: string; number: string; createdAt: Date; paidAt: Date | null; status: OrderStatus; needsAttention: boolean;
  customerName: string; email: string; phone: string; city: string; pincode: string; itemCount: number; totalPaise: number; unshippedDays: number | null;
}
export interface OrderTabCount { id: OrderTab; label: string; count: number }
export interface AdminOrderList extends Page<AdminOrderRow> { tabs: OrderTabCount[]; attentionCount: number; activeTab: OrderTab }
export interface AdminOrderEvent { id: string; type: string; message: string; createdAt: Date; actorName: string | null }
export interface AdminOrderDetail extends OrderView {
  needsAttention: boolean; adminNote: string | null;
  customer: { id: string; name: string | null; email: string; paidOrderCount: number };
  events: AdminOrderEvent[];
}

export function adminOrderWhere(f: AdminOrderFilter): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  const q = f.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const or: Prisma.OrderWhereInput[] = [
      { number: { contains: q, mode: "insensitive" } },
      { shipName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
    if (digits.length >= 4) or.push({ shipPhone: { contains: digits } }, { shipPincode: { contains: digits } });
    where.OR = or;
  } else {
    const tab = ORDER_TABS.find((t) => t.id === (f.tab ?? "to-ship")) ?? ORDER_TABS[0];
    if (tab.statuses) where.status = { in: [...tab.statuses] };
  }
  if (f.attention) where.needsAttention = true;
  return where;
}

export async function listAdminOrders(f: AdminOrderFilter = {}, now: Date = new Date()): Promise<AdminOrderList> {
  const pageSize = Math.min(Math.max(f.pageSize ?? 50, 1), 200);
  const page = Math.max(f.page ?? 1, 1);
  const activeTab: OrderTab = f.q?.trim() ? "all" : f.tab ?? "to-ship";
  const where = adminOrderWhere(f);
  const orderBy: Prisma.OrderOrderByWithRelationInput[] = activeTab === "to-ship" ? [{ paidAt: "asc" }, { createdAt: "asc" }] : [{ createdAt: "desc" }];
  const [total, rows, grouped, attentionCount] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { items: { select: { quantity: true } } } }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.count({ where: { needsAttention: true } }),
  ]);
  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const all = grouped.reduce((s, g) => s + g._count._all, 0);
  return {
    items: rows.map((o) => ({
      id: o.id, number: o.number, createdAt: o.createdAt, paidAt: o.paidAt, status: o.status, needsAttention: o.needsAttention,
      customerName: o.shipName, email: o.email, phone: o.shipPhone, city: o.shipCity, pincode: o.shipPincode,
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0), totalPaise: o.totalPaise,
      unshippedDays: (o.status === "PAID" || o.status === "PROCESSING") && o.paidAt ? Math.floor((now.getTime() - o.paidAt.getTime()) / DAY) : null,
    })),
    total, page, pageSize, hasMore: page * pageSize < total,
    tabs: ORDER_TABS.map((t) => ({ id: t.id, label: t.label, count: t.statuses ? t.statuses.reduce((s, st) => s + (byStatus.get(st) ?? 0), 0) : all })),
    attentionCount, activeTab,
  };
}

export async function getAdminOrder(id: string): Promise<AdminOrderDetail> {
  const o = await db.order.findUnique({
    where: { id },
    include: { ...orderWithItems, events: { orderBy: { createdAt: "desc" } }, user: { select: { id: true, name: true, email: true } } },
  });
  if (!o) throw new NotFoundError("Order");
  const actorIds = [...new Set(o.events.map((e) => e.actorId).filter((x): x is string => Boolean(x)))];
  const [actors, paidOrderCount] = await Promise.all([
    actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    db.order.count({ where: { userId: o.userId, status: { in: [...PAID_STATUSES] } } }),
  ]);
  const names = new Map(actors.map((a) => [a.id, a.name ?? a.email]));
  return {
    ...toOrderView(o),
    needsAttention: o.needsAttention,
    adminNote: o.adminNote,
    customer: { id: o.user.id, name: o.user.name, email: o.user.email, paidOrderCount },
    events: o.events.map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt, actorName: e.actorId ? names.get(e.actorId) ?? null : null })),
  };
}

export async function advanceOrderStatus(id: string, to: FulfilmentStatus, actorId: string | null, opts: { notify?: boolean } = {}): Promise<void> {
  const o = await db.order.findUnique({ where: { id }, select: { status: true, processingAt: true, shippedAt: true } });
  if (!o) throw new NotFoundError("Order");
  const from = fulfilmentRank(o.status);
  const target = fulfilmentRank(to);
  if (from < 0 || target <= from) {
    throw new ConflictError(`A ${ORDER_STATUS_LABEL[o.status].toLowerCase()} order cannot be marked ${ORDER_STATUS_LABEL[to].toLowerCase()}`);
  }
  const now = new Date();
  const data: Prisma.OrderUpdateManyMutationInput = { status: to };
  if (target >= 1 && !o.processingAt) data.processingAt = now;
  if (target >= 2 && !o.shippedAt) data.shippedAt = now;
  if (target >= 3) data.deliveredAt = now;
  const ok = await db.$transaction(async (tx) => {
    const r = await tx.order.updateMany({ where: { id, status: o.status }, data });
    if (r.count !== 1) return false;
    await addOrderEvent(tx, id, "STATUS_CHANGED", `${ORDER_STATUS_LABEL[o.status]} → ${ORDER_STATUS_LABEL[to]}`, actorId);
    return true;
  });
  if (!ok) throw new ConflictError("This order just changed. Reload and try again.");
  if (opts.notify !== false && (to === "SHIPPED" || to === "DELIVERED")) await notifyOrder(id, to === "SHIPPED" ? "shipped" : "delivered");
}

export async function saveTracking(id: string, input: unknown, actorId: string | null, opts: { markShipped: boolean }): Promise<void> {
  const parsed = trackingInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodFieldErrors(parsed.error));
  const carrier = carrierById(parsed.data.carrier)!;
  const o = await db.order.findUnique({ where: { id }, select: { status: true } });
  if (!o) throw new NotFoundError("Order");
  if (fulfilmentRank(o.status) < 0) throw new ConflictError("Tracking can only be added to paid orders");
  const trackingUrl = trackingUrlFor(carrier.id, parsed.data.trackingNumber, parsed.data.trackingUrl);
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { carrier: carrier.name, trackingNumber: parsed.data.trackingNumber, trackingUrl } });
    await addOrderEvent(tx, id, "TRACKING_UPDATED", `${carrier.name} ${parsed.data.trackingNumber}`, actorId);
  });
  if (opts.markShipped && fulfilmentRank(o.status) < fulfilmentRank("SHIPPED")) await advanceOrderStatus(id, "SHIPPED", actorId);
}

export async function setAdminNote(id: string, note: unknown, actorId: string | null): Promise<void> {
  const parsed = adminNoteSchema.safeParse(note);
  if (!parsed.success) throw new ValidationError({ note: parsed.error.issues.map((i) => i.message) });
  const text = parsed.data.trim();
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { adminNote: text || null } });
    await addOrderEvent(tx, id, "NOTE", text ? `Note: ${text.slice(0, 200)}` : "Note cleared", actorId);
  });
}

export async function clearAttention(id: string, actorId: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { needsAttention: false } });
    await addOrderEvent(tx, id, "NOTE", "Marked as resolved", actorId);
  });
}

export async function bulkMarkProcessing(ids: string[], actorId: string | null): Promise<number> {
  const paid = await db.order.findMany({ where: { id: { in: ids.slice(0, 200) }, status: "PAID" }, select: { id: true } });
  let n = 0;
  for (const o of paid) {
    try {
      await advanceOrderStatus(o.id, "PROCESSING", actorId);
      n++;
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
    }
  }
  return n;
}

export async function adminCancelOrder(id: string, reason: unknown, actorId: string | null): Promise<void> {
  const parsed = cancelReasonSchema.safeParse(reason ?? "");
  if (!parsed.success) throw new ValidationError({ reason: parsed.error.issues.map((i) => i.message) });
  await cancelOrder(id, { actorId, reason: parsed.data });
}

export async function refundOrder(id: string, actorId: string | null): Promise<{ refundId: string | null }> {
  const o = await db.order.findUnique({ where: { id }, include: { items: { select: { variantId: true, quantity: true } } } });
  if (!o) throw new NotFoundError("Order");
  const paidLike = (PAID_STATUSES as readonly OrderStatus[]).includes(o.status);
  if (!paidLike && !(o.status === "CANCELLED" && o.providerPaymentId)) throw new ConflictError("Only paid orders can be refunded");

  let refundId: string | null = null;
  let note = "Marked as refunded (refund made outside the store)";
  if (o.providerPaymentId && o.paymentProvider === paymentProviderName()) {
    refundId = (await getPaymentProvider().refund(o.providerPaymentId, o.totalPaise)).id;
    note = `Refund ${refundId} created with ${o.paymentProvider === "razorpay" ? "Razorpay" : "the mock provider"}`;
  }
  const restock = o.status === "PAID" || o.status === "PROCESSING";
  const ok = await db.$transaction(async (tx) => {
    const r = await tx.order.updateMany({ where: { id, status: o.status }, data: { status: "REFUNDED", refundedAt: new Date(), needsAttention: false } });
    if (r.count !== 1) return false;
    if (restock) {
      for (const it of o.items) {
        if (it.variantId) await tx.productVariant.updateMany({ where: { id: it.variantId }, data: { stock: { increment: it.quantity } } });
      }
    }
    await addOrderEvent(tx, id, "REFUNDED", `${note}${restock ? "; stock restocked" : ""}`, actorId);
    return true;
  });
  if (!ok) {
    if (refundId) await addOrderEvent(db, id, "ATTENTION", `Refund ${refundId} was created but the order changed at the same time. Check it.`, actorId);
    throw new ConflictError("This order just changed. Reload and check before refunding again.");
  }
  await notifyOrder(id, "refunded");
  return { refundId };
}

const CSV_HEADER = [
  "Order", "Placed (IST)", "Status", "Customer", "Phone", "Email", "Address line 1", "Address line 2", "Landmark", "City", "State", "PIN",
  "Items", "SKUs", "Units", "Subtotal", "Discount", "Shipping", "Total", "Coupon / offer", "Payment ID", "Carrier", "Tracking number", "Customer note",
];

export async function exportOrdersCsv(sel: AdminOrderFilter & { ids?: string[] }): Promise<string> {
  const where: Prisma.OrderWhereInput = sel.ids?.length ? { id: { in: sel.ids.slice(0, 5000) } } : adminOrderWhere(sel);
  const rows = await db.order.findMany({ where, orderBy: { createdAt: "asc" }, take: 5000, include: orderWithItems });
  return toCsv([
    CSV_HEADER,
    ...rows.map((o) => [
      o.number, formatDateTimeIst(o.createdAt), ORDER_STATUS_LABEL[o.status], o.shipName, o.shipPhone, o.email,
      o.shipLine1, o.shipLine2, o.shipLandmark, o.shipCity, o.shipState, o.shipPincode,
      o.items.map((i) => `${i.productName} (${i.colorName}/${i.size}) x${i.quantity}`).join("; "),
      o.items.map((i) => i.sku).join("; "),
      o.items.reduce((s, i) => s + i.quantity, 0),
      paiseToRupees(o.subtotalPaise), paiseToRupees(o.discountPaise), paiseToRupees(o.shippingPaise), paiseToRupees(o.totalPaise),
      o.couponCode ?? o.offerLabel, o.providerPaymentId, o.carrier, o.trackingNumber, o.customerNote,
    ]),
  ]);
}

export async function countToShip(): Promise<number> {
  return db.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } });
}
```

Run the service tests (GREEN).

- [ ] **Step 5: Actions and export route**

Create `src/app/admin/orders/actions.ts` following the exact shape of `src/app/admin/products/actions.ts` (`"use server"`, `try { const { userId } = await requireAdmin(); …; revalidatePath("/", "layout"); return { ok: true, data } } catch (err) { return actionError(err) }`) for the seven actions listed under Interfaces, each passing `userId` as the actor:
`advanceStatusAction` → `advanceOrderStatus(id, to, userId)`; `saveTrackingAction` → `saveTracking(id, input, userId, { markShipped })`; `saveAdminNoteAction` → `setAdminNote`; `clearAttentionAction` → `clearAttention`; `cancelOrderAction` → `adminCancelOrder(id, reason, userId)`; `refundOrderAction` → `refundOrder`; `bulkMarkProcessingAction` → `{ updated: await bulkMarkProcessing(ids, userId) }` (reject more than 200 ids with `ValidationError({ ids: ["Select at most 200 orders"] })`).

Create `src/app/admin/orders/export/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/server/admin-guard";
import { toHttp } from "@/server/errors";
import { exportOrdersCsv } from "@/server/services/admin-orders";
import { parseOrderTab } from "@/lib/order-tabs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const csv = await exportOrdersCsv({ ids, tab: parseOrderTab(sp.get("tab")), q: sp.get("q") ?? undefined, attention: sp.get("attention") === "1" });
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(`﻿${csv}`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="orders-${date}.csv"`, "cache-control": "no-store" },
    });
  } catch (err) {
    const { status, body } = toHttp(err);
    return NextResponse.json(body, { status });
  }
}
```

- [ ] **Step 6: Nav badge**

`src/app/admin/layout.tsx`: `const toShip = await countToShip();` after the guard and render `<AdminNav toShipCount={toShip} />`.

`src/components/admin/admin-nav.tsx`: accept `{ toShipCount }`; add `{ href: "/admin/orders", label: "Orders", icon: ShoppingBag }` as the second item; the `nav` becomes `flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0` and each link gets `min-h-11 shrink-0`; when `toShipCount > 0` the Orders link shows `<span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-ink" data-testid="to-ship-badge"><span className="sr-only">To ship: </span>{toShipCount}</span>`. (Task 11 adds the remaining items.)

- [ ] **Step 7: Orders list page**

Create `src/app/admin/orders/page.tsx` (server):
- `await requireAdminPage()`; read `tab` (`parseOrderTab`), `q`, `attention` (`"1"`), `page` from `searchParams`; `const list = await listAdminOrders({ tab, q, attention, page })`.
- Header row: `h1` "Orders" and an **Export CSV** link (`/admin/orders/export?` + the current `tab`/`q`/`attention`), `Button variant="secondary" className="h-11"` via `render={<a href=… />}` + `nativeButton={false}`.
- **Tabs** as links (not the Tabs primitive, so they are shareable URLs): a horizontally scrollable row (`flex gap-2 overflow-x-auto`) of `min-h-11` pills, `aria-current="page"` on `list.activeTab`, label + count (`To ship 4`).
- **Search** `<form method="get" role="search">` with `<Label htmlFor="order-q" className="sr-only">Search orders</Label>`, `Input id="order-q" name="q" type="search" className="h-11" placeholder="Order #, name, email, phone, PIN"`, hidden `tab`, and a **Search** button (`h-11`). A **Needs attention (n)** toggle link (amber when `attentionCount > 0`) that adds/removes `attention=1`.
- `<OrdersTable rows={list.items} exportQuery={…} />`, then pagination (Newer/Older links, `min-h-11`) and "Showing a–b of total".
- Empty state per tab: "Nothing to ship. Nice." for to-ship; "No orders match" when searching.

Create `src/components/admin/orders/order-status-badge.tsx`: same pill shape as the Phase 1 `StatusBadge` with `data-testid="order-status"` and tones: PENDING_PAYMENT amber, PAID `bg-brand text-brand-ink`, PROCESSING `bg-surface-raised`, SHIPPED/DELIVERED `border border-brand text-brand`, CANCELLED/EXPIRED/REFUNDED muted; text = `ORDER_STATUS_LABEL[status]`.

Create `src/components/admin/orders/orders-table.tsx` (client):
- Props `{ rows: AdminOrderRow[]; exportQuery: string }`; state `selected: Set<string>`; `useTransition`; `useRouter`.
- A single responsive list (no duplicate DOM for mobile/desktop): header row `hidden md:grid` with the columns; `<ul>` of `<li data-testid="order-row" className="grid grid-cols-[44px_1fr_auto] items-center gap-x-3 gap-y-1 border-b border-border py-3 md:grid-cols-[44px_120px_110px_1fr_120px_60px_100px_150px]">`. Cells: checkbox wrapped in `<label className="flex size-11 items-center justify-center"><input type="checkbox" className="size-5" aria-label={`Select ${r.number}`} …/></label>`; number as a `Link` to `/admin/orders/{id}` (font-medium; this link's accessible name is the number); date (`formatDateIst`); customer name + email (truncate); city + pincode; item count; total (`formatPaise`); `OrderStatusBadge` + age badge (`{n}d`, amber when `unshippedDays > 2`, `title="Paid n days ago, not shipped"`) + a red dot with `sr-only` "Needs attention" when flagged. On mobile, the secondary cells collapse into a second line under the name (`col-start-2 md:col-start-auto`).
- Header checkbox "Select all on this page" (`aria-label`), indeterminate when partially selected.
- **Bulk bar** when `selected.size > 0`: `fixed inset-x-0 bottom-0 z-30 border-t bg-bg p-3 md:sticky md:bottom-4 md:rounded-md md:border` with "{n} selected", **Mark processing** (calls `bulkMarkProcessingAction([...selected])`, `toast.success(`${updated} marked processing`)`, clears selection, `router.refresh()`), **Export CSV** (`<a href={`/admin/orders/export?ids=${[...selected].join(",")}`}>`), **Clear**. All `h-11`. (Task 10 adds Print labels / Print slips here.)

- [ ] **Step 8: Order detail page**

Create `src/components/admin/copy-button.tsx`:

```tsx
"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    toast.success("Copied");
    window.setTimeout(() => setDone(false), 1500);
  }
  return (
    <Button type="button" variant="secondary" onClick={copy} className={cn("h-11 px-4", className)} aria-label={label}>
      {done ? <Check className="size-4" /> : <Copy className="size-4" />} {done ? "Copied" : "Copy"}
    </Button>
  );
}
```

Create `src/components/admin/orders/order-actions.tsx` (client) — the "next action" and danger zone:
- **Next action** button (primary, `h-12 w-full sm:w-auto`, `data-testid="next-action"`): label from `nextFulfilmentStatus(status)` → "Mark processing" / "Mark shipped" / "Mark delivered"; hidden when `null`. Clicking "Mark shipped" scrolls to and focuses the tracking form's number input instead of shipping without tracking (a secondary text button "Ship without tracking" calls `advanceStatusAction(id, "SHIPPED")`). Others call `advanceStatusAction` directly, then `toast.success` + `router.refresh()`.
- **Cancel & restock** (`variant="destructive"`, `h-11`), shown when `canCancel(status)`: opens a `Dialog` with an optional reason `<textarea>` (label "Reason (optional, the customer does not see it)"), text "Stock goes back on sale. This does not refund money; use Refund for that." and **Cancel order** / **Keep order** buttons; calls `cancelOrderAction`.
- **Refund** (`variant="destructive"`, `h-11`), shown for paid-like statuses and for CANCELLED with a payment id: `Dialog` explaining "Refund {formatPaise(totalPaise)} to the customer via Razorpay" when `paymentProvider === "razorpay"` and a payment id exists, otherwise "Mark as refunded (you refunded outside the store)"; confirm calls `refundOrderAction`, toasts the refund id.
- All dialogs trap focus (Base UI Dialog), have a title, and return focus on close.

Create `src/components/admin/orders/tracking-form.tsx` (client): `<form>` with `<Label htmlFor="carrier">Carrier</Label>` + native `<select id="carrier" className="h-11 …">` of `CARRIERS` (value = id; initial from the saved carrier *name* mapped back to id, default `delhivery`), `<Label htmlFor="tracking-number">Tracking number</Label>` + `Input id="tracking-number" className="h-11 font-mono" autoComplete="off"`, and when the carrier's template is null (or "Other"), `Input` "Tracking link (optional)". Shows a live preview of the tracking URL (`trackingUrlFor`). Buttons: **Save & mark shipped** (primary, `h-11`, shown while status is PAID/PROCESSING; `saveTrackingAction(id, input, true)`) and **Save tracking** (`h-11`; `markShipped: false`). On success: `toast.success(markShipped ? "Marked shipped; customer emailed" : "Tracking saved")` and `router.refresh()`. Field errors via `FieldError`. `data-testid="tracking-form"`.

Create `src/components/admin/orders/admin-note-form.tsx` (client): `<Label htmlFor="admin-note">Internal note</Label>`, `<textarea id="admin-note" rows={3} maxLength={2000}>` prefilled, **Save note** (`h-11`) → `saveAdminNoteAction`; helper "Only admins see this."

Create `src/components/admin/orders/order-timeline.tsx` (server): `<ol aria-label="Timeline">` newest first; each event shows an icon per type (`CREATED` receipt, `PAID` indian-rupee, `STATUS_CHANGED` arrow-right, `TRACKING_UPDATED` truck, `NOTE` sticky-note, `EMAIL_SENT` mail, `EMAIL_FAILED` mail-warning in `text-danger`, `ATTENTION` alert-triangle amber, `PAYMENT_FAILED` x-circle, `EXPIRED` clock, `REFUNDED` undo), the message, `formatDateTimeIst(createdAt)` and "by {actorName}" when present.

Create `src/app/admin/orders/[id]/page.tsx` (server):
- `await requireAdminPage()`; `getAdminOrder(id)` (`NotFoundError` → `notFound()`); `getSettings()` not needed here.
- `data-testid="admin-order"`. Top: "← Orders" link (`min-h-11`), `h1` order number, `OrderStatusBadge`, placed date; an amber attention banner (`role="alert"`) when `needsAttention`, listing the latest `ATTENTION` event message with a **Mark resolved** form button (`clearAttentionAction`); `<OrderActions order={…} />`.
- Grid `lg:grid-cols-[1fr_360px] gap-6`, single column on mobile, with the **customer and ship-to cards first on mobile** (`order-first lg:order-none`) because they are what the owner needs while packing.
- Customer card: name, email (`mailto:`), phone as `tel:` link (`telLink`, `min-h-11`), **WhatsApp** link button (`whatsappLink(phone, orderWhatsappText({ number, name, brand: BRAND.name }))`, `target="_blank" rel="noopener noreferrer"`, `h-11`), "{paidOrderCount} paid orders" as plain text (Task 11 turns it into a link to `/admin/customers/{customer.id}` when it adds that page).
- Ship-to card: name, `addressLines`, phone, and `<CopyButton text={addressText(ship.name, ship.phone, ship)} label="Copy shipping address" />`.
- Items card: rows with 48 px thumbnail, name, `colorName / size`, SKU (`font-mono text-xs`), qty, line total; then `<PriceBreakup … discountLabel={orderDiscountLabel(order)} />`.
- Payment card: provider, provider order id, payment id (each `font-mono break-all`), paid at.
- Customer note (if any) in a highlighted box.
- `<TrackingForm … />`, `<AdminNoteForm … />`, `<OrderTimeline events={order.events} />`.

- [ ] **Step 9: Verify and commit**

Run all new test files (GREEN), the full gate, then a manual check on port 3001 as admin with two mock-paid orders: default tab lists them oldest first with the badge count in the nav; search by the phone's last 5 digits; select both → Mark processing; open one at 360 px: customer/ship cards come first, Copy puts the address on the clipboard, WhatsApp opens `wa.me` with the order number, Save & mark shipped with a Delhivery AWB moves it to Shipped and the console email adapter logs the shipped email; Cancel & restock on another order restores stock; Export CSV downloads and opens in a spreadsheet with the address columns. Stop the server.

```bash
git add src/lib/carriers.ts src/lib/contact-links.ts src/lib/csv.ts src/lib/order-tabs.ts src/lib/validation/orders.ts src/server/services/admin-orders.ts src/app/admin/orders src/components/admin/orders src/components/admin/copy-button.tsx src/components/admin/admin-nav.tsx src/app/admin/layout.tsx tests/unit/carriers.test.ts tests/unit/contact-links.test.ts tests/unit/csv.test.ts tests/unit/admin-orders.test.ts
git commit -m "feat(admin): add order management with quick actions, tracking, notes, timeline, refunds and CSV export

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 10: Print views — 4×6 label with Code128, packing slip, invoice, bulk print

**Files:**
- Create: `src/lib/barcode128.ts`, `src/components/print/barcode.tsx`, `src/components/print/label-document.tsx`, `src/components/print/slip-document.tsx`, `src/app/admin/orders/print/page.tsx`
- Modify: `src/server/services/admin-orders.ts` (add `getOrdersForPrint`), `src/app/admin/layout.tsx` (hide chrome in print), `src/components/admin/orders/orders-table.tsx` (bulk print buttons), `src/app/admin/orders/[id]/page.tsx` (print buttons), `tests/unit/admin-orders.test.ts` (extend)
- Test: `tests/unit/barcode128.test.ts`

**Interfaces:**
- Consumes: `OrderView`, `orderWithItems`, `toOrderView` (Task 5), `StoreSettings`, `getSettings` (Task 1), `InvoiceDocument`, `PrintToolbar`, `PageSize` (Task 8), `isPaidStatus` (Task 1), `addressLines`, `formatPhone` (Task 3), `formatDateIst` (Task 7), `requireAdminPage`, `BRAND`.
- Produces:

```ts
// @/lib/barcode128
export const CODE128_PATTERNS: readonly string[];      // 106 bar/space width strings, values 0..105
export const CODE128_STOP = "2331112";
export function code128BValues(text: string): number[];            // [104 (Start B), …data, checksum]; throws on empty or non-ASCII-printable
export function code128Widths(text: string): string;               // concatenated widths incl. stop
export interface Bar { x: number; width: number }
export function code128Bars(text: string): { bars: Bar[]; modules: number };
// @/server/services/admin-orders (added)
export function getOrdersForPrint(ids: string[]): Promise<OrderView[]>;   // ≤ 100, requested order, unknown ids dropped
// components
export function Barcode(props: { value: string; height?: number; moduleWidth?: number; className?: string }): JSX.Element;   // <svg role="img">
export function LabelDocument(props: { order: OrderView; settings: StoreSettings }): JSX.Element;   // 4in × 6in, data-testid="shipping-label"
export function SlipDocument(props: { order: OrderView; settings: StoreSettings }): JSX.Element;    // A4, data-testid="packing-slip"
// page: /admin/orders/print?ids=a,b&doc=label|slip|invoice
```

"Outside the admin chrome" (spec §7.3): App Router cannot skip `src/app/admin/layout.tsx` for one route without moving every admin page into a route group (which would touch the in-progress collection files), so the print route lives at `/admin/orders/print` as specified and the admin layout hides its sidebar and padding under `@media print`. On screen the documents show inside the admin shell with a Print toolbar; on paper only the documents print.

- [ ] **Step 1: Failing tests**

Create `tests/unit/barcode128.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { code128Bars, code128BValues, code128Widths, CODE128_PATTERNS, CODE128_STOP } from "@/lib/barcode128";

describe("Code 128-B encoder", () => {
  it("has 106 distinct 11-module symbols and a 13-module stop", () => {
    expect(CODE128_PATTERNS).toHaveLength(106);
    expect(new Set(CODE128_PATTERNS).size).toBe(106);
    for (const p of CODE128_PATTERNS) expect([...p].reduce((s, d) => s + Number(d), 0)).toBe(11);
    expect([...CODE128_STOP].reduce((s, d) => s + Number(d), 0)).toBe(13);
  });

  it("computes the mod-103 checksum", () => {
    // Start B = 104; "A" = 33, "B" = 34; (104 + 33×1 + 34×2) mod 103 = 205 mod 103 = 102
    expect(code128BValues("AB")).toEqual([104, 33, 34, 102]);
  });

  it("emits start, data, checksum and stop widths", () => {
    expect(code128Widths("AB")).toBe("211214" + "111323" + "131123" + "411131" + "2331112");
    const { bars, modules } = code128Bars("AB");
    expect(modules).toBe(57);
    expect(bars).toHaveLength(16);
    expect(bars[0]).toEqual({ x: 0, width: 2 });
    const last = bars[bars.length - 1];
    expect(last.x + last.width).toBe(57);
  });

  it("encodes order numbers and rejects what Code 128-B cannot carry", () => {
    expect(code128Bars("ORD-1001").modules).toBe((8 + 2) * 11 + 13);
    expect(() => code128BValues("")).toThrow();
    expect(() => code128BValues("₹100")).toThrow(/cannot encode/);
  });
});
```

Append to `tests/unit/admin-orders.test.ts` (import `getOrdersForPrint`):

```ts
describe("getOrdersForPrint", () => {
  beforeEach(resetDb);

  it("keeps the requested order and drops unknown ids", async () => {
    const u = await createUser();
    const a = await createOrderRow(u.id);
    const b = await createOrderRow(u.id);
    expect((await getOrdersForPrint([b.id, "nope", a.id, b.id])).map((o) => o.id)).toEqual([b.id, a.id]);
  });
});
```

Run: `npm test -- tests/unit/barcode128.test.ts tests/unit/admin-orders.test.ts`
Expected: FAIL (module/function missing).

- [ ] **Step 2: Encoder**

Create `src/lib/barcode128.ts`:

```ts
// Code 128 symbol widths (bar, space, bar, space, bar, space) for values 0..105.
export const CODE128_PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
export const CODE128_STOP = "2331112";
const START_B = 104;

export function code128BValues(text: string): number[] {
  if (text.length === 0) throw new Error("Nothing to encode");
  const values = [START_B];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (ch.length !== 1 || c < 32 || c > 126) throw new Error(`Code 128-B cannot encode "${ch}"`);
    values.push(c - 32);
  }
  let sum = START_B;
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103);
  return values;
}

export function code128Widths(text: string): string {
  return code128BValues(text).map((v) => CODE128_PATTERNS[v]).join("") + CODE128_STOP;
}

export interface Bar { x: number; width: number }

export function code128Bars(text: string): { bars: Bar[]; modules: number } {
  const widths = code128Widths(text);
  const bars: Bar[] = [];
  let x = 0;
  for (let i = 0; i < widths.length; i++) {
    const w = Number(widths[i]);
    if (i % 2 === 0) bars.push({ x, width: w }); // every symbol has an even number of elements, so even index = bar
    x += w;
  }
  return { bars, modules: x };
}
```

- [ ] **Step 3: Service addition**

Append to `src/server/services/admin-orders.ts`:

```ts
export async function getOrdersForPrint(ids: string[]): Promise<OrderView[]> {
  const unique = [...new Set(ids)].slice(0, 100);
  if (unique.length === 0) return [];
  const rows = await db.order.findMany({ where: { id: { in: unique } }, include: orderWithItems });
  const byId = new Map(rows.map((r) => [r.id, toOrderView(r)]));
  return unique.map((id) => byId.get(id)).filter((o): o is OrderView => Boolean(o));
}
```

- [ ] **Step 4: Documents**

Create `src/components/print/barcode.tsx`:

```tsx
import { code128Bars } from "@/lib/barcode128";

const QUIET = 10;

export function Barcode({ value, height = 56, moduleWidth = 2, className }: { value: string; height?: number; moduleWidth?: number; className?: string }) {
  const { bars, modules } = code128Bars(value);
  const total = modules + QUIET * 2;
  return (
    <svg role="img" aria-label={`Barcode ${value}`} className={className} width={total * moduleWidth} height={height}
      viewBox={`0 0 ${total} 50`} preserveAspectRatio="none" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width={total} height={50} fill="#fff" />
      {bars.map((b) => <rect key={b.x} x={b.x + QUIET} y={0} width={b.width} height={50} fill="#000" />)}
    </svg>
  );
}
```

Create `src/components/print/label-document.tsx` (server, black on white, sized in inches):
- Root `<article data-testid="shipping-label" className="print-page flex flex-col overflow-hidden bg-white text-black" style={{ width: "4in", height: "6in", padding: "0.2in" }}>`; on screen add `shadow` and a thin border (removed with `print:shadow-none print:border-0`).
- Top: "PREPAID · DO NOT COLLECT CASH" banner (`border-2 border-black text-center font-bold text-[11pt] tracking-wide`) — the order is always prepaid (no COD in scope).
- **SHIP TO** block, the largest element: label "SHIP TO" (`text-[9pt] font-bold`), name (`text-[18pt] font-bold leading-tight`), each of `addressLines(order.ship)` except the last (`text-[12pt]`), the last line with city/state (`text-[13pt] font-bold`), PIN on its own (`text-[22pt] font-black tracking-widest`), and `Ph: {formatPhone(phone)}` (`text-[14pt] font-bold`).
- Middle: `<Barcode value={order.number} height={60} moduleWidth={2} />` centred, the number under it (`font-mono text-[14pt] font-bold`), then "{itemCount} item(s) · {formatDateIst(paidAt ?? createdAt)}".
- Bottom (pushed down with `mt-auto`, top border): "FROM" + `settings.sellerName || BRAND.name`, `settings.sellerAddress` (`whitespace-pre-line text-[9pt]`), and `settings.whatsappNumber` as "Ph: …" when set.
- Nothing on the label depends on screen width; the print page wraps each label in an `overflow-x-auto` box so a 360 px screen scrolls inside the box, not the page.

Create `src/components/print/slip-document.tsx` (server, A4):
- `<article data-testid="packing-slip" className="print-page mx-auto w-full max-w-[210mm] bg-white p-6 text-[12px] text-black sm:p-10">`.
- Header: brand name, "PACKING SLIP", order number (large) with a small `<Barcode value={order.number} height={36} moduleWidth={1.5} />`, paid date.
- Ship-to block (name, `addressLines`, phone).
- Checklist table: a 5 mm empty square cell (`<span className="inline-block size-4 border-2 border-black" aria-hidden />` with `sr-only` "Packed"), 40 px thumbnail (`<img>` with `alt=""`; eslint-disable-next-line for `@next/next/no-img-element` with the reason "print view, no optimisation needed"), product name, **colour / size** in bold, SKU (`font-mono`), and quantity in a large bold cell (`text-[16px]`). Total units row.
- Customer note in a bordered box when present ("NOTE FROM CUSTOMER").
- Footer lines "Packed by ________  Checked by ________" and "Thank you for shopping with {brand}!".

- [ ] **Step 5: Print route and chrome**

`src/app/admin/layout.tsx`: add `print:block` to the grid wrapper, `print:hidden` to the `<aside>`, and `print:p-0` to `<main>`.

Create `src/app/admin/orders/print/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/print/invoice-document";
import { LabelDocument } from "@/components/print/label-document";
import { PageSize } from "@/components/print/page-size";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { SlipDocument } from "@/components/print/slip-document";
import { isPaidStatus } from "@/lib/order-status";
import { getOrdersForPrint } from "@/server/services/admin-orders";
import { getSettings } from "@/server/services/settings";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "Print" };
export const dynamic = "force-dynamic";

type Doc = "label" | "slip" | "invoice";
const DOCS: Doc[] = ["label", "slip", "invoice"];

export default async function PrintOrdersPage({ searchParams }: { searchParams: Promise<{ ids?: string; doc?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const doc = DOCS.find((d) => d === sp.doc);
  if (!doc) notFound();
  const ids = (sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const [orders, settings] = await Promise.all([getOrdersForPrint(ids), getSettings()]);
  const printable = doc === "invoice" ? orders.filter((o) => isPaidStatus(o.status) || o.status === "REFUNDED") : orders;
  const skipped = orders.length - printable.length;
  return (
    <div className="-m-4 min-h-dvh bg-neutral-200 sm:-m-8 print:m-0 print:bg-white" data-testid="print-view">
      <PageSize size={doc === "label" ? "4in 6in" : "A4"} margin={doc === "label" ? "0" : "12mm"} />
      <PrintToolbar backHref={ids.length === 1 ? `/admin/orders/${ids[0]}` : "/admin/orders"} backLabel="Orders" autoPrint={printable.length > 0} />
      {(printable.length === 0 || skipped > 0) && (
        <p className="no-print p-4 text-sm text-black" role="status">
          {printable.length === 0 ? "Nothing to print. Select orders first." : `${skipped} unpaid order(s) skipped: invoices exist only for paid orders.`}
        </p>
      )}
      <div className="flex flex-col items-center gap-6 p-4 print:block print:p-0">
        {printable.map((o) => (
          <div key={o.id} className="w-full overflow-x-auto print:overflow-visible">
            <div className="mx-auto w-fit shadow print:shadow-none">
              {doc === "label" ? <LabelDocument order={o} settings={settings} /> : doc === "slip" ? <SlipDocument order={o} settings={settings} /> : <InvoiceDocument order={o} settings={settings} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

(`print-page` sits on the document itself, so each label/slip/invoice starts on a new sheet; the wrapper `div`s carry no page-break rules.)

- [ ] **Step 6: Print entry points**

- `src/app/admin/orders/[id]/page.tsx`: add a "Print" button group next to the next-action button: **Label**, **Packing slip**, and (paid-like or refunded only) **Invoice**, each an anchor to `/admin/orders/print?doc=…&ids={id}` with `target="_blank" rel="noopener"`, styled as `Button variant="secondary" className="h-11"` via `render` + `nativeButton={false}`, `data-testid="print-label"` / `print-slip` / `print-invoice`.
- `src/components/admin/orders/orders-table.tsx`: in the bulk bar add **Print labels** and **Print slips** anchors (`/admin/orders/print?doc=label&ids=…`, `target="_blank"`), placed first because they are the most used; `h-11`.

- [ ] **Step 7: Verify and commit**

Run the tests (GREEN), the full gate, then on port 3001 as admin: select two paid orders → Print labels opens one 4×6 label per order; print preview (Chrome "Save as PDF") shows two 4×6 pages with no sidebar; scan the barcode with a phone barcode app and confirm it reads the order number; Print slips and a single order's Invoice render on A4. Confirm the label page does not scroll the whole page horizontally at 360 px. Stop the server.

```bash
git add src/lib/barcode128.ts src/components/print src/app/admin/orders src/app/admin/layout.tsx src/server/services/admin-orders.ts src/components/admin/orders/orders-table.tsx tests/unit/barcode128.test.ts tests/unit/admin-orders.test.ts
git commit -m "feat(admin): add printable 4x6 labels with Code128, packing slips, invoices and bulk print

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 11: Coupons and offers CRUD, customers, inventory quick edit, settings page, dashboard upgrade

**Files:**
- Create: `src/lib/validation/promotions.ts`, `src/server/services/admin-promotions.ts`, `src/server/services/admin-customers.ts`, `src/server/services/admin-inventory.ts`, `src/app/admin/coupons/{page.tsx,new/page.tsx,[id]/page.tsx,actions.ts}`, `src/app/admin/offers/{page.tsx,new/page.tsx,[id]/page.tsx,actions.ts}`, `src/app/admin/customers/{page.tsx,[id]/page.tsx}`, `src/app/admin/inventory/{page.tsx,actions.ts}`, `src/app/admin/settings/{page.tsx,actions.ts}`, `src/components/admin/{coupon-form,offer-form,inventory-table,settings-form,revenue-bars,delete-button}.tsx`
- Modify: `src/lib/dates.ts` (IST day helpers), `src/server/services/admin-dashboard.ts`, `src/app/admin/page.tsx`, `src/components/admin/admin-nav.tsx` (remaining items), `src/app/admin/orders/[id]/page.tsx` (link the customer)
- Test: `tests/unit/admin-promotions.test.ts`, `tests/unit/admin-customers.test.ts`, `tests/unit/admin-inventory.test.ts`, `tests/unit/admin-dashboard.test.ts` (extend), `tests/unit/dates.test.ts` (extend)

**Interfaces:**
- Consumes: `getSettings`, `updateSettings`, `settingsInputSchema`, `SettingsInput`, `INDIA_STATES`, `PAID_STATUSES` (Task 1), `normalizeCouponCode` (Task 2), `listAddresses`, `AddressView` (Task 3), `orderWithItems`, `toOrderSummary`, `OrderSummary` (Task 5), `OrderStatusBadge`, `OrderCard`-style rows (Tasks 8/9), `listCollectionOptions`, `requireAdmin`, `requireAdminPage`, `rupeesToPaise`, `paiseToRupees`, `formatPaise`, `formatDateIst`, `StatTile`, `FieldError`, `Page`.
- Produces:

```ts
// @/lib/dates (added)
export const IST_OFFSET_MS: number;                       // 5h30m
export function startOfIstDay(d: Date): Date;             // UTC instant of 00:00 IST on d's IST date
export function istDateKey(d: Date): string;              // "YYYY-MM-DD" in IST
export function addDays(d: Date, n: number): Date;
// @/lib/validation/promotions
export const couponInputSchema; export type CouponInput = z.input<typeof couponInputSchema>;
export const offerInputSchema;  export type OfferInput = z.input<typeof offerInputSchema>;
// @/server/services/admin-promotions
export interface CouponRow { id: string; code: string; type: "PERCENT" | "FLAT"; value: number; minSubtotalPaise: number; maxDiscountPaise: number | null; startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; perUserLimit: number | null; active: boolean; uses: number; createdAt: Date }
export interface OfferRow { id: string; label: string; type: "BUNDLE_PRICE" | "QTY_PERCENT"; minQty: number; pricePaise: number | null; percent: number | null; collectionId: string | null; collectionName: string | null; active: boolean; startsAt: Date | null; endsAt: Date | null; uses: number }
export function listCoupons(): Promise<CouponRow[]>;  export function getCoupon(id: string): Promise<CouponRow>;
export function createCoupon(input: unknown): Promise<CouponRow>;  export function updateCoupon(id: string, input: unknown): Promise<CouponRow>;  export function deleteCoupon(id: string): Promise<void>;
export function listOffers(): Promise<OfferRow[]>;  export function getOffer(id: string): Promise<OfferRow>;
export function createOffer(input: unknown): Promise<OfferRow>;  export function updateOffer(id: string, input: unknown): Promise<OfferRow>;  export function deleteOffer(id: string): Promise<void>;
export function describeCoupon(c: Pick<CouponRow, "type" | "value" | "maxDiscountPaise">): string;   // "10% off (max ₹200)" | "₹100 off"
export function describeOffer(o: Pick<OfferRow, "type" | "minQty" | "pricePaise" | "percent">): string;  // "Any 3 for ₹999" | "10% off 3 or more"
// @/server/services/admin-customers
export interface CustomerRow { id: string; name: string | null; email: string; createdAt: Date; orderCount: number; totalSpentPaise: number; lastOrderAt: Date | null }
export interface CustomerDetail { id: string; name: string | null; email: string; createdAt: Date; addresses: AddressView[]; orders: OrderSummary[]; orderCount: number; totalSpentPaise: number }
export function listCustomers(args?: { q?: string; page?: number; pageSize?: number }): Promise<Page<CustomerRow>>;
export function getCustomer(id: string): Promise<CustomerDetail>;
// @/server/services/admin-inventory
export interface InventoryRow { variantId: string; productId: string; productName: string; productStatus: ProductStatus; sku: string; size: string; colorName: string; colorHex: string; stock: number; low: boolean }
export interface InventoryPage extends Page<InventoryRow> { threshold: number; lowCount: number }
export function listInventory(args?: { q?: string; lowOnly?: boolean; page?: number; pageSize?: number }): Promise<InventoryPage>;
export function setVariantStock(variantId: string, stock: unknown): Promise<InventoryRow>;   // resets lowStockAlertedAt when above threshold
// @/server/services/admin-dashboard (extended; existing fields unchanged)
export interface DashboardStats { /* existing */ activeProducts; draftProducts; archivedProducts; lowStockVariants; customers; lowStock: {…}[];
  lowStockThreshold: number; revenue: { todayPaise: number; last7Paise: number; last30Paise: number }; paidToday: number; toShip: number; needsAttention: number;
  recentOrders: { id: string; number: string; createdAt: Date; customerName: string; totalPaise: number; status: OrderStatus }[];
  topProducts: { productName: string; units: number; revenuePaise: number }[];
  revenueByDay: { date: string; revenuePaise: number; orders: number }[] }   // 14 entries, oldest first
export function getDashboardStats(now?: Date): Promise<DashboardStats>;
// actions (all: requireAdmin, service, revalidatePath("/", "layout"), ActionResult)
export function saveCouponAction(id: string | null, input: CouponInput): Promise<ActionResult<{ id: string }>>;
export function deleteCouponAction(id: string): Promise<ActionResult<null>>;
export function saveOfferAction(id: string | null, input: OfferInput): Promise<ActionResult<{ id: string }>>;
export function deleteOfferAction(id: string): Promise<ActionResult<null>>;
export function setStockAction(variantId: string, stock: number): Promise<ActionResult<InventoryRow>>;
export function saveSettingsAction(input: SettingsInput): Promise<ActionResult<null>>;
// components
export function CouponForm(props: { coupon: CouponRow | null }): JSX.Element;
export function OfferForm(props: { offer: OfferRow | null; collections: { id: string; name: string }[] }): JSX.Element;
export function InventoryTable(props: { rows: InventoryRow[]; threshold: number }): JSX.Element;
export function SettingsForm(props: { settings: StoreSettings }): JSX.Element;
export function RevenueBars(props: { days: DashboardStats["revenueByDay"] }): JSX.Element;
export function DeleteButton(props: { label: string; confirmText: string; onConfirm: () => Promise<ActionResult<null>>; redirectTo: string }): JSX.Element;
```

Rules: coupon codes are stored uppercase and unique; percent 1–90, flat ≥ ₹1; `endsAt` after `startsAt`; a coupon with uses cannot be renamed or deleted (deactivate instead). Offers: bundle needs a price, percent needs a percent, `minQty` 2–20; the collection must exist. Uses = orders in PAID/PROCESSING/SHIPPED/DELIVERED with that `couponCode` / `offerLabel`. Date inputs are `datetime-local` in the admin's browser; the client converts them with `new Date(value).toISOString()` before calling the action, so the server never guesses a time zone. Revenue counts `PAID_STATUSES` by `paidAt` (refunds excluded); "today" and day buckets are IST days.

- [ ] **Step 1: Failing tests**

Append to `tests/unit/dates.test.ts`:

```ts
import { addDays, istDateKey, startOfIstDay } from "@/lib/dates";

describe("IST day helpers", () => {
  it("finds the start of the IST day and its key", () => {
    expect(startOfIstDay(new Date("2026-09-30T20:00:00Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(startOfIstDay(new Date("2026-10-01T18:29:59Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(istDateKey(new Date("2026-09-30T20:00:00Z"))).toBe("2026-10-01");
    expect(addDays(new Date("2026-10-01T00:00:00Z"), -1).toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
});
```

(Merge the import into the file's existing import line.)

Create `tests/unit/admin-promotions.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createCollection, createOrderRow, createUser } from "../helpers/fixtures";
import {
  createCoupon, createOffer, deleteCoupon, deleteOffer, describeCoupon, describeOffer, listCoupons, listOffers, updateCoupon,
} from "@/server/services/admin-promotions";
import { ConflictError, ValidationError } from "@/server/errors";

const coupon = (over: Record<string, unknown> = {}) => ({
  code: "save10", type: "PERCENT", value: 10, minSubtotalPaise: 0, maxDiscountPaise: 20000, startsAt: null, endsAt: null,
  usageLimit: null, perUserLimit: 1, active: true, ...over,
});
const offer = (over: Record<string, unknown> = {}) => ({
  label: "Any 3 for ₹999", type: "BUNDLE_PRICE", minQty: 3, pricePaise: 99900, percent: null, collectionId: null,
  active: true, startsAt: null, endsAt: null, ...over,
});

describe("coupons admin", () => {
  beforeEach(resetDb);

  it("creates uppercase unique codes and validates values and windows", async () => {
    const c = await createCoupon(coupon());
    expect(c).toMatchObject({ code: "SAVE10", uses: 0 });
    expect(describeCoupon(c)).toBe("10% off (max ₹200)");
    expect(describeCoupon({ type: "FLAT", value: 10000, maxDiscountPaise: null })).toBe("₹100 off");
    await expect(createCoupon(coupon({ code: "Save10" }))).rejects.toBeInstanceOf(ConflictError);
    await expect(createCoupon(coupon({ code: "BIG", value: 95 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCoupon(coupon({ code: "FLAT", type: "FLAT", value: 50 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCoupon(coupon({ code: "WIN", startsAt: "2026-10-02T00:00:00.000Z", endsAt: "2026-10-01T00:00:00.000Z" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCoupon(coupon({ code: "x" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("counts uses and protects used codes", async () => {
    const c = await createCoupon(coupon());
    const u = await createUser();
    await createOrderRow(u.id, { couponCode: "SAVE10", status: "DELIVERED" });
    await createOrderRow(u.id, { couponCode: "SAVE10", status: "CANCELLED" });
    expect((await listCoupons())[0].uses).toBe(1);
    await expect(updateCoupon(c.id, coupon({ code: "SAVE20" }))).rejects.toBeInstanceOf(ConflictError);
    expect((await updateCoupon(c.id, coupon({ active: false }))).active).toBe(false);
    await expect(deleteCoupon(c.id)).rejects.toBeInstanceOf(ConflictError);
    const unused = await createCoupon(coupon({ code: "UNUSED" }));
    await deleteCoupon(unused.id);
    expect((await listCoupons()).map((x) => x.code)).toEqual(["SAVE10"]);
  });
});

describe("offers admin", () => {
  beforeEach(resetDb);

  it("validates by type and collection, and reports uses", async () => {
    const col = await createCollection({ name: "Oversized" });
    await expect(createOffer(offer({ pricePaise: null }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createOffer(offer({ type: "QTY_PERCENT", pricePaise: null, percent: null }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createOffer(offer({ collectionId: "missing" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createOffer(offer({ minQty: 1 }))).rejects.toBeInstanceOf(ValidationError);
    const o = await createOffer(offer({ collectionId: col.id }));
    const u = await createUser();
    await createOrderRow(u.id, { offerLabel: "Any 3 for ₹999", status: "PAID" });
    const [row] = await listOffers();
    expect(row).toMatchObject({ id: o.id, collectionName: "Oversized", uses: 1 });
    expect(describeOffer(row)).toBe("Any 3 for ₹999");
    expect(describeOffer({ type: "QTY_PERCENT", minQty: 3, pricePaise: null, percent: 10 })).toBe("10% off 3 or more");
    await deleteOffer(o.id);
    expect(await listOffers()).toEqual([]);
  });
});
```

Create `tests/unit/admin-customers.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createOrderRow, createUser } from "../helpers/fixtures";
import { createAddress } from "@/server/services/addresses";
import { getCustomer, listCustomers } from "@/server/services/admin-customers";

describe("customers admin", () => {
  beforeEach(resetDb);

  it("lists customers with paid-order stats and searches name, email and phone", async () => {
    const a = await createUser({ name: "Asha Rao", email: "asha@example.test" });
    const b = await createUser({ name: "Ravi K", email: "ravi@example.test" });
    await createUser({ name: "Admin", email: "admin@example.test", role: "ADMIN" });
    await createAddress(b.id, { fullName: "Ravi K", phone: "9123456780", line1: "1 Beach Rd", city: "Chennai", state: "Tamil Nadu", pincode: "600001" });
    await createOrderRow(a.id, { status: "PAID", totalPaise: 59900 });
    await createOrderRow(a.id, { status: "DELIVERED", totalPaise: 40100 });
    await createOrderRow(a.id, { status: "EXPIRED", totalPaise: 99900, paidAt: null });
    const all = await listCustomers();
    expect(all.total).toBe(2);
    expect(all.items.find((c) => c.id === a.id)).toMatchObject({ orderCount: 2, totalSpentPaise: 100000 });
    expect(all.items.find((c) => c.id === b.id)).toMatchObject({ orderCount: 0, totalSpentPaise: 0, lastOrderAt: null });
    expect((await listCustomers({ q: "asha" })).items.map((c) => c.id)).toEqual([a.id]);
    expect((await listCustomers({ q: "91234" })).items.map((c) => c.id)).toEqual([b.id]);
  });

  it("shows a customer's addresses and orders", async () => {
    const a = await createUser({ name: "Asha Rao" });
    await createAddress(a.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await createOrderRow(a.id, { status: "PAID", totalPaise: 59900 });
    const d = await getCustomer(a.id);
    expect(d).toMatchObject({ name: "Asha Rao", orderCount: 1, totalSpentPaise: 59900 });
    expect(d.addresses).toHaveLength(1);
    expect(d.orders).toHaveLength(1);
  });
});
```

Create `tests/unit/admin-inventory.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct } from "../helpers/fixtures";
import { listInventory, setVariantStock } from "@/server/services/admin-inventory";
import { NotFoundError, ValidationError } from "@/server/errors";

describe("inventory admin", () => {
  beforeEach(resetDb);

  it("lists non-archived variants, filters low stock at or below the threshold, and searches", async () => {
    await createProduct({ name: "Alpha Tee", variants: [{ size: "S", colorName: "Black", stock: 5 }, { size: "M", colorName: "Black", stock: 6 }] });
    await createProduct({ name: "Old Tee", status: "ARCHIVED", variants: [{ size: "S", colorName: "Red", stock: 0 }] });
    const all = await listInventory();
    expect(all.total).toBe(2);
    expect(all.threshold).toBe(5);
    expect(all.lowCount).toBe(1);
    const low = await listInventory({ lowOnly: true });
    expect(low.items.map((r) => [r.size, r.stock, r.low])).toEqual([["S", 5, true]]);
    expect((await listInventory({ q: "alpha" })).total).toBe(2);
  });

  it("sets stock, resetting the low-stock alert only above the threshold", async () => {
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 1 }] });
    const id = p.variants[0].id;
    await db.productVariant.update({ where: { id }, data: { lowStockAlertedAt: new Date() } });
    await setVariantStock(id, 4);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id } })).lowStockAlertedAt).not.toBeNull();
    const row = await setVariantStock(id, 20);
    expect(row).toMatchObject({ stock: 20, low: false });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id } })).lowStockAlertedAt).toBeNull();
    await expect(setVariantStock(id, -1)).rejects.toBeInstanceOf(ValidationError);
    await expect(setVariantStock("missing", 3)).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

Append to `tests/unit/admin-dashboard.test.ts` (import `createOrderRow`, `createUser`):

```ts
  it("adds revenue windows, queues, recent orders, top products and 14-day bars", async () => {
    const now = new Date("2026-10-10T12:00:00Z"); // 17:30 IST
    const day = 86_400_000;
    const u = await createUser();
    const today = await createOrderRow(u.id, { status: "PAID", totalPaise: 100000, paidAt: new Date(now.getTime() - 3_600_000) });
    await createOrderRow(u.id, { status: "SHIPPED", totalPaise: 50000, paidAt: new Date(now.getTime() - 3 * day) });
    await createOrderRow(u.id, { status: "DELIVERED", totalPaise: 20000, paidAt: new Date(now.getTime() - 20 * day) });
    await createOrderRow(u.id, { status: "DELIVERED", totalPaise: 70000, paidAt: new Date(now.getTime() - 40 * day) });
    await createOrderRow(u.id, { status: "REFUNDED", totalPaise: 99999, paidAt: new Date(now.getTime() - 3_600_000) });
    await createOrderRow(u.id, { status: "PENDING_PAYMENT", paidAt: null, needsAttention: true });
    await db.orderItem.create({ data: { orderId: today.id, productName: "Alpha", productSlug: "alpha", size: "M", colorName: "Black", sku: "A-1", unitPricePaise: 50000, quantity: 2, lineTotalPaise: 100000 } });
    const s = await getDashboardStats(now);
    expect(s.revenue).toEqual({ todayPaise: 100000, last7Paise: 150000, last30Paise: 170000 });
    expect(s).toMatchObject({ paidToday: 1, toShip: 1, needsAttention: 1, lowStockThreshold: 5 });
    expect(s.recentOrders).toHaveLength(6);
    expect(s.topProducts).toEqual([{ productName: "Alpha", units: 2, revenuePaise: 100000 }]);
    expect(s.revenueByDay).toHaveLength(14);
    expect(s.revenueByDay[13]).toEqual({ date: "2026-10-10", revenuePaise: 100000, orders: 1 });
    expect(s.revenueByDay[10]).toEqual({ date: "2026-10-07", revenuePaise: 50000, orders: 1 });
  });
```

Run: `npm test -- tests/unit/dates.test.ts tests/unit/admin-promotions.test.ts tests/unit/admin-customers.test.ts tests/unit/admin-inventory.test.ts tests/unit/admin-dashboard.test.ts`
Expected: FAIL (modules/fields missing).

- [ ] **Step 2: Dates and validation**

Append to `src/lib/dates.ts`:

```ts
export const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;

export function startOfIstDay(d: Date): Date {
  const shifted = d.getTime() + IST_OFFSET_MS;
  const intoDay = ((shifted % DAY_MS) + DAY_MS) % DAY_MS;
  return new Date(shifted - intoDay - IST_OFFSET_MS);
}

export function istDateKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}
```

Create `src/lib/validation/promotions.ts`:

```ts
import { z } from "zod";

const blank = (v: unknown) => v === "" || v === undefined || v === null;
const dateField = z.preprocess(
  (v) => (blank(v) ? null : typeof v === "string" ? new Date(v) : v),
  z.date({ invalid_type_error: "Enter a valid date" }).nullable(),
);
const optionalInt = (min: number, max: number, message: string) =>
  z.preprocess((v) => (blank(v) ? null : v), z.number().int().min(min, message).max(max).nullable());

export const couponInputSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, "Use 3–24 letters, numbers, - or _"),
    type: z.enum(["PERCENT", "FLAT"]),
    value: z.number().int(),
    minSubtotalPaise: z.number().int().min(0).max(10_000_000),
    maxDiscountPaise: optionalInt(100, 10_000_000, "Cap must be at least ₹1"),
    startsAt: dateField,
    endsAt: dateField,
    usageLimit: optionalInt(1, 1_000_000, "Use at least 1"),
    perUserLimit: optionalInt(1, 1000, "Use at least 1"),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "PERCENT" && (v.value < 1 || v.value > 90)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Percent must be between 1 and 90" });
    if (v.type === "FLAT" && v.value < 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Flat discount must be at least ₹1" });
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End must be after start" });
  });
export type CouponInput = z.input<typeof couponInputSchema>;

export const offerInputSchema = z
  .object({
    label: z.string().trim().min(3, "Give the offer a short name").max(60),
    type: z.enum(["BUNDLE_PRICE", "QTY_PERCENT"]),
    minQty: z.number().int().min(2, "At least 2 items").max(20),
    pricePaise: optionalInt(100, 10_000_000, "Price must be at least ₹1"),
    percent: optionalInt(1, 90, "Percent must be between 1 and 90"),
    collectionId: z.preprocess((v) => (blank(v) ? null : v), z.string().min(1).nullable()),
    active: z.boolean(),
    startsAt: dateField,
    endsAt: dateField,
  })
  .superRefine((v, ctx) => {
    if (v.type === "BUNDLE_PRICE" && v.pricePaise === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pricePaise"], message: "Enter the bundle price" });
    if (v.type === "QTY_PERCENT" && v.percent === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["percent"], message: "Enter the percent off" });
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End must be after start" });
  });
export type OfferInput = z.input<typeof offerInputSchema>;
```

- [ ] **Step 3: Services**

Create `src/server/services/admin-promotions.ts`:

```ts
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { formatPaise } from "@/lib/money";
import { PAID_STATUSES } from "@/lib/order-status";
import { couponInputSchema, offerInputSchema } from "@/lib/validation/promotions";

export interface CouponRow {
  id: string; code: string; type: "PERCENT" | "FLAT"; value: number; minSubtotalPaise: number; maxDiscountPaise: number | null;
  startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; perUserLimit: number | null; active: boolean; uses: number; createdAt: Date;
}
export interface OfferRow {
  id: string; label: string; type: "BUNDLE_PRICE" | "QTY_PERCENT"; minQty: number; pricePaise: number | null; percent: number | null;
  collectionId: string | null; collectionName: string | null; active: boolean; startsAt: Date | null; endsAt: Date | null; uses: number;
}

const paid = { in: [...PAID_STATUSES] };

export function describeCoupon(c: Pick<CouponRow, "type" | "value" | "maxDiscountPaise">): string {
  if (c.type === "FLAT") return `${formatPaise(c.value)} off`;
  return `${c.value}% off${c.maxDiscountPaise ? ` (max ${formatPaise(c.maxDiscountPaise)})` : ""}`;
}

export function describeOffer(o: Pick<OfferRow, "type" | "minQty" | "pricePaise" | "percent">): string {
  return o.type === "BUNDLE_PRICE" ? `Any ${o.minQty} for ${formatPaise(o.pricePaise ?? 0)}` : `${o.percent ?? 0}% off ${o.minQty} or more`;
}

function parseCoupon(input: unknown) {
  const r = couponInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  return r.data;
}

function parseOffer(input: unknown) {
  const r = offerInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  return r.data;
}

async function couponUseCounts(codes: string[]): Promise<Map<string, number>> {
  if (!codes.length) return new Map();
  const g = await db.order.groupBy({ by: ["couponCode"], where: { couponCode: { in: codes }, status: paid }, _count: { _all: true } });
  return new Map(g.map((x) => [x.couponCode ?? "", x._count._all]));
}

export async function listCoupons(): Promise<CouponRow[]> {
  const rows = await db.coupon.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
  const uses = await couponUseCounts(rows.map((r) => r.code));
  return rows.map((r) => ({ ...r, uses: uses.get(r.code) ?? 0 }));
}

export async function getCoupon(id: string): Promise<CouponRow> {
  const r = await db.coupon.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("Coupon");
  return { ...r, uses: (await couponUseCounts([r.code])).get(r.code) ?? 0 };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createCoupon(input: unknown): Promise<CouponRow> {
  const data = parseCoupon(input);
  if (await db.coupon.findUnique({ where: { code: data.code } })) throw new ConflictError("A coupon with this code already exists");
  try {
    const r = await db.coupon.create({ data });
    return { ...r, uses: 0 };
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("A coupon with this code already exists");
    throw err;
  }
}

export async function updateCoupon(id: string, input: unknown): Promise<CouponRow> {
  const data = parseCoupon(input);
  const current = await getCoupon(id);
  if (data.code !== current.code) {
    if (current.uses > 0) throw new ConflictError("This code has been used, so it cannot be renamed. Create a new code instead.");
    if (await db.coupon.findUnique({ where: { code: data.code } })) throw new ConflictError("A coupon with this code already exists");
  }
  const r = await db.coupon.update({ where: { id }, data });
  return { ...r, uses: current.uses };
}

export async function deleteCoupon(id: string): Promise<void> {
  const current = await getCoupon(id);
  if (current.uses > 0) throw new ConflictError("This code has been used. Deactivate it instead of deleting it.");
  await db.coupon.delete({ where: { id } });
}

async function offerRows(where: Prisma.OfferWhereInput = {}): Promise<OfferRow[]> {
  const rows = await db.offer.findMany({ where, orderBy: [{ active: "desc" }, { createdAt: "desc" }], include: { collection: { select: { name: true } } } });
  const labels = [...new Set(rows.map((r) => r.label))];
  const g = labels.length ? await db.order.groupBy({ by: ["offerLabel"], where: { offerLabel: { in: labels }, status: paid }, _count: { _all: true } }) : [];
  const uses = new Map(g.map((x) => [x.offerLabel ?? "", x._count._all]));
  return rows.map((r) => ({
    id: r.id, label: r.label, type: r.type, minQty: r.minQty, pricePaise: r.pricePaise, percent: r.percent, collectionId: r.collectionId,
    collectionName: r.collection?.name ?? null, active: r.active, startsAt: r.startsAt, endsAt: r.endsAt, uses: uses.get(r.label) ?? 0,
  }));
}

async function assertCollection(collectionId: string | null): Promise<void> {
  if (collectionId && !(await db.collection.findUnique({ where: { id: collectionId }, select: { id: true } }))) {
    throw new ValidationError({ collectionId: ["Unknown collection"] });
  }
}

export async function listOffers(): Promise<OfferRow[]> {
  return offerRows();
}

export async function getOffer(id: string): Promise<OfferRow> {
  const [row] = await offerRows({ id });
  if (!row) throw new NotFoundError("Offer");
  return row;
}

export async function createOffer(input: unknown): Promise<OfferRow> {
  const data = parseOffer(input);
  await assertCollection(data.collectionId);
  const r = await db.offer.create({ data });
  return getOffer(r.id);
}

export async function updateOffer(id: string, input: unknown): Promise<OfferRow> {
  const data = parseOffer(input);
  await getOffer(id);
  await assertCollection(data.collectionId);
  await db.offer.update({ where: { id }, data });
  return getOffer(id);
}

export async function deleteOffer(id: string): Promise<void> {
  await getOffer(id);
  await db.offer.delete({ where: { id } });
}
```


Create `src/server/services/admin-customers.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { listAddresses, type AddressView } from "@/server/services/addresses";
import { orderWithItems, toOrderSummary, type OrderSummary } from "@/server/services/order-records";
import type { Page } from "@/server/services/catalog";
import { PAID_STATUSES } from "@/lib/order-status";

export interface CustomerRow { id: string; name: string | null; email: string; createdAt: Date; orderCount: number; totalSpentPaise: number; lastOrderAt: Date | null }
export interface CustomerDetail { id: string; name: string | null; email: string; createdAt: Date; addresses: AddressView[]; orders: OrderSummary[]; orderCount: number; totalSpentPaise: number }

const paid = { in: [...PAID_STATUSES] };

export async function listCustomers(args: { q?: string; page?: number; pageSize?: number } = {}): Promise<Page<CustomerRow>> {
  const pageSize = Math.min(Math.max(args.pageSize ?? 25, 1), 100);
  const page = Math.max(args.page ?? 1, 1);
  const q = args.q?.trim();
  const where: Prisma.UserWhereInput = { role: "CUSTOMER" };
  if (q) {
    const digits = q.replace(/\D/g, "");
    const or: Prisma.UserWhereInput[] = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
    if (digits.length >= 4) or.push({ addresses: { some: { phone: { contains: digits } } } }, { orders: { some: { shipPhone: { contains: digits } } } });
    where.OR = or;
  }
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, name: true, email: true, createdAt: true } }),
  ]);
  const stats = users.length
    ? await db.order.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) }, status: paid }, _count: { _all: true }, _sum: { totalPaise: true }, _max: { createdAt: true } })
    : [];
  const byUser = new Map(stats.map((s) => [s.userId, s]));
  return {
    items: users.map((u) => {
      const s = byUser.get(u.id);
      return { ...u, orderCount: s?._count._all ?? 0, totalSpentPaise: s?._sum.totalPaise ?? 0, lastOrderAt: s?._max.createdAt ?? null };
    }),
    total, page, pageSize, hasMore: page * pageSize < total,
  };
}

export async function getCustomer(id: string): Promise<CustomerDetail> {
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, createdAt: true } });
  if (!user) throw new NotFoundError("Customer");
  const [addresses, orders, agg] = await Promise.all([
    listAddresses(id),
    db.order.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 50, include: orderWithItems }),
    db.order.aggregate({ where: { userId: id, status: paid }, _count: { _all: true }, _sum: { totalPaise: true } }),
  ]);
  return { ...user, addresses, orders: orders.map(toOrderSummary), orderCount: agg._count._all, totalSpentPaise: agg._sum.totalPaise ?? 0 };
}
```

Create `src/server/services/admin-inventory.ts`:

```ts
import type { Prisma, ProductStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getSettings } from "@/server/services/settings";
import type { Page } from "@/server/services/catalog";

export interface InventoryRow {
  variantId: string; productId: string; productName: string; productStatus: ProductStatus; sku: string; size: string;
  colorName: string; colorHex: string; stock: number; low: boolean;
}
export interface InventoryPage extends Page<InventoryRow> { threshold: number; lowCount: number }

const include = { product: { select: { id: true, name: true, status: true } } } satisfies Prisma.ProductVariantInclude;
type Row = Prisma.ProductVariantGetPayload<{ include: typeof include }>;
const toRow = (v: Row, threshold: number): InventoryRow => ({
  variantId: v.id, productId: v.product.id, productName: v.product.name, productStatus: v.product.status, sku: v.sku,
  size: v.size, colorName: v.colorName, colorHex: v.colorHex, stock: v.stock, low: v.stock <= threshold,
});

export async function listInventory(args: { q?: string; lowOnly?: boolean; page?: number; pageSize?: number } = {}): Promise<InventoryPage> {
  const { lowStockThreshold: threshold } = await getSettings();
  const pageSize = Math.min(Math.max(args.pageSize ?? 50, 1), 200);
  const page = Math.max(args.page ?? 1, 1);
  const q = args.q?.trim();
  const where: Prisma.ProductVariantWhereInput = { product: { status: { not: "ARCHIVED" } } };
  if (args.lowOnly) where.stock = { lte: threshold };
  if (q) where.OR = [{ sku: { contains: q, mode: "insensitive" } }, { colorName: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }];
  const orderBy: Prisma.ProductVariantOrderByWithRelationInput[] = args.lowOnly
    ? [{ stock: "asc" }, { product: { name: "asc" } }]
    : [{ product: { name: "asc" } }, { sortOrder: "asc" }];
  const [total, rows, lowCount] = await Promise.all([
    db.productVariant.count({ where }),
    db.productVariant.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include }),
    db.productVariant.count({ where: { stock: { lte: threshold }, product: { status: "ACTIVE" } } }),
  ]);
  return { items: rows.map((r) => toRow(r, threshold)), total, page, pageSize, hasMore: page * pageSize < total, threshold, lowCount };
}

const stockSchema = z.number().int("Whole numbers only").min(0, "Stock cannot be negative").max(100_000);

export async function setVariantStock(variantId: string, stock: unknown): Promise<InventoryRow> {
  const parsed = stockSchema.safeParse(stock);
  if (!parsed.success) throw new ValidationError({ stock: parsed.error.issues.map((i) => i.message) });
  const exists = await db.productVariant.findUnique({ where: { id: variantId }, select: { id: true } });
  if (!exists) throw new NotFoundError("Variant");
  const { lowStockThreshold: threshold } = await getSettings();
  const v = await db.productVariant.update({
    where: { id: variantId },
    data: { stock: parsed.data, ...(parsed.data > threshold ? { lowStockAlertedAt: null } : {}) },
    include,
  });
  return toRow(v, threshold);
}
```

Replace `src/server/services/admin-dashboard.ts`:

```ts
import type { OrderStatus } from "@prisma/client";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { addDays, istDateKey, startOfIstDay } from "@/lib/dates";
import { PAID_STATUSES } from "@/lib/order-status";

export interface DashboardStats {
  activeProducts: number; draftProducts: number; archivedProducts: number; lowStockVariants: number; customers: number;
  lowStock: { productId: string; productName: string; size: string; colorName: string; stock: number }[];
  lowStockThreshold: number;
  revenue: { todayPaise: number; last7Paise: number; last30Paise: number };
  paidToday: number; toShip: number; needsAttention: number;
  recentOrders: { id: string; number: string; createdAt: Date; customerName: string; totalPaise: number; status: OrderStatus }[];
  topProducts: { productName: string; units: number; revenuePaise: number }[];
  revenueByDay: { date: string; revenuePaise: number; orders: number }[];
}

export async function getDashboardStats(now: Date = new Date()): Promise<DashboardStats> {
  const { lowStockThreshold } = await getSettings();
  const today = startOfIstDay(now);
  const since7 = addDays(today, -6);
  const since14 = addDays(today, -13);
  const since30 = addDays(today, -29);
  const paid = { in: [...PAID_STATUSES] };
  const lowWhere = { stock: { lte: lowStockThreshold }, product: { status: "ACTIVE" as const } };
  const sumSince = (from: Date) => db.order.aggregate({ where: { status: paid, paidAt: { gte: from, lte: now } }, _sum: { totalPaise: true } });

  const [byStatus, lowStockVariants, customers, low, rToday, r7, r30, paidToday, toShip, needsAttention, recent, top, recentPaid] = await Promise.all([
    db.product.groupBy({ by: ["status"], _count: { _all: true } }),
    db.productVariant.count({ where: lowWhere }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.productVariant.findMany({ where: lowWhere, orderBy: [{ stock: "asc" }, { product: { name: "asc" } }], take: 10, include: { product: { select: { id: true, name: true } } } }),
    sumSince(today), sumSince(since7), sumSince(since30),
    db.order.count({ where: { status: paid, paidAt: { gte: today, lte: now } } }),
    db.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
    db.order.count({ where: { needsAttention: true } }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, number: true, createdAt: true, shipName: true, totalPaise: true, status: true } }),
    db.orderItem.groupBy({
      by: ["productName"],
      where: { order: { status: paid, paidAt: { gte: since30, lte: now } } },
      _sum: { quantity: true, lineTotalPaise: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    db.order.findMany({ where: { status: paid, paidAt: { gte: since14, lte: now } }, select: { paidAt: true, totalPaise: true } }),
  ]);

  const buckets = new Map<string, { revenuePaise: number; orders: number }>();
  for (let i = 13; i >= 0; i--) buckets.set(istDateKey(addDays(today, -i)), { revenuePaise: 0, orders: 0 });
  for (const o of recentPaid) {
    const b = o.paidAt && buckets.get(istDateKey(o.paidAt));
    if (b) { b.revenuePaise += o.totalPaise; b.orders += 1; }
  }
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    activeProducts: count("ACTIVE"), draftProducts: count("DRAFT"), archivedProducts: count("ARCHIVED"), lowStockVariants, customers,
    lowStock: low.map((v) => ({ productId: v.product.id, productName: v.product.name, size: v.size, colorName: v.colorName, stock: v.stock })),
    lowStockThreshold,
    revenue: { todayPaise: rToday._sum.totalPaise ?? 0, last7Paise: r7._sum.totalPaise ?? 0, last30Paise: r30._sum.totalPaise ?? 0 },
    paidToday, toShip, needsAttention,
    recentOrders: recent.map((o) => ({ id: o.id, number: o.number, createdAt: o.createdAt, customerName: o.shipName, totalPaise: o.totalPaise, status: o.status })),
    topProducts: top.map((t) => ({ productName: t.productName, units: t._sum.quantity ?? 0, revenuePaise: t._sum.lineTotalPaise ?? 0 })),
    revenueByDay: [...buckets.entries()].map(([date, b]) => ({ date, ...b })),
  };
}
```

Run the five test files (GREEN).

- [ ] **Step 4: Actions**

Create `src/app/admin/coupons/actions.ts`, `src/app/admin/offers/actions.ts`, `src/app/admin/inventory/actions.ts`, `src/app/admin/settings/actions.ts` with the signatures listed under Interfaces, copying the shape of `src/app/admin/products/actions.ts` (`requireAdmin()` first, service call, `revalidatePath("/", "layout")`, `{ ok: true, data }`, `actionError(err)`). `saveCouponAction`/`saveOfferAction` return `{ id }` of the saved row (`id ? update : create`). `setStockAction` returns the updated `InventoryRow`. `saveSettingsAction` calls `updateSettings(input)`.

- [ ] **Step 5: Pages and components**

All admin pages call `await requireAdminPage()` first, use `h1 className="text-4xl sm:text-5xl"`, and follow the Phase 1C list/detail layout. Tables collapse to stacked cards under `md` (single DOM: `grid` rows that become multi-column at `md`) so nothing scrolls the page sideways at 360 px.

`src/components/admin/delete-button.tsx` (client): generic confirm-then-delete used by coupons and offers — `Button variant="destructive" className="h-11"` opens a `Dialog` with `confirmText` and **Delete** / **Cancel**; on confirm calls `onConfirm()`; ok → `router.push(redirectTo)` + `router.refresh()`; error → `toast.error(message)` (e.g. "This code has been used. Deactivate it instead.").

**Coupons**
- `src/app/admin/coupons/page.tsx`: `listCoupons()`; header with **New coupon** (`h-11`). Each row (`data-testid="coupon-row"`): code (`font-mono font-medium`, links to edit), `describeCoupon`, "Min {formatPaise(min)}" when > 0, the window (`formatDateIst` start – end, or "Always"), `uses` / `usageLimit ?? "∞"`, and an Active/Inactive pill. Empty state: "No coupons yet. Codes let you run a sale without editing prices."
- `src/app/admin/coupons/new/page.tsx` and `[id]/page.tsx` render `<CouponForm coupon={…} />` (edit page catches `NotFoundError` → `notFound()`, and shows `<DeleteButton … onConfirm={deleteCouponAction.bind(null, id)} redirectTo="/admin/coupons" />`).
- `src/components/admin/coupon-form.tsx` (client): fields — **Code** (`Input` `uppercase font-mono`, `autoCapitalize="characters"`); **Type** as two radio cards "Percent off" / "Flat ₹ off" (`min-h-11`); **Value** (`inputMode="numeric"`; label "Percent (1–90)" or "Amount (₹)"; flat amounts converted with `rupeesToPaise`); **Minimum order (₹)** (optional); **Maximum discount (₹)** (percent only); **Starts** / **Ends** `<input type="datetime-local">` (convert with `value ? new Date(value).toISOString() : null`; prefill with a local `YYYY-MM-DDTHH:mm` built from the Date); **Total uses** and **Uses per customer** (optional integers); **Active** checkbox. Save calls `saveCouponAction(coupon?.id ?? null, input)`; on success `toast.success("Saved")` and `router.push("/admin/coupons")`; field errors via `FieldError` keyed by the schema paths. When editing a used code, the Code input is `readOnly` with the hint "Used {uses} times, so the code is locked."

**Offers**
- `src/app/admin/offers/page.tsx`: `listOffers()`; rows (`data-testid="offer-row"`) with label, `describeOffer`, collection name or "All products", window, uses, Active pill; **New offer** button. A one-line explainer at the top: "Customers get the better of the best offer or their coupon, never both."
- `new` / `[id]` pages render `<OfferForm offer={…} collections={await listCollectionOptions()} />` plus `DeleteButton` on edit.
- `src/components/admin/offer-form.tsx` (client): **Name shown to customers** (label), **Type** radio cards "Bundle price (any N for ₹X)" / "Percent off N or more", **Items in the bundle / minimum items** (`minQty`, 2–20), **Bundle price (₹)** or **Percent off**, **Applies to** native `<select>` ("All products" + collections), **Starts** / **Ends** (`datetime-local`, converted as for coupons), **Active**. A live preview line uses `describeOffer`. Save → `saveOfferAction`.

**Customers**
- `src/app/admin/customers/page.tsx`: search form (`q`, label "Search customers", placeholder "Name, email or phone"), `listCustomers({ q, page })`; rows (`data-testid="customer-row"`): name/email (link to detail), joined date, paid orders, total spent, last order date; pagination.
- `src/app/admin/customers/[id]/page.tsx`: header (name, email as `mailto:`, joined), stat tiles (paid orders, total spent), addresses (each with `CopyButton` of `addressText` and `tel:`/WhatsApp links from `contact-links`), and the order list (number links to `/admin/orders/{id}`, date, `OrderStatusBadge`, total).
- In `src/app/admin/orders/[id]/page.tsx` turn "{paidOrderCount} paid orders" into a link to `/admin/customers/{customer.id}`.

**Inventory**
- `src/app/admin/inventory/page.tsx`: `listInventory({ q, lowOnly: sp.low === "1", page })`; filter pills **All** / **Low stock ({lowCount})** (`min-h-11`, `aria-current`), search (`q`, "SKU, product or colour"), `<InventoryTable rows threshold />`, pagination. Caption: "Low = {threshold} or fewer. Change the threshold in Settings."
- `src/components/admin/inventory-table.tsx` (client): rows (`data-testid="inventory-row"`) with colour dot (`colorHex`), product name (link to `/admin/products/{productId}`), `colorName / size`, SKU (`font-mono text-xs`), a Draft pill when not ACTIVE, and an inline stock editor: `<label className="sr-only" htmlFor={id}>Stock for {productName} {colorName} {size}</label><input id={id} type="number" inputMode="numeric" min={0} step={1} className="h-11 w-24 rounded-md border … text-right">`. Saves on blur or Enter when the value changed (`setStockAction(variantId, Number(value))`), shows a spinner while pending, reverts and `toast.error` on failure, `toast.success("Stock updated")` on success; the row gets an amber left border when `stock <= threshold` (and `text-danger` for 0). Escape reverts the edit.

**Settings**
- `src/app/admin/settings/page.tsx`: `<SettingsForm settings={await getSettings()} />`.
- `src/components/admin/settings-form.tsx` (client): one form, sectioned with `<fieldset>`/`<legend>`:
  - *Shipping*: **Shipping fee (₹)**, **Free shipping from (₹)** (rupee inputs → paise).
  - *Stock*: **Low-stock threshold** (integer).
  - *Notifications*: **Admin email for new orders and alerts**, **Send a daily summary at 9 pm** (checkbox), **Send abandoned-bag reminders** (checkbox), **WhatsApp number** (10 digits; used on labels as the seller phone).
  - *Business and GST*: **Business name**, **Business address** (`<textarea rows={3}>`), **State** (native select of `INDIA_STATES` with an empty "Choose…" option), **GSTIN** (optional, uppercase), **GST rate up to the threshold (%)**, **GST rate above the threshold (%)**, **Threshold unit price (₹)**.
  - **Save settings** (`h-11`, sticky at the bottom on mobile like the checkout pay bar) → `saveSettingsAction(values)`; field errors via `FieldError`; success toast. A notice at the top when `sellerAddress` or `sellerState` is empty: "Add your business address and state; they print on labels and invoices."

**Dashboard**
- `src/components/admin/revenue-bars.tsx` (server):

```tsx
import { formatPaise } from "@/lib/money";
import type { DashboardStats } from "@/server/services/admin-dashboard";

export function RevenueBars({ days }: { days: DashboardStats["revenueByDay"] }) {
  const max = Math.max(1, ...days.map((d) => d.revenuePaise));
  const total = days.reduce((s, d) => s + d.revenuePaise, 0);
  const W = 14 * 20;
  const H = 120;
  return (
    <figure className="space-y-2" data-testid="revenue-bars">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="h-40 w-full" role="img" aria-label={`Revenue over the last 14 days: ${formatPaise(total)} in total`}>
        {days.map((d, i) => {
          const h = Math.round((d.revenuePaise / max) * H);
          return (
            <g key={d.date}>
              <rect x={i * 20 + 3} y={H - h} width={14} height={Math.max(h, 1)} rx={2} className={i === days.length - 1 ? "fill-brand" : "fill-text-muted/60"}>
                <title>{`${d.date}: ${formatPaise(d.revenuePaise)} (${d.orders} orders)`}</title>
              </rect>
            </g>
          );
        })}
        <text x={0} y={H + 14} className="fill-text-muted text-[9px]">{days[0]?.date.slice(5)}</text>
        <text x={W} y={H + 14} textAnchor="end" className="fill-text-muted text-[9px]">Today</text>
      </svg>
      <table className="sr-only">
        <caption>Revenue by day</caption>
        <tbody>{days.map((d) => <tr key={d.date}><th scope="row">{d.date}</th><td>{formatPaise(d.revenuePaise)}</td><td>{d.orders} orders</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
```

- Rewrite `src/app/admin/page.tsx` (keep `data-testid="admin-dashboard"`, `low-stock-table`, `low-stock-empty`): top tile row `grid gap-3 grid-cols-2 lg:grid-cols-5` — **Revenue today** (`formatPaise`, sub-label "{paidToday} orders"), **Last 7 days**, **Last 30 days**, **To ship** (links to `/admin/orders`, tone `warn` when > 0), **Needs attention** (links to `/admin/orders?tab=all&attention=1`, tone `warn`). Then a two-column section on `lg`: `RevenueBars` card and **Top products (30 days)** list (name, units, revenue). Then **Recent orders** (10 rows: number link, customer, `formatDateIst`, `OrderStatusBadge`, total) with "All orders →". Then the existing **Running low** table (copy says "{threshold} or fewer" and links each row to the product) and the catalog tiles (Live products / Drafts / Archived / Customers) as a smaller row. `StatTile` accepts `value` strings already.

**Nav**
- `src/components/admin/admin-nav.tsx`: final order **Dashboard, Orders (badge), Products, Collections, Inventory, Customers, Coupons, Offers, Settings** with lucide icons `LayoutDashboard, ShoppingBag, Package, Layers, Boxes, Users, Ticket, Gift, Settings`.

- [ ] **Step 6: Verify and commit**

Run the tests (GREEN), the full gate, then on port 3001 as admin at 360 px and desktop: create a percent coupon with a cap and a bundle offer, confirm checkout applies the better one and says which; try deleting a used coupon (refused with the deactivate hint); edit stock inline from **Low stock**; change the shipping fee in Settings and see checkout update; the dashboard shows revenue tiles, bars, recent orders and top products. Stop the server.

```bash
git add src/lib/dates.ts src/lib/validation/promotions.ts src/server/services/admin-promotions.ts src/server/services/admin-customers.ts src/server/services/admin-inventory.ts src/server/services/admin-dashboard.ts src/app/admin/page.tsx src/app/admin/coupons src/app/admin/offers src/app/admin/customers src/app/admin/inventory src/app/admin/settings "src/app/admin/orders/[id]/page.tsx" src/components/admin/coupon-form.tsx src/components/admin/offer-form.tsx src/components/admin/inventory-table.tsx src/components/admin/settings-form.tsx src/components/admin/revenue-bars.tsx src/components/admin/delete-button.tsx src/components/admin/admin-nav.tsx tests/unit/dates.test.ts tests/unit/admin-promotions.test.ts tests/unit/admin-customers.test.ts tests/unit/admin-inventory.test.ts tests/unit/admin-dashboard.test.ts
git commit -m "feat(admin): add coupons, offers, customers, inventory, settings and a sales dashboard

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 12: Automation jobs and the cron route

**Files:**
- Create: `src/server/jobs/expire-orders.ts`, `src/server/jobs/low-stock.ts`, `src/server/jobs/daily-summary.ts`, `src/server/jobs/abandoned-cart.ts`, `src/server/jobs/index.ts`, `src/app/api/cron/[job]/route.ts`
- Modify: `.env.example`, `.env.test`
- Test: `tests/unit/jobs.test.ts`, `tests/unit/cron-route.test.ts`

**Interfaces:**
- Consumes: `expireStaleOrders`, `placeOrder` (Task 5), `getSettings` (Task 1), `PAID_STATUSES` (Task 1), `lowStockDigestEmail`, `dailySummaryEmail`, `abandonedCartEmail`, `LowStockRow` (Task 6), `sendToAdmin`, `sendEmailSafely` (Task 6), `startOfIstDay`, `istDateKey` (Task 11), `formatDateIst` (Task 7), `safeEqual` (Task 4), `toHttp`, `db`.
- Produces:

```ts
// @/server/jobs/*
export function runExpireOrders(now?: Date): Promise<{ expired: number }>;
export function runLowStock(now?: Date): Promise<{ reset: number; alerted: number; skipped?: "no-recipient" | "failed" }>;
export function runDailySummary(now?: Date): Promise<{ sent: boolean; reason?: "disabled" | "no-recipient" | "already-sent" | "failed" }>;
export function runAbandonedCart(now?: Date): Promise<{ sent: number; reason?: "disabled" }>;
// @/server/jobs
export const JOBS: { "expire-orders": …; "low-stock": …; "daily-summary": …; "abandoned-cart": … };
export type JobName = keyof typeof JOBS;
export function isJobName(s: string): s is JobName;
export function runJob(name: JobName, now?: Date): Promise<unknown>;
// route: POST /api/cron/[job] with "Authorization: Bearer ${CRON_SECRET}" → { data: { job, result, ms } }; 401 bad secret, 404 unknown job, 503 when CRON_SECRET unset
```

Idempotency (spec §8):
- **expire-orders**: conditional status update per order (Task 5), safe to overlap.
- **low-stock**: first resets `lowStockAlertedAt` for variants now above the threshold (this is how stock edits anywhere, including restocks from cancels and the product editor, re-arm the alert), then emails **one digest** for ACTIVE-product variants at or below the threshold whose `lowStockAlertedAt` is null, and stamps them only after the email was sent. No admin email → nothing is stamped, so the alert fires once one is configured.
- **daily-summary**: claims the IST date in `StoreSetting.lastDailySummaryOn` with a conditional update before sending (two overlapping runs cannot both send) and releases the claim if the email fails.
- **abandoned-cart**: signed-in carts whose latest item activity is 3–48 h old, with at least one sellable item, no order created since that activity and `remindedAt` null; each cart is claimed with a conditional `remindedAt` update before sending and released if sending fails. Payment clears `remindedAt` (Task 5), so a later abandoned bag can be reminded again.

- [ ] **Step 1: Failing tests**

Create `tests/unit/jobs.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { getEmail, type ConsoleEmail } from "@/server/adapters/email";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { placeOrder, ORDER_TTL_MS } from "@/server/services/orders";
import { runAbandonedCart } from "@/server/jobs/abandoned-cart";
import { runDailySummary } from "@/server/jobs/daily-summary";
import { runExpireOrders } from "@/server/jobs/expire-orders";
import { runLowStock } from "@/server/jobs/low-stock";

const HOUR = 3_600_000;
const outbox = () => getEmail() as ConsoleEmail;
const settings = (data: { adminNotifyEmail?: string | null; dailySummaryEnabled?: boolean; abandonedCartEnabled?: boolean }) =>
  db.storeSetting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });

beforeEach(async () => {
  await resetDb();
  outbox().sent.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe("expire-orders", () => {
  it("expires past-due pending orders once", async () => {
    const user = await createUser();
    const p = await createProduct({ variants: [{ size: "M", colorName: "Black", stock: 5 }] });
    const address = await createAddress(user.id, { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await addItem({ userId: user.id }, p.variants[0].id, 2);
    await placeOrder(user.id, { addressId: address.id });
    const later = new Date(Date.now() + ORDER_TTL_MS + 1000);
    expect(await runExpireOrders(later)).toEqual({ expired: 1 });
    expect(await runExpireOrders(later)).toEqual({ expired: 0 });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: p.variants[0].id } })).stock).toBe(5);
  });
});

describe("low-stock", () => {
  it("sends one digest, stamps variants, and re-arms after a restock", async () => {
    await settings({ adminNotifyEmail: "owner@example.test" });
    const p = await createProduct({ name: "Alpha Tee", variants: [{ size: "S", colorName: "Black", stock: 2 }, { size: "M", colorName: "Black", stock: 10 }] });
    await createProduct({ status: "DRAFT", variants: [{ size: "S", colorName: "Red", stock: 0 }] });
    expect(await runLowStock()).toEqual({ reset: 0, alerted: 1 });
    expect(outbox().sent).toHaveLength(1);
    expect(outbox().sent[0]).toMatchObject({ to: "owner@example.test", subject: "Low stock: 1 variant at or below 5" });
    expect(await runLowStock()).toEqual({ reset: 0, alerted: 0 });
    expect(outbox().sent).toHaveLength(1);
    const s = p.variants.find((v) => v.size === "S")!;
    await db.productVariant.update({ where: { id: s.id }, data: { stock: 12 } });
    expect(await runLowStock()).toEqual({ reset: 1, alerted: 0 });
    await db.productVariant.update({ where: { id: s.id }, data: { stock: 1 } });
    expect(await runLowStock()).toEqual({ reset: 0, alerted: 1 });
  });

  it("does not stamp anything without an admin email", async () => {
    await settings({ adminNotifyEmail: null });
    const p = await createProduct({ variants: [{ size: "S", colorName: "Black", stock: 1 }] });
    expect(await runLowStock()).toEqual({ reset: 0, alerted: 0, skipped: "no-recipient" });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: p.variants[0].id } })).lowStockAlertedAt).toBeNull();
  });
});

describe("daily-summary", () => {
  it("sends once per IST day and releases the claim when sending fails", async () => {
    await settings({ adminNotifyEmail: "owner@example.test", dailySummaryEnabled: false });
    expect(await runDailySummary()).toEqual({ sent: false, reason: "disabled" });
    await settings({ dailySummaryEnabled: true });
    const u = await createUser();
    await createOrderRow(u.id, { status: "PAID", totalPaise: 59900 });
    const now = new Date();
    vi.spyOn(outbox(), "send").mockRejectedValueOnce(new Error("smtp down"));
    expect(await runDailySummary(now)).toEqual({ sent: false, reason: "failed" });
    expect(await runDailySummary(now)).toEqual({ sent: true });
    expect(outbox().sent.at(-1)?.html).toContain("₹599");
    expect(await runDailySummary(now)).toEqual({ sent: false, reason: "already-sent" });
    expect(await runDailySummary(new Date(now.getTime() + 24 * HOUR))).toEqual({ sent: true });
  });
});

describe("abandoned-cart", () => {
  async function shopperWithBag(hoursAgo: number) {
    const user = await createUser({ name: "Ravi K" });
    const p = await createProduct({ name: `Bag Tee ${hoursAgo}`, variants: [{ size: "L", colorName: "White", stock: 5 }] });
    await addItem({ userId: user.id }, p.variants[0].id, 1);
    await db.cartItem.updateMany({ where: { cart: { userId: user.id } }, data: { updatedAt: new Date(Date.now() - hoursAgo * HOUR) } });
    return user;
  }

  it("reminds signed-in carts idle for 3–48 hours, once", async () => {
    const due = await shopperWithBag(5);
    await shopperWithBag(1);
    await shopperWithBag(50);
    const ordered = await shopperWithBag(6);
    await createOrderRow(ordered.id, { status: "PAID" });
    expect(await runAbandonedCart()).toEqual({ sent: 1 });
    expect(outbox().sent.map((m) => m.to)).toEqual([due.email]);
    expect(await runAbandonedCart()).toEqual({ sent: 0 });
  });

  it("respects the setting", async () => {
    await settings({ abandonedCartEnabled: false });
    await shopperWithBag(5);
    expect(await runAbandonedCart()).toEqual({ sent: 0, reason: "disabled" });
  });
});
```

(If Prisma overwrites an explicitly provided `updatedAt` on `updateMany` in this version, set it with `` db.$executeRaw`UPDATE "CartItem" SET "updatedAt" = ${date} WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = ${user.id})` `` instead.)

Create `tests/unit/cron-route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { POST } from "@/app/api/cron/[job]/route";

const call = (job: string, auth?: string) =>
  POST(new NextRequest(`http://localhost:3000/api/cron/${job}`, { method: "POST", headers: auth ? { authorization: auth } : {} }), { params: Promise.resolve({ job }) });

describe("POST /api/cron/[job]", () => {
  beforeEach(resetDb);
  afterEach(() => vi.unstubAllEnvs());

  it("refuses to run without a configured secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("expire-orders", "Bearer anything")).status).toBe(503);
  });

  it("checks the bearer secret and the job name, then runs the job", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    expect((await call("expire-orders")).status).toBe(401);
    expect((await call("expire-orders", "Bearer wrong")).status).toBe(401);
    expect((await call("nope", "Bearer test-cron-secret")).status).toBe(404);
    const ok = await call("expire-orders", "Bearer test-cron-secret");
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toMatchObject({ job: "expire-orders", result: { expired: 0 } });
  });
});
```

Run: `npm test -- tests/unit/jobs.test.ts tests/unit/cron-route.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Jobs**

Create `src/server/jobs/expire-orders.ts`:

```ts
import { expireStaleOrders } from "@/server/services/orders";

export async function runExpireOrders(now: Date = new Date()): Promise<{ expired: number }> {
  return { expired: await expireStaleOrders(now) };
}
```

Create `src/server/jobs/low-stock.ts`:

```ts
import { db } from "@/server/db";
import { lowStockDigestEmail } from "@/server/emails/templates";
import { sendToAdmin } from "@/server/services/notifications";
import { getSettings } from "@/server/services/settings";

export async function runLowStock(now: Date = new Date()): Promise<{ reset: number; alerted: number; skipped?: "no-recipient" | "failed" }> {
  const { lowStockThreshold: threshold } = await getSettings();
  const reset = await db.productVariant.updateMany({ where: { lowStockAlertedAt: { not: null }, stock: { gt: threshold } }, data: { lowStockAlertedAt: null } });
  const rows = await db.productVariant.findMany({
    where: { lowStockAlertedAt: null, stock: { lte: threshold }, product: { status: "ACTIVE" } },
    include: { product: { select: { name: true } } },
    orderBy: [{ stock: "asc" }, { sku: "asc" }],
    take: 200,
  });
  if (rows.length === 0) return { reset: reset.count, alerted: 0 };
  const result = await sendToAdmin(lowStockDigestEmail(rows.map((v) => ({ productName: v.product.name, size: v.size, colorName: v.colorName, sku: v.sku, stock: v.stock })), threshold));
  if (result !== "sent") return { reset: reset.count, alerted: 0, skipped: result };
  await db.productVariant.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { lowStockAlertedAt: now } });
  return { reset: reset.count, alerted: rows.length };
}
```

Create `src/server/jobs/daily-summary.ts`:

```ts
import { db } from "@/server/db";
import { dailySummaryEmail } from "@/server/emails/templates";
import { sendToAdmin } from "@/server/services/notifications";
import { getSettings } from "@/server/services/settings";
import { formatDateIst, istDateKey, startOfIstDay } from "@/lib/dates";
import { PAID_STATUSES } from "@/lib/order-status";

export async function runDailySummary(now: Date = new Date()): Promise<{ sent: boolean; reason?: "disabled" | "no-recipient" | "already-sent" | "failed" }> {
  const s = await getSettings();
  if (!s.dailySummaryEnabled) return { sent: false, reason: "disabled" };
  if (!s.adminNotifyEmail) return { sent: false, reason: "no-recipient" };
  const key = istDateKey(now);
  const claim = await db.storeSetting.updateMany({
    where: { id: 1, OR: [{ lastDailySummaryOn: null }, { lastDailySummaryOn: { not: key } }] },
    data: { lastDailySummaryOn: key },
  });
  if (claim.count !== 1) return { sent: false, reason: "already-sent" };

  const start = startOfIstDay(now);
  const paid = { in: [...PAID_STATUSES] };
  const [agg, toShip, needsAttention, lowStock] = await Promise.all([
    db.order.aggregate({ where: { status: paid, paidAt: { gte: start, lte: now } }, _count: { _all: true }, _sum: { totalPaise: true } }),
    db.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
    db.order.count({ where: { needsAttention: true } }),
    db.productVariant.count({ where: { stock: { lte: s.lowStockThreshold }, product: { status: "ACTIVE" } } }),
  ]);
  const result = await sendToAdmin(dailySummaryEmail({
    dateLabel: formatDateIst(now), paidOrders: agg._count._all, revenuePaise: agg._sum.totalPaise ?? 0, toShip, needsAttention, lowStock,
  }));
  if (result !== "sent") {
    await db.storeSetting.update({ where: { id: 1 }, data: { lastDailySummaryOn: s.lastDailySummaryOn } });
    return { sent: false, reason: result === "no-recipient" ? "no-recipient" : "failed" };
  }
  return { sent: true };
}
```

Create `src/server/jobs/abandoned-cart.ts`:

```ts
import { db } from "@/server/db";
import { abandonedCartEmail } from "@/server/emails/templates";
import { sendEmailSafely } from "@/server/services/notifications";
import { getSettings } from "@/server/services/settings";

const HOUR = 3_600_000;

export async function runAbandonedCart(now: Date = new Date()): Promise<{ sent: number; reason?: "disabled" }> {
  const s = await getSettings();
  if (!s.abandonedCartEnabled) return { sent: 0, reason: "disabled" };
  const newest = new Date(now.getTime() - 3 * HOUR);
  const oldest = new Date(now.getTime() - 48 * HOUR);
  const carts = await db.cart.findMany({
    where: { userId: { not: null }, remindedAt: null, items: { some: { updatedAt: { gte: oldest } } } },
    include: {
      user: { select: { email: true, name: true } },
      items: { include: { variant: { include: { product: { select: { name: true, status: true } } } } } },
    },
    take: 500,
  });
  let sent = 0;
  for (const c of carts) {
    if (!c.user || !c.userId || c.items.length === 0) continue;
    const last = new Date(Math.max(...c.items.map((i) => i.updatedAt.getTime())));
    if (last > newest || last < oldest) continue;
    const live = c.items.filter((i) => i.variant.product.status === "ACTIVE" && i.variant.stock > 0);
    if (live.length === 0) continue;
    if ((await db.order.count({ where: { userId: c.userId, createdAt: { gte: last } } })) > 0) continue;
    const claim = await db.cart.updateMany({ where: { id: c.id, remindedAt: null }, data: { remindedAt: now } });
    if (claim.count !== 1) continue;
    const ok = await sendEmailSafely({
      to: c.user.email,
      ...abandonedCartEmail({ name: c.user.name, items: live.map((i) => ({ name: i.variant.product.name, size: i.variant.size, colorName: i.variant.colorName })) }),
    });
    if (ok) sent++;
    else await db.cart.update({ where: { id: c.id }, data: { remindedAt: null } });
  }
  return { sent };
}
```

Create `src/server/jobs/index.ts`:

```ts
import { runAbandonedCart } from "./abandoned-cart";
import { runDailySummary } from "./daily-summary";
import { runExpireOrders } from "./expire-orders";
import { runLowStock } from "./low-stock";

export const JOBS = {
  "expire-orders": runExpireOrders,
  "low-stock": runLowStock,
  "daily-summary": runDailySummary,
  "abandoned-cart": runAbandonedCart,
} as const;

export type JobName = keyof typeof JOBS;

export function isJobName(s: string): s is JobName {
  return Object.prototype.hasOwnProperty.call(JOBS, s);
}

export function runJob(name: JobName, now: Date = new Date()): Promise<unknown> {
  return JOBS[name](now);
}
```

- [ ] **Step 3: Cron route and env**

Create `src/app/api/cron/[job]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { toHttp } from "@/server/errors";
import { isJobName, runJob } from "@/server/jobs";
import { safeEqual } from "@/server/payments/hmac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ job: string }> }): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Bad cron secret" } }, { status: 401 });
  }
  const { job } = await ctx.params;
  if (!isJobName(job)) return NextResponse.json({ error: { code: "NOT_FOUND", message: `Unknown job ${job}` } }, { status: 404 });
  const started = Date.now();
  try {
    const result = await runJob(job);
    const ms = Date.now() - started;
    console.info(`[cron] ${job} done in ${ms}ms`, JSON.stringify(result));
    return NextResponse.json({ data: { job, result, ms } });
  } catch (err) {
    const { status, body } = toHttp(err);
    return NextResponse.json(body, { status });
  }
}
```

Append to `.env.example`:

```bash
# Cron: POST /api/cron/<job> with "Authorization: Bearer $CRON_SECRET" (see README → Cron)
CRON_SECRET="replace-with-openssl-rand-hex-32"
```

Append to `.env.test`:

```bash
CRON_SECRET="test-cron-secret"
```

- [ ] **Step 4: Verify and commit**

Run the two test files (GREEN), then the full gate. Manual check on port 3001: `curl -s -X POST -H "Authorization: Bearer <CRON_SECRET from .env>" http://localhost:3001/api/cron/low-stock` returns `{ "data": { "job": "low-stock", … } }` and the console email adapter prints the digest when an admin email is set; a wrong secret returns 401. Stop the server.

```bash
git add src/server/jobs src/app/api/cron .env.example .env.test tests/unit/jobs.test.ts tests/unit/cron-route.test.ts
git commit -m "feat(ops): add cron jobs for order expiry, low-stock alerts, daily summary and abandoned bags

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 13: End-to-end tests (desktop + 390×844 mobile), README, env audit

**Files:**
- Create: `tests/e2e/checkout.spec.ts`, `tests/e2e/checkout-mobile.spec.ts`
- Modify: `tests/e2e/helpers.ts` (address + mock checkout helpers), `playwright.config.ts` (mobile checkout project, mock provider, `.env` loading), `README.md`, `.env.example` (final audit)

**Interfaces:**
- Consumes: `register`, `login`, `addFirstProductToBag`, `uniqueEmail` (existing e2e helpers); test ids and labels from Tasks 3 (`address-form` labels, "Save address"), 7 (`checkout-page`, `address-option`, `pay-button`, `mock-pay-succeed`, `mock-pay-fail`, `order-success`, `order-number`, `retry-payment`), 8 (`account-order-row`, `order-stepper`, `invoice-link`), 9 (`order-row`, `admin-order`, `order-status`, labels "Carrier", "Tracking number", button "Save & mark shipped"), 10 (`shipping-label`, barcode `role="img"` named "Barcode ORD-…"); seeded admin from `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- Produces (tests/e2e/helpers.ts):

```ts
export function fillAddressForm(page: Page): Promise<void>;
export function checkoutWithMockPayment(page: Page, outcome?: "succeed" | "fail"): Promise<string>;   // returns the order number
export function hasNoHorizontalScroll(page: Page): Promise<boolean>;
```

- [ ] **Step 1: Playwright config**

In `playwright.config.ts`:
- If the file does not already load `.env` (Plan 1C Task 7 adds it), add at the top: `import { config as loadEnv } from "dotenv"; loadEnv({ path: ".env" });`.
- In `webServer.env` add `PAYMENT_PROVIDER: "mock"` so e2e never reaches Razorpay even if the dev `.env` is switched to it.
- Give the `desktop` project `testIgnore: /checkout-mobile/`.
- Add a project: `{ name: "mobile-checkout", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, testMatch: /checkout-mobile/ }` (Chromium with touch, 390×844 as the spec requires). Existing `mobile`/`reduced-motion` `testMatch` values already exclude the new specs.

- [ ] **Step 2: Helpers**

Append to `tests/e2e/helpers.ts`:

```ts
export async function fillAddressForm(page: Page) {
  const form = page.getByTestId("address-form");
  await form.getByLabel("Full name").fill("Asha Rao");
  await form.getByLabel("Mobile number").fill("9876543210");
  await form.getByLabel("House, flat, street").fill("12 MG Road");
  await form.getByLabel("City").fill("Bengaluru");
  await form.getByLabel("State").selectOption("Karnataka");
  await form.getByLabel("PIN code").fill("560001");
  await form.getByRole("button", { name: "Save address" }).click();
}

export async function checkoutWithMockPayment(page: Page, outcome: "succeed" | "fail" = "succeed"): Promise<string> {
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-page")).toBeVisible();
  if ((await page.getByTestId("address-option").count()) === 0) await fillAddressForm(page);
  await expect(page.getByTestId("address-option").first()).toBeVisible();
  await page.getByTestId("pay-button").click();
  await expect(page).toHaveURL(/\/checkout\/mock-pay\//);
  await page.getByTestId(outcome === "succeed" ? "mock-pay-succeed" : "mock-pay-fail").click();
  await expect(page).toHaveURL(/\/orders\/ORD-\d+\/success/);
  return page.url().match(/ORD-\d+/)![0];
}

export async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}
```

- [ ] **Step 3: Desktop spec**

Create `tests/e2e/checkout.spec.ts`:

```ts
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addFirstProductToBag, checkoutWithMockPayment, login, register, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function adminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await page.goto("/admin");
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  return page;
}

test.describe("checkout and fulfilment", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");

  test("customer pays with the mock provider; admin prints a label and ships with tracking", async ({ page, browser }) => {
    test.slow();
    await register(page, uniqueEmail("buyer"), "Asha Rao");
    await addFirstProductToBag(page);
    const number = await checkoutWithMockPayment(page);
    await expect(page.getByTestId("order-success")).toContainText(/confirmed/i);
    await expect(page.getByTestId("order-number")).toHaveText(number);

    await page.goto("/account/orders");
    const row = page.getByTestId("account-order-row").filter({ hasText: number });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByTestId("order-stepper")).toBeVisible();
    await expect(page.getByTestId("invoice-link")).toBeVisible();

    const admin = await adminPage(browser);
    await admin.goto(`/admin/orders?q=${encodeURIComponent(number)}`);
    await admin.getByTestId("order-row").filter({ hasText: number }).getByRole("link", { name: number }).click();
    await expect(admin.getByTestId("admin-order")).toBeVisible();
    const orderId = new URL(admin.url()).pathname.split("/").pop()!;

    const label = await admin.context().newPage();
    await label.goto(`/admin/orders/print?doc=label&ids=${orderId}`);
    await expect(label.getByTestId("shipping-label")).toHaveCount(1);
    await expect(label.getByTestId("shipping-label").getByRole("img", { name: `Barcode ${number}` })).toBeVisible();
    await expect(label.getByTestId("shipping-label")).toContainText("560001");
    await label.close();

    await admin.getByLabel("Carrier").selectOption("delhivery");
    await admin.getByLabel("Tracking number").fill("E2E1234567");
    await admin.getByRole("button", { name: "Save & mark shipped" }).click();
    await expect(admin.getByTestId("order-status").first()).toHaveText(/shipped/i);
    await admin.context().close();

    await page.reload();
    await expect(page.getByText("E2E1234567")).toBeVisible();
    await expect(page.getByTestId("order-status").first()).toHaveText(/shipped/i);
  });

  test("a failed payment can be retried", async ({ page }) => {
    test.slow();
    await register(page, uniqueEmail("retry"));
    await addFirstProductToBag(page);
    await checkoutWithMockPayment(page, "fail");
    await expect(page.getByRole("heading", { name: /payment not completed/i })).toBeVisible();
    await page.getByTestId("retry-payment").click();
    await expect(page).toHaveURL(/\/checkout\/mock-pay\//);
    await page.getByTestId("mock-pay-succeed").click();
    await expect(page.getByTestId("order-success")).toBeVisible();
  });
});
```

- [ ] **Step 4: Mobile spec**

Create `tests/e2e/checkout-mobile.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { addFirstProductToBag, fillAddressForm, hasNoHorizontalScroll, register, uniqueEmail } from "./helpers";

test("mobile checkout at 390×844: no sideways scroll, reachable pay bar, completes with the mock provider", async ({ page }) => {
  test.slow();
  await register(page, uniqueEmail("mobile"));
  await addFirstProductToBag(page);
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-page")).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  await fillAddressForm(page);
  await expect(page.getByTestId("address-option")).toHaveCount(1);
  const pay = page.getByTestId("pay-button");
  await expect(pay).toBeInViewport();
  expect((await pay.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  await pay.click();
  await expect(page).toHaveURL(/\/checkout\/mock-pay\//);
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await page.getByTestId("mock-pay-succeed").click();
  await expect(page.getByTestId("order-success")).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  await page.getByRole("link", { name: "View order" }).click();
  await expect(page.getByTestId("order-stepper")).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});
```

- [ ] **Step 5: README and env audit**

Add these sections to `README.md` (after "Local setup"):

````markdown
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

An order is marked paid by whichever arrives first: the signed browser callback (`POST /api/payments/verify`) or the signed webhook. Both are idempotent and check the amount. Razorpay cannot reach `localhost`, so locally you rely on the browser callback (or use a tunnel). Unpaid orders hold stock for 30 minutes, then expire.

## Cron

Automations run through `POST /api/cron/<job>` with `Authorization: Bearer $CRON_SECRET`:

| Job | When | What |
|---|---|---|
| `expire-orders` | every 5 min | unpaid orders older than 30 min → Expired, stock released |
| `low-stock` | hourly | one email listing variants at or below the Settings threshold |
| `daily-summary` | 21:00 IST | today's orders, revenue, to-ship, needs-attention, low stock |
| `abandoned-cart` | hourly | one reminder to signed-in shoppers whose bag has been idle 3–48 h |

On the EC2 box (`crontab -e`, server clock in UTC; 21:00 IST = 15:30 UTC):

```cron
*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/expire-orders >/dev/null
0 * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/low-stock >/dev/null
30 15 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/daily-summary >/dev/null
15 * * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/abandoned-cart >/dev/null
```

(Define `CRON_SECRET=…` at the top of the crontab.) Every job is safe to run twice. Emails go to **Admin → Settings → Admin email**.

## Email

`EMAIL_DRIVER=console` prints emails to the server log (default). `EMAIL_DRIVER=smtp` sends through `SMTP_URL`, e.g. `smtps://you%40gmail.com:app-password@smtp.gmail.com:465` (use an app password), from `EMAIL_FROM`. `EMAIL_DRIVER=ses` uses Amazon SES. Email failures never block an order; they appear as "Email failed" on the order timeline.

## Admin: daily order routine

1. **Orders → To ship** (default tab, oldest first). Select the batch → **Print labels** and **Print slips** (4×6 labels, A4 slips) → **Mark processing**.
2. Pack against the slip. On each order, **Copy** the address into the courier's booking page, enter the carrier and AWB, **Save & mark shipped**: the customer gets the tracking email.
3. **Needs attention** collects payments that arrived after expiry or with a wrong amount, and money received for cancelled orders.
4. Carrier tracking links are templates in `src/lib/carriers.ts`; check each carrier once with a real AWB before launch.

## Environment variables

| Name | Needed | Purpose |
|---|---|---|
| `DATABASE_URL` | always | PostgreSQL |
| `AUTH_SECRET`, `AUTH_TRUST_HOST` | always | Auth.js |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | Google sign-in |
| `NEXT_PUBLIC_SITE_URL` | always | absolute links in emails and metadata |
| `STORAGE_DRIVER` (+ `AWS_REGION`, `S3_BUCKET`, `S3_PUBLIC_BASE_URL` for `s3`) | always | image storage |
| `EMAIL_DRIVER`, `EMAIL_FROM` (+ `SMTP_URL` for `smtp`, `AWS_REGION` for `ses`) | always | email |
| `PAYMENT_PROVIDER` | always in production (`razorpay`) | `mock` or `razorpay` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | with `razorpay` | Razorpay API and webhook |
| `CRON_SECRET` | production | protects `/api/cron/*` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | seeding, e2e | seeded admin |
````

Audit `.env.example`: it must now contain, in this order, the blocks Database, Auth.js, Site, Adapters (`STORAGE_DRIVER`, `EMAIL_DRIVER="console"`, `EMAIL_FROM`, with the comment `console|ses|smtp`), SMTP (`SMTP_URL=""`), S3, Payments (`PAYMENT_PROVIDER="mock"`, three empty `RAZORPAY_*`), Cron (`CRON_SECRET`), Seed admin. Every variable read via `process.env` in `src/` must appear there (check with `grep -rhoE "process\.env\.[A-Z_]+" src | sort -u`; `NODE_ENV` and `NEXT_DIST_DIR` are exempt).

- [ ] **Step 6: Run everything and commit**

Run `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`. All green (the admin/checkout desktop spec is skipped only if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are missing from `.env`; they are set by the seed setup). Revert `tsconfig.json`/`next-env.d.ts` churn. Confirm nothing listens on port 3001 afterwards. E2E orders stay in the dev database as shipped/paid records; they do not affect later runs (each run registers new users).

```bash
git add tests/e2e/checkout.spec.ts tests/e2e/checkout-mobile.spec.ts tests/e2e/helpers.ts playwright.config.ts README.md .env.example
git commit -m "test(e2e): cover checkout, mock payment, account orders and admin shipping on desktop and mobile

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

## Spec decisions resolved in this plan

- **Offer vs coupon tie:** the offer wins (the coupon is not consumed); the UI explains when a valid code lost to a bigger offer.
- **Coupon date window:** inclusive at both ends; admin dates are entered in the browser's local time and sent as ISO instants.
- **Minimum order:** totals below ₹1 (e.g. a flat coupon wiping out a small bag with free shipping) are rejected because Razorpay needs at least 100 paise.
- **Cart clearing:** the bag is cleared of ordered variants only when the order is paid; items added after placing the order stay.
- **Payment for a cancelled order:** status stays Cancelled, the payment id is stored and the order is flagged for a refund (never silently re-opened).
- **Deleting a collection** cascades its offers (an offer never silently widens to "all products").
- **Low-stock re-arming** is done by the job (reset when stock rises above the threshold), so every stock edit path re-arms alerts without touching the in-progress product editor; the inventory quick edit also resets immediately.
- **Daily summary idempotency** uses one extra column, `StoreSetting.lastDailySummaryOn` (IST date).
- **Seller state** defaults to empty; until it is set in Settings, invoices use IGST and the settings page shows a reminder.
- **GST on shipping** uses the highest item rate on the order (SAC 9965); the order discount is allocated to item lines proportionally before extracting tax.
- **Print views "outside the admin chrome"** are achieved with print CSS on `/admin/orders/print` (App Router cannot skip the admin layout for one route without moving the in-progress admin pages into a route group); the customer invoice lives at `/invoice/[number]`, outside the storefront layout.
- **Order status page:** `/orders/[number]/success` handles paid, confirming, failed/dismissed (with Retry payment) and expired states, so Task 7 works before the account pages exist.
- **Search in admin orders** spans all statuses (the tab is ignored while searching); "To ship" lists oldest paid first.
- **Jobs import the database directly** (`src/server/jobs/*` is allowed alongside services).

## Carried-over deferrals relevant to this plan

- Real courier integration (Shiprocket), COD, OTP and GST filing stay out of scope (spec §1).
- Carrier tracking URL templates need a one-time check with real AWBs.
- In-memory rate limits assume one app instance (as in Phase 1).
- Invoice numbering reuses the order number; if the accountant needs a gap-free financial-year series, add a separate sequence later.

## Plan self-review

- **Spec coverage:** §2 decisions → Tasks 1, 2, 4, 5, 6, 7, 8; §3 data model → Task 1; §4 pricing → Task 2 (+ server quote); §5 storefront → Tasks 3, 7, 8; §6 payments → Tasks 4, 5, 7; §7 admin 1–9 → Tasks 9 (list, detail, CSV, badge), 10 (print), 11 (customers, coupons, offers, inventory, dashboard, settings); §8 automations → Tasks 6 (event emails) and 12 (jobs, cron); §9 testing → every task has Vitest coverage, Task 13 adds Playwright desktop + 390×844.
- **Placeholders:** none; UI tasks specify files, props, actions called, markup, test ids and accessibility, with full code where short.
- **Consistency check (every referenced symbol and where it is defined):** `INDIA_STATES`, `isIndiaState` (T1) · `PAID_STATUSES`, `STOCK_HOLDING_STATUSES`, `ORDER_STATUS_LABEL`, `ORDER_EVENT_TYPES`/`OrderEventType`, `FulfilmentStatus`, `isPaidStatus`, `canCancel`, `fulfilmentRank`, `nextFulfilmentStatus` (T1) · `optionalText`, `normalizeIndianPhone`, `phoneSchema` (T1) · `settingsInputSchema`/`SettingsInput`, `getSettings`, `updateSettings`, `StoreSettings` (T1) · `createUser` (T1), `createOrderRow` (T2) fixtures · `priceCart`, `offerDiscount`, `couponDiscount`, `couponProblem`, `discountLabel`, `PricingLine/Offer/Coupon/Settings/Context`, `PriceResult` (T2) · `quote`, `getLiveOffers`, `findCoupon`, `couponUses`, `normalizeCouponCode`, `UNKNOWN_COUPON` (T2) · `addressInputSchema`, `pincodeSchema`, `AddressFormValues`, `EMPTY_ADDRESS`, `addressLines`, `formatPhone`, `addressText`, `requireUserId`, `AddressView`, `MAX_ADDRESSES`, address service functions and actions, `AddressForm`, `AddressBook`, `AccountNav` (T3) · `PaymentError`, `PaymentProvider`, `ProviderName`, `ProviderOrder`, `hmacSha256Hex`, `safeEqual`, `verifyHmac`, `RazorpayProvider`, `FetchLike`, `MockProvider`, `MOCK_SECRET`, `newMockPaymentId`, `paymentProviderName`, `getPaymentProvider`, `isMockPayments`, `resetPaymentProviderCache` (T4) · `StockIssue`, `StockChangedError`, `Tx`, `ShipAddress`, `OrderItemView`, `OrderView`, `OrderSummary`, `orderWithItems`, `OrderRow`, `toOrderView`, `toOrderSummary`, `orderDiscountLabel`, `addOrderEvent`, `getOrderById` (T5 order-records) · `ORDER_TTL_MS`, `MIN_ORDER_PAISE`, `placeOrderSchema`, `PlaceOrderInput`, `CheckoutPayload`, `CheckoutLineRow`, `loadCheckoutLines`, `unitPriceOf`, `lineName`, `toPricingLines`, `reconcileCartStock`, `placeOrder`, `releaseOrder`, `expireStaleOrders`, `cancelOrder`, `markOrderPaid`, `PaymentSource`, `MarkPaidOutcome`, `recordPaymentFailure`, `findOrderByProviderOrderId`, `getOrderForUser`, `listOrdersForUser`, `getRetryPayload` (T5) · `SmtpEmail`, `RenderedEmail`, `siteUrl`, all email templates, `LowStockRow`, `DailySummary`, `OrderNotice`, `notifyOrder`, `sendEmailSafely`, `sendToAdmin`, `AdminSendResult` (T6) · `formatDateIst`, `formatTimeIst`, `formatDateTimeIst`, `IST_TIME_ZONE` (T7), `IST_OFFSET_MS`, `startOfIstDay`, `istDateKey`, `addDays` (T11) · `CheckoutView`, `CheckoutLineView`, `getCheckoutView`, `quoteForUser`, `CartPricingPreview`, `previewCartPricing`, `getCurrentCartPreview`, `verifyPaymentSchema`, `confirmClientPayment`, `getOwnedOrderRef`, `handleRazorpayWebhook`, `WebhookResult`, checkout actions, `startPayment`, `loadRazorpay`, `PayNav`, `orderStatusUrl`, `PriceBreakup`, `RetryPaymentButton`, `AutoRefresh`, `CheckoutForm` (T7) · `gstRateFor`, `splitInclusive`, `allocateDiscount`, `buildInvoice`, `invoiceFromOrder`, `Invoice*` types, `InvoiceDocument`, `PrintToolbar`, `PageSize`, `OrderStatusPill`, `OrderStepper`, `OrderCard` (T8) · `CARRIERS`, `CarrierId`, `CARRIER_IDS`, `carrierById`, `trackingUrlFor`, `telLink`, `whatsappLink`, `orderWhatsappText`, `toCsv`, `CsvCell`, `ORDER_TABS`, `OrderTab`, `parseOrderTab`, `trackingInputSchema`, `TrackingInput`, `adminNoteSchema`, `cancelReasonSchema`, admin-orders service and actions, `OrderStatusBadge`, `OrdersTable`, `OrderActions`, `TrackingForm`, `AdminNoteForm`, `OrderTimeline`, `CopyButton`, `AdminNav({ toShipCount })` (T9) · `CODE128_PATTERNS`, `CODE128_STOP`, `code128BValues`, `code128Widths`, `code128Bars`, `Bar`, `Barcode`, `LabelDocument`, `SlipDocument`, `getOrdersForPrint` (T10) · `couponInputSchema`, `offerInputSchema`, `CouponInput`, `OfferInput`, admin-promotions/customers/inventory services, extended `DashboardStats`/`getDashboardStats`, coupon/offer/inventory/settings actions, `CouponForm`, `OfferForm`, `InventoryTable`, `SettingsForm`, `RevenueBars`, `DeleteButton` (T11) · `runExpireOrders`, `runLowStock`, `runDailySummary`, `runAbandonedCart`, `JOBS`, `JobName`, `isJobName`, `runJob` (T12) · `fillAddressForm`, `checkoutWithMockPayment`, `hasNoHorizontalScroll` (T13). Every symbol is defined in the task listed or earlier than its first use.
- **Order of dependencies:** each task only consumes symbols from earlier tasks or existing code; `lib` files that reference server types use `import type` only.
