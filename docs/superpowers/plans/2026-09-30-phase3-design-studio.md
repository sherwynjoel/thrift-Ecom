# Phase 3: Custom Design Studio and Print Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/customize` placeholder with a Design Studio where a customer picks a customizable blank (`isCustomizable = true`), a color and a size, designs the front and back with uploaded images and text on a 2D canvas over an SVG shirt mockup, sees the price (blank + print fees) update live, confirms artwork rights and adds the custom shirt to the bag. Designs are saved server-side with preview and 300 DPI print PNGs, flow through cart, checkout, orders, emails, invoices and packing slips, and reach a new admin **Print queue** (download print files, mark printed, hold with a note) that automatically moves an order to Processing once all its custom items are printed. A daily job purges abandoned designs.

**Architecture:** Pure, client-safe studio logic lives in `src/lib/studio/*` (constants, DPI maths, undo history, canvas-JSON validation and font remapping, pinch maths, SVG mockup markup), plus `src/lib/custom-pricing.ts`, `src/lib/png.ts` and `src/lib/print-queue.ts`. The Phase 2 pricing engine (`priceCart`) gains one rule: lines flagged `custom` are only counted by offers with `includeCustom`. Database logic stays in services: `src/server/services/designs.ts` (studio products, create design + add to bag, owner reads, asset uploads), the extended `cart.ts` (custom lines, service-level uniqueness backed by a partial unique index, guest-to-user design hand-over), `print-queue.ts`, and the new `purge-designs` job. Binary files go through the existing storage adapter (which gains `get`) under `designs/assets/`, `designs/previews/` and `designs/print/`. The editor uses Fabric v6, imported only in the browser (`await import("fabric")` inside client modules that are themselves loaded with `next/dynamic` and `ssr: false`). The browser renders the preview and print PNGs; the server only validates (magic bytes, PNG header dimensions, JSON shape, asset origins) and stores them.

**Tech Stack:** Next.js 15 App Router, React 19 Server Actions and `useTransition`, Prisma 6 on PostgreSQL (one raw-SQL partial index), Zod 3, shadcn/ui on Base UI (render prop, no `asChild`), Fabric.js v6 (browser only), `next/font/google` (Anton, Bebas Neue, Inter, Permanent Marker), Vitest against the real test database, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-phase3-design-studio-design.md` is binding in full. Phase 2 (`docs/superpowers/plans/2026-09-30-phase2-commerce-ops.md`, all 13 tasks) must be implemented and merged before Task 1 starts; this plan edits Phase 2 files by the exact names that plan gives them. Conventions of the Phase 1 and Phase 2 specs (money in integer paise, GST-inclusive prices, error mapping, API envelope, rate limiting, mobile-first, admin guard) still apply.

## Global Constraints

- Node 22, npm 11, Git Bash on Windows; the repo is OneDrive-synced (slow installs and file ops; wait, retry once only on a real error). C: drive is low on space; on ENOSPC stop and report **BLOCKED** with the command that failed.
- Money is integer paise in the database, services, pricing and the API. Prices are **GST-inclusive** everywhere (cart, checkout, orders, invoices); tax is only ever *extracted* from the inclusive amount on the invoice. Admin inputs are typed in rupees and converted only at the UI boundary with `rupeesToPaise`/`paiseToRupees` from `@/lib/money`; display uses `formatPaise`.
- Only `src/server/services/*` and `src/server/jobs/*` import `@/server/db`. Pages, actions and route handlers call services. Client components import only types (`import type`) from `@/server/*`, and may import from `@/lib/*` (everything in `src/lib` stays client-safe: no `node:` imports, no db).
- Every admin page calls `requireAdminPage()` (`src/app/admin/guard.ts`); every admin Server Action and admin route handler calls `requireAdmin()` from `@/server/admin-guard` before doing anything else. Storefront actions resolve the user with `requireUserId()` (Phase 2 Task 3) or the cart owner with `resolveCartRef()`.
- After any admin mutation call `revalidatePath("/", "layout")` (storefront stock and the admin nav badges both depend on it).
- shadcn primitives are the Base UI variant: compose with `render={<Link href="…" />}` plus `nativeButton={false}`, never `asChild`. Available primitives: accordion, badge, button, dialog, input, label, select, separator, sheet, skeleton, sonner, tabs. Use native `<textarea>`, `<input type="checkbox">`, `<input type="radio">`, `<input type="range">`, `<input type="color">`, `<select>`, `<table>` styled with Tailwind tokens (`bg-surface`, `bg-surface-raised`, `border-border`, `text-text-muted`, `text-danger`, `bg-brand`, `text-brand-ink`) where no primitive exists.
- **Mobile-first:** every new page is designed at 360 px first and must be usable at 360 px wide with **no horizontal page scroll** (wide tables become stacked cards, or scroll inside their own `overflow-x-auto` container). Every tap target is **at least 44 × 44 px**: the default shadcn `Button` is only 32–36 px tall, so buttons added in this phase carry `className="h-11"` (or `min-h-11`; icon-only buttons `size-11`), links used as buttons get `min-h-11 inline-flex items-center`, and checkbox/radio hit areas are wrapped in a `<label className="min-h-11 …">`. Inputs use `h-11`, the right `type`/`inputMode`/`autoComplete`, and visible `<label>`s. Motion respects `prefers-reduced-motion` (reuse the existing `motion` wrappers; add no new animation).
- **Dependencies:** no new heavy dependencies. The only allowed addition is `fabric` (v6, installed in Task 6). It is imported **only** via `await import("fabric")` in browser code inside `src/components/studio/*` (never at the top level of a module, never in `src/lib/*` or `src/server/*`); `import type … from "fabric"` is fine in `src/components/studio/*`. Image composition, PNG sniffing, pinch gestures and "download all" are hand-written on top of Canvas 2D, Pointer Events and plain links.
- **Payments:** `PAYMENT_PROVIDER` defaults to `mock` when unset; `.env.example` and `.env.test` set `PAYMENT_PROVIDER="mock"`. The `mock` provider and the mock pay page are refused when `NODE_ENV=production`.
- Never run anything on port 3000 (the owner's preview server). Manual checks use `npx next dev -p 3001` with `NEXT_PUBLIC_SITE_URL=http://localhost:3001` set only in that shell; stop it afterwards and confirm nothing listens on 3001. E2E runs through `npm run test:e2e` (already on port 3001). Revert `tsconfig.json`/`next-env.d.ts` churn from `next dev`/`next build` before committing (never stage them).
- Stage files explicitly by path (never `git add -A` / `git add .`). Never stage `.next*` build folders, `storage/uploads/**` or any `.tmp-*` QA folder.
- Every task ends with `npm run lint && npm run typecheck && npm test && npm run build` green. Task 1 also runs `npm run db:test:migrate` before `npm test`. Task 8 also runs `npm run test:e2e`.
- When a change in this plan makes an existing Phase 1 or Phase 2 test fail only because a view object gained fields (for example a `toEqual` over a whole `CartLine`, `OrderItemView`, `StoreSetting` or `OfferRow`), add the new fields to that expectation; never weaken or delete the assertion.
- Commit messages end with exactly these two lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB`

---

## Existing interfaces this plan consumes

```ts
// ---- Phase 1 (in the repo today) ----
// @/server/db: db (PrismaClient)
// @/server/auth: auth() → session with user.id, user.role
// @/server/admin-guard: requireAdmin(): Promise<{ userId: string }>
// src/app/admin/guard.ts: requireAdminPage(): Promise<{ userId: string }>
// @/server/errors: DomainError, NotFoundError(what), OutOfStockError(available), ForbiddenError(msg?), UnauthorizedError(msg?), ConflictError(msg),
//   ValidationError(fieldErrors, msg?), RateLimitedError(sec), toHttp(err)
// @/server/action-result: ActionResult<T>, actionError(err), zodFieldErrors(zodError)
// @/server/api: handle(fn), ok(data, init?), clientIp(req), RouteCtx, CART_TOKEN_HEADER, resolveApiCartRef(req) → { ref, newGuestToken }, withCartToken(res, token)
// @/server/rate-limit: rateLimit(key, limit, windowMs): { ok, retryAfterSec }
// @/server/cart-cookie: CART_COOKIE, readGuestToken(), ensureGuestToken(), clearGuestToken()   (private const ONE_YEAR)
// @/server/cart-ref: resolveCartRef({ create }), getCurrentCart(); getCurrentCartPreview() (Phase 2 T7)
// @/server/services/cart: CartRef = { userId } | { guestToken }, CartLine, CartView { id, items, subtotalPaise, itemCount }, EMPTY_CART,
//   getCart(ref), addItem(ref, variantId, qty), updateItem(ref, itemId, qty), removeItem(ref, itemId), mergeGuestCartIntoUser(guestToken, userId), MAX_QTY_PER_LINE
// @/server/uploads: MAX_UPLOAD_BYTES (5 MB), validateImage(bytes) → { ext: "png" | "jpg" | "webp"; contentType }, newUploadKey(prefix, ext),
//   storeImage(file, prefix) → { url, key }, uploadKeyFromUrl(url) → key | null
// @/server/adapters/storage: getStorage(): StorageAdapter { put(key, bytes, contentType) → { url }; getPublicUrl(key); delete(key) },
//   LocalDiskStorage(rootDir, publicBase = "/api/uploads"), S3Storage({ bucket, region, publicBaseUrl }), LOCAL_UPLOAD_ROOT
// src/app/api/uploads/[...path]/route.ts serves local uploads (png/jpg/webp) under /api/uploads/*
// src/app/auth/after-login/route.ts calls mergeGuestCartIntoUser(guestToken, userId) then clearGuestToken()
// @/server/services/catalog: ProductDetail (isCustomizable, slug, variants { id, sku, size, colorName, colorHex, pricePaise, stock }), getProductBySlug(slug)
// @/lib/variant-matrix: VariantLike { id, size, colorName, colorHex, stock, pricePaise }, colorsOf(variants), sizesFor(variants, color), defaultColor(variants)
// @/lib/uploads: MAX_UPLOAD_BYTES, ACCEPTED_IMAGE_TYPES, ACCEPTED_IMAGE_LABEL, imageFileError(file)
// @/lib/money: formatPaise, rupeesToPaise, paiseToRupees; @/lib/utils: cn; @/lib/catalog-types: MAX_QTY_PER_LINE (10)
// @/config/brand: BRAND { name, supportEmail, … }
// src/app/fonts.ts: displayFont (Bebas_Neue), bodyFont (Space_Grotesk)
// src/components/storefront/{product-purchase,cart-line,cart-panel,cart-drawer,notify-me}.tsx; cart-ui.ts: useCartUI (zustand { open, setOpen })
// src/components/motion: Reveal
// src/components/admin/product-editor.tsx already has the "Customizable blank (for the design tool)" checkbox;
//   src/server/seed/catalog-data.ts already marks "Blank Oversized Tee" and "Blank Regular Tee" isCustomizable: true (slugs blank-oversized-tee, blank-regular-tee)
// tests/helpers/db: resetDb() (TABLES list + TRUNCATE … CASCADE); tests/helpers/fixtures: createProduct(over) (isCustomizable, slug, basePricePaise, variants, status), private next()
// tests/e2e/helpers: register(page, email, name?), login(page, email, password?), uniqueEmail(prefix), PASSWORD

// ---- Phase 2 (docs/superpowers/plans/2026-09-30-phase2-commerce-ops.md) ----
// Schema: Order (number, status, needsAttention, paidAt, processingAt, shipName, shipPhone, …), OrderItem (productName, productSlug, size, colorName,
//   imageUrl, sku, unitPricePaise, quantity, lineTotalPaise, productId?, variantId?), OrderEvent, Offer, StoreSetting (id = 1), Cart.remindedAt
// @/lib/order-status (T1): PAID_STATUSES, ORDER_STATUS_LABEL, ORDER_EVENT_TYPES, OrderEventType, isPaidStatus
// @/lib/validation/settings (T1): settingsInputSchema, SettingsInput; @/server/services/settings (T1): getSettings(), updateSettings(input), StoreSettings
// tests/helpers/fixtures: createUser(over) (T1), createOrderRow(userId, over) (T2)
// @/lib/pricing (T2): PricingLine, PricingOffer, PricingContext, PriceResult, offerDiscount, priceCart
// @/server/services/promotions (T2): getLiveOffers(now?), quote({ lines, couponCode?, userId, now? })
// @/server/services/addresses (T3): createAddress(userId, input)
// @/server/services/order-records (T5): Tx, OrderItemView, OrderView, OrderSummary, orderWithItems, toOrderView, addOrderEvent(tx, orderId, type, message, actorId?), getOrderById(id)
// @/server/services/orders (T5): CheckoutLineRow, loadCheckoutLines(userId), unitPriceOf(l), lineName(l), toPricingLines(rows), reconcileCartStock(rows),
//   placeOrder(userId, input) → CheckoutPayload, markOrderPaid(orderId, paymentId, source, opts?); private checkoutLineInclude, snapshot(l), afterPaid(orderId, userId, items)
// @/server/errors (T5): StockIssue, StockChangedError
// @/server/emails/templates (T6): siteUrl(), orderConfirmationEmail(o), adminNewOrderEmail(o); private itemsHtml(o), itemsText(o), e = escapeHtml
// @/server/services/checkout (T7): CheckoutLineView, CheckoutView, getCheckoutView(userId, couponCode?), quoteForUser(userId, code), previewCartPricing(ref), CartPricingPreview; private toLineView(l)
// src/components/storefront/checkout/checkout-form.tsx (T7); src/app/(storefront)/account/orders/[number]/page.tsx (T8)
// @/lib/gst (T8): invoiceFromOrder(order, settings)
// @/lib/contact-links (T9): telLink(phone10), whatsappLink(phone10, text), orderWhatsappText(args)
// @/server/services/admin-orders (T9): getAdminOrder(id) → AdminOrderDetail, countToShip()
// src/app/admin/orders/[id]/page.tsx (T9); src/components/admin/orders/order-timeline.tsx (T9); src/app/admin/layout.tsx + AdminNav({ toShipCount }) (T9, items finalised in T11)
// src/components/print/slip-document.tsx: SlipDocument({ order, settings }) (T10)
// @/lib/validation/promotions (T11): offerInputSchema, OfferInput; @/server/services/admin-promotions (T11): OfferRow, createOffer, updateOffer, listOffers, getOffer
// src/components/admin/{offer-form,settings-form}.tsx (T11), src/app/admin/settings/actions (saveSettingsAction) (T11)
// @/server/jobs (T12): JOBS, JobName, isJobName, runJob(name, now?); POST /api/cron/[job] with "Authorization: Bearer ${CRON_SECRET}"
// tests/e2e/helpers (T13): checkoutWithMockPayment(page, outcome?) → order number, fillAddressForm(page), hasNoHorizontalScroll(page)
// playwright.config.ts (T13): loads .env; projects desktop (testIgnore /checkout-mobile/), mobile, reduced-motion, mobile-checkout; webServer.env PAYMENT_PROVIDER "mock"
```

## File structure

| Path | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify), `prisma/migrations/<ts>_phase3_design_studio/migration.sql` | `Design`, `CartItem.designId` (+ raw-SQL partial unique index), `OrderItem` design/print/hold fields, `StoreSetting` print fees, `Offer.includeCustom` |
| `src/lib/custom-pricing.ts`; `src/lib/pricing.ts`, `src/lib/order-status.ts` (modify) | print fees, custom lines in offers, `PRINTED` event type |
| `src/lib/validation/{settings,promotions}.ts`, `src/server/services/{settings,promotions,admin-promotions}.ts` (modify) | fee settings, `includeCustom` |
| `src/lib/studio/{constants,dpi,history,canvas-json,shirt,gesture}.ts`, `src/lib/png.ts` | pure studio logic |
| `src/server/adapters/storage/{types,local-disk,s3}.ts`, `src/server/uploads.ts`, `src/lib/uploads.ts` (modify) | storage `get`, per-call upload limits, design-asset limit |
| `src/server/services/cart.ts`, `src/server/cart-cookie.ts`, `src/server/api.ts` (modify) | custom lines, uniqueness, stock across lines, merge hand-over, guest cookie on route responses |
| `src/server/services/designs.ts`, `src/server/design-form.ts` | designs service, multipart parsing |
| `src/app/api/designs/route.ts`, `src/app/api/designs/[id]/route.ts`, `src/app/api/designs/assets/route.ts` | design API |
| `src/server/jobs/purge-designs.ts`; `src/server/jobs/index.ts` (modify) | cleanup job |
| `src/server/services/{orders,order-records,checkout}.ts`, `src/server/emails/templates.ts`, `src/lib/gst.ts` (modify) | custom lines through checkout, orders, emails, invoices |
| `src/components/storefront/custom-print-thumbs.tsx`; `src/components/storefront/checkout/checkout-form.tsx`, `src/app/(storefront)/account/orders/[number]/page.tsx`, `src/components/print/slip-document.tsx` (modify) | customer order views and packing slip |
| `src/app/(storefront)/customize/page.tsx` (replace), `src/app/(storefront)/customize/[slug]/page.tsx`, `src/components/studio/*` | studio UI |
| `src/components/storefront/{product-purchase,cart-line}.tsx` (modify) | "Customize this", custom cart lines |
| `src/lib/print-queue.ts`; `src/lib/contact-links.ts` (modify); `src/server/services/print-queue.ts` | print queue logic |
| `src/app/admin/print-queue/{page.tsx,actions.ts}`, `src/app/admin/print-queue/files/[itemId]/[side]/route.ts`, `src/components/admin/print-queue/*`; `src/components/admin/admin-nav.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/orders/[id]/page.tsx`, `src/components/admin/orders/order-timeline.tsx`, `src/components/admin/{settings-form,offer-form}.tsx` (modify) | admin UI |
| `tests/unit/*` (new), `tests/helpers/{db,fixtures}.ts` (modify), `tests/helpers/png.ts`, `tests/e2e/{studio,studio-mobile}.spec.ts`, `tests/e2e/helpers.ts`, `playwright.config.ts`, `README.md` (modify) | tests and docs |

---

### Task 1: Schema, migration with the partial unique index, print fees, custom lines in the pricing engine

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/pricing.ts`, `src/lib/order-status.ts`, `src/lib/validation/settings.ts`, `src/lib/validation/promotions.ts`, `src/server/services/settings.ts`, `src/server/services/promotions.ts`, `src/server/services/admin-promotions.ts`, `tests/helpers/db.ts`, `tests/helpers/fixtures.ts`
- Create: `prisma/migrations/<timestamp>_phase3_design_studio/migration.sql` (generated, then edited), `src/lib/custom-pricing.ts`
- Test: `tests/unit/custom-pricing.test.ts`, `tests/unit/design-schema.test.ts`

**Interfaces:**
- Consumes: Phase 2 schema, `priceCart`, `offerDiscount`, `PricingLine`, `PricingOffer` (Phase 2 T2), `getSettings`, `settingsInputSchema` (Phase 2 T1), `offerInputSchema`, `OfferRow` (Phase 2 T11), `getLiveOffers` (Phase 2 T2), `ORDER_EVENT_TYPES` (Phase 2 T1), `createUser`, `createOrderRow`, `createProduct` fixtures.
- Produces:

```ts
// Prisma: model Design; CartItem.designId + @@unique([cartId, designId]) (compound name cartId_designId); raw index "CartItem_cartId_variantId_plain_key"
//   OrderItem.designId, designFrontPreviewUrl, designBackPreviewUrl, printFrontUrl, printBackUrl, printedAt, heldAt, holdNote
//   StoreSetting.customFrontFeePaise (default 0), customBackFeePaise (default 14900); Offer.includeCustom (default false)
// @/lib/custom-pricing  (pure, client-safe)
export interface CustomFees { frontPaise: number; backPaise: number }
export interface DesignSides { front: boolean; back: boolean }
export const NO_CUSTOM_FEES: CustomFees;                                               // { 0, 0 }
export function customFeesOf(s: { customFrontFeePaise: number; customBackFeePaise: number }): CustomFees;
export function designSides(d: { frontPrintKey: string | null; backPrintKey: string | null }): DesignSides;
export function printSidesOf(i: { printFrontUrl: string | null; printBackUrl: string | null }): DesignSides | null;   // null for plain items
export function isCustomItem(i: { printFrontUrl: string | null; printBackUrl: string | null }): boolean;
export function customFeePaise(sides: DesignSides, fees: CustomFees): number;
export function customUnitPricePaise(variantPricePaise: number, sides: DesignSides | null, fees: CustomFees): number;
export function customPrintLabel(sides: DesignSides | null): string | null;           // "Custom print: front" | "…: back" | "…: front + back"
// @/lib/pricing (extended)
export interface PricingLine { unitPricePaise: number; quantity: number; collectionIds: string[]; custom?: boolean }
export interface PricingOffer { /* Phase 2 fields */ includeCustom?: boolean }        // custom lines count only when true
// @/lib/order-status (extended)
export const ORDER_EVENT_TYPES;   // + "PRINTED"
// @/lib/validation/settings (extended): customFrontFeePaise?, customBackFeePaise? (optional ints 0..1_000_000)
// @/lib/validation/promotions (extended): offerInputSchema.includeCustom: boolean (default false)
// @/server/services/settings (added)
export function getCustomFees(): Promise<CustomFees>;
// @/server/services/admin-promotions (extended): OfferRow.includeCustom: boolean
// tests/helpers/fixtures (added)
export function createDesignRow(over: { productId: string } & Partial<{ userId: string | null; cartToken: string | null; colorName: string; frontPreviewKey: string | null; frontPrintKey: string | null; backPreviewKey: string | null; backPrintKey: string | null; assetKeys: string[]; createdAt: Date }>): Promise<Design>;
export function createOrderItemRow(orderId: string, over?: Partial<{ productName: string; size: string; colorName: string; sku: string; quantity: number; designId: string | null; printFrontUrl: string | null; printBackUrl: string | null; designFrontPreviewUrl: string | null; designBackPreviewUrl: string | null; printedAt: Date | null }>): Promise<OrderItem>;
```

Rules (spec §2, §3): unit price of a custom line = variant price + `customFrontFeePaise` when the front has a print file + `customBackFeePaise` when the back has one. An empty side never has files, so "has objects" is exactly "has a print key". Offers skip custom lines unless `includeCustom`; coupons and shipping treat custom lines like any other line. A design cannot be deleted while it is in an order: `OrderItem.design` is `SetNull` so deleting a product (which cascades its designs) never blocks, and the order keeps its URL snapshots.

- [ ] **Step 1: Schema**

In `prisma/schema.prisma`:
- `User`: add `designs Design[]`.
- `Product`: add `designs Design[]`.
- `CartItem`: add the two lines below, **remove** `@@unique([cartId, variantId])`, add `@@unique([cartId, designId])` and `@@index([cartId, variantId])`.
- `OrderItem`: add the fields below and `@@index([designId])`, `@@index([printedAt])`.
- `StoreSetting`: add `customFrontFeePaise Int @default(0)` and `customBackFeePaise Int @default(14900)`.
- `Offer`: add `includeCustom Boolean @default(false)`.

```prisma
model Design {
  id              String      @id @default(cuid())
  userId          String?
  user            User?       @relation(fields: [userId], references: [id], onDelete: Cascade)
  cartToken       String?
  productId       String
  product         Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  colorName       String
  frontJson       Json?
  backJson        Json?
  frontPreviewKey String?
  backPreviewKey  String?
  frontPrintKey   String?
  backPrintKey    String?
  assetKeys       String[]    @default([])
  rightsConfirmed Boolean     @default(false)
  cartItems       CartItem[]
  orderItems      OrderItem[]
  createdAt       DateTime    @default(now())

  @@index([userId])
  @@index([cartToken])
  @@index([createdAt])
}

// CartItem (added lines)
  designId  String?
  design    Design?        @relation(fields: [designId], references: [id], onDelete: Cascade)

// OrderItem (added lines)
  designId              String?
  design                Design?   @relation(fields: [designId], references: [id], onDelete: SetNull)
  designFrontPreviewUrl String?
  designBackPreviewUrl  String?
  printFrontUrl         String?
  printBackUrl          String?
  printedAt             DateTime?
  heldAt                DateTime?
  holdNote              String?
```

- [ ] **Step 2: Migration with the partial unique index**

```bash
npx prisma migrate dev --name phase3_design_studio --create-only
```

Open the generated `prisma/migrations/<timestamp>_phase3_design_studio/migration.sql`, confirm it drops `CartItem_cartId_variantId_key` and creates `CartItem_cartId_designId_key`, then append:

```sql
-- Plain (non-custom) lines stay unique per variant; custom lines are unique per design (CartItem_cartId_designId_key).
-- Prisma cannot model partial indexes: never let a later generated migration drop this one.
CREATE UNIQUE INDEX "CartItem_cartId_variantId_plain_key" ON "CartItem"("cartId", "variantId") WHERE "designId" IS NULL;
```

Apply without letting `migrate dev` "fix" the drift it would report for the partial index, then regenerate the client and migrate the test database:

```bash
npx prisma migrate deploy
npx prisma generate
npm run db:test:migrate
```

Add a short note to the top of `prisma/schema.prisma`'s `CartItem` model: `/// Partial unique index CartItem_cartId_variantId_plain_key (designId IS NULL) lives in migration phase3_design_studio; delete any DROP INDEX for it from future generated migrations.` (`tests/unit/design-schema.test.ts` fails if it disappears.)

Update `tests/helpers/db.ts`: add `"Design"` to `TABLES` right after `"OrderItem"`.

Append to `tests/helpers/fixtures.ts` (extend the Prisma type import with `Design`, `OrderItem` if the helpers are annotated):

```ts
export async function createDesignRow(
  over: { productId: string } & Partial<{
    userId: string | null; cartToken: string | null; colorName: string;
    frontPreviewKey: string | null; frontPrintKey: string | null; backPreviewKey: string | null; backPrintKey: string | null;
    assetKeys: string[]; createdAt: Date;
  }>,
) {
  const pick = <T,>(v: T | undefined, d: T) => (v === undefined ? d : v);
  return db.design.create({
    data: {
      productId: over.productId,
      userId: pick(over.userId, null),
      cartToken: pick(over.cartToken, null),
      colorName: over.colorName ?? "Black",
      frontJson: { version: "6.0.0", objects: [{ type: "Textbox", text: "HELLO", data: { kind: "text", fontId: "anton" } }] },
      frontPreviewKey: pick(over.frontPreviewKey, "designs/previews/f.png"),
      frontPrintKey: pick(over.frontPrintKey, "designs/print/f.png"),
      backPreviewKey: pick(over.backPreviewKey, null),
      backPrintKey: pick(over.backPrintKey, null),
      assetKeys: over.assetKeys ?? [],
      rightsConfirmed: true,
      createdAt: over.createdAt,
    },
  });
}

export async function createOrderItemRow(
  orderId: string,
  over: Partial<{
    productName: string; size: string; colorName: string; sku: string; quantity: number; designId: string | null;
    printFrontUrl: string | null; printBackUrl: string | null; designFrontPreviewUrl: string | null; designBackPreviewUrl: string | null; printedAt: Date | null;
  }> = {},
) {
  const n = next();
  const pick = <T,>(v: T | undefined, d: T) => (v === undefined ? d : v);
  const quantity = over.quantity ?? 1;
  return db.orderItem.create({
    data: {
      orderId,
      productName: over.productName ?? `Blank Tee ${n}`,
      productSlug: `blank-tee-${n}`,
      size: over.size ?? "M",
      colorName: over.colorName ?? "Black",
      sku: over.sku ?? `SKU-${n}`,
      unitPricePaise: 59900,
      quantity,
      lineTotalPaise: 59900 * quantity,
      designId: pick(over.designId, null),
      printFrontUrl: pick(over.printFrontUrl, "/api/uploads/designs/print/f.png"),
      printBackUrl: pick(over.printBackUrl, null),
      designFrontPreviewUrl: pick(over.designFrontPreviewUrl, "/api/uploads/designs/previews/f.png"),
      designBackPreviewUrl: pick(over.designBackPreviewUrl, null),
      printedAt: pick(over.printedAt, null),
    },
  });
}
```

(`<T,>` keeps the generic parseable in `.ts`; if the file is `.ts` a plain `<T>` also works.)

- [ ] **Step 3: Failing tests**

Create `tests/unit/custom-pricing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  customFeePaise, customFeesOf, customPrintLabel, customUnitPricePaise, designSides, isCustomItem, NO_CUSTOM_FEES, printSidesOf,
} from "@/lib/custom-pricing";
import { priceCart, type PricingContext, type PricingOffer } from "@/lib/pricing";

const fees = { frontPaise: 0, backPaise: 14900 };

describe("custom print fees", () => {
  it("adds the fee of each printed side", () => {
    expect(customFeePaise({ front: true, back: false }, fees)).toBe(0);
    expect(customFeePaise({ front: true, back: true }, fees)).toBe(14900);
    expect(customFeePaise({ front: false, back: true }, { frontPaise: 5000, backPaise: 14900 })).toBe(14900);
    expect(customFeePaise({ front: true, back: true }, { frontPaise: 5000, backPaise: 14900 })).toBe(19900);
    expect(customFeePaise({ front: true, back: true }, NO_CUSTOM_FEES)).toBe(0);
  });

  it("prices plain lines at the variant price and custom lines with fees", () => {
    expect(customUnitPricePaise(54900, null, fees)).toBe(54900);
    expect(customUnitPricePaise(54900, { front: true, back: true }, fees)).toBe(69800);
  });

  it("derives sides from print keys or print urls", () => {
    expect(designSides({ frontPrintKey: "k", backPrintKey: null })).toEqual({ front: true, back: false });
    expect(printSidesOf({ printFrontUrl: null, printBackUrl: "/b.png" })).toEqual({ front: false, back: true });
    expect(printSidesOf({ printFrontUrl: null, printBackUrl: null })).toBeNull();
    expect(isCustomItem({ printFrontUrl: "/f.png", printBackUrl: null })).toBe(true);
    expect(isCustomItem({ printFrontUrl: null, printBackUrl: null })).toBe(false);
    expect(customFeesOf({ customFrontFeePaise: 1, customBackFeePaise: 2 })).toEqual({ frontPaise: 1, backPaise: 2 });
  });

  it("labels the printed sides", () => {
    expect(customPrintLabel({ front: true, back: true })).toBe("Custom print: front + back");
    expect(customPrintLabel({ front: true, back: false })).toBe("Custom print: front");
    expect(customPrintLabel({ front: false, back: true })).toBe("Custom print: back");
    expect(customPrintLabel({ front: false, back: false })).toBeNull();
    expect(customPrintLabel(null)).toBeNull();
  });
});

describe("pricing engine with custom lines", () => {
  const settings = { shippingFeePaise: 7900, freeShippingThresholdPaise: 99900 };
  const now = new Date("2026-10-01T10:00:00Z");
  const ctx = (offers: PricingOffer[]): PricingContext => ({ offers, coupon: null, settings, now });
  const offer = (over: Partial<PricingOffer> = {}): PricingOffer => ({
    id: "o", label: "Any 2 for ₹999", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900, percent: null,
    collectionId: null, active: true, startsAt: null, endsAt: null, ...over,
  });
  const plain = { unitPricePaise: 59900, quantity: 1, collectionIds: [] };
  const custom = { unitPricePaise: 69800, quantity: 1, collectionIds: [], custom: true };

  it("leaves custom lines out of offers by default", () => {
    expect(priceCart([plain, custom], ctx([offer()]))).toMatchObject({ subtotalPaise: 129700, offer: null, discountPaise: 0, shippingPaise: 0, totalPaise: 129700 });
  });

  it("counts custom lines when the offer includes them", () => {
    // 59900 + 69800 = 129700 → 99900, saving 29800; 99900 still reaches the free-shipping threshold
    expect(priceCart([plain, custom], ctx([offer({ includeCustom: true })]))).toMatchObject({ applied: "offer", discountPaise: 29800, shippingPaise: 0, totalPaise: 99900 });
  });

  it("treats custom lines like any other line for shipping and subtotal", () => {
    expect(priceCart([{ ...custom, unitPricePaise: 54900 }], ctx([]))).toMatchObject({ subtotalPaise: 54900, shippingPaise: 7900, totalPaise: 62800 });
  });
});
```

Create `tests/unit/design-schema.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDesignRow, createOrderItemRow, createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { getSettings, getCustomFees } from "@/server/services/settings";
import { getLiveOffers } from "@/server/services/promotions";
import { ORDER_EVENT_TYPES } from "@/lib/order-status";

describe("phase 3 schema", () => {
  beforeEach(resetDb);

  it("keeps plain lines unique per variant but allows one custom line per design", async () => {
    const p = await createProduct({ isCustomizable: true });
    const v = p.variants[0];
    const cart = await db.cart.create({ data: { guestToken: "g1" } });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: 1 } });
    await expect(db.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: 1 } })).rejects.toMatchObject({ code: "P2002" });
    const d1 = await createDesignRow({ productId: p.id, cartToken: "g1" });
    const d2 = await createDesignRow({ productId: p.id, cartToken: "g1" });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: 1, designId: d1.id } });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: 1, designId: d2.id } });
    await expect(db.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: 1, designId: d1.id } })).rejects.toMatchObject({ code: "P2002" });
    expect(await db.cartItem.count()).toBe(3);
  });

  it("keeps the partial unique index in the database", async () => {
    const rows = await db.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE indexname = 'CartItem_cartId_variantId_plain_key'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/UNIQUE/);
    expect(rows[0].indexdef).toMatch(/WHERE \("designId" IS NULL\)/);
  });

  it("removes cart lines with their design but keeps order items", async () => {
    const p = await createProduct({ isCustomizable: true });
    const d = await createDesignRow({ productId: p.id, cartToken: "g1" });
    const cart = await db.cart.create({ data: { guestToken: "g1" } });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: p.variants[0].id, quantity: 1, designId: d.id } });
    const order = await createOrderRow((await createUser()).id);
    const item = await createOrderItemRow(order.id, { designId: d.id });
    await db.design.delete({ where: { id: d.id } });
    expect(await db.cartItem.count()).toBe(0);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ designId: null, printFrontUrl: "/api/uploads/designs/print/f.png" });
  });

  it("defaults the print fees, the offer flag and adds the PRINTED event", async () => {
    const s = await getSettings();
    expect([s.customFrontFeePaise, s.customBackFeePaise]).toEqual([0, 14900]);
    expect(await getCustomFees()).toEqual({ frontPaise: 0, backPaise: 14900 });
    await db.offer.create({ data: { label: "Any 2", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900 } });
    await db.offer.create({ data: { label: "Custom too", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900, includeCustom: true } });
    expect((await getLiveOffers()).map((o) => [o.label, o.includeCustom])).toEqual([["Any 2", false], ["Custom too", true]]);
    expect(ORDER_EVENT_TYPES).toContain("PRINTED");
  });
});
```

Run: `npm test -- tests/unit/custom-pricing.test.ts tests/unit/design-schema.test.ts`
Expected: FAIL (`@/lib/custom-pricing`, `getCustomFees` missing; `includeCustom` not mapped; `PRINTED` missing).

- [ ] **Step 4: Implement**

Create `src/lib/custom-pricing.ts`:

```ts
export interface CustomFees { frontPaise: number; backPaise: number }
export interface DesignSides { front: boolean; back: boolean }

export const NO_CUSTOM_FEES: CustomFees = { frontPaise: 0, backPaise: 0 };

export function customFeesOf(s: { customFrontFeePaise: number; customBackFeePaise: number }): CustomFees {
  return { frontPaise: s.customFrontFeePaise, backPaise: s.customBackFeePaise };
}

/** A side "has objects" exactly when it has a print file: the studio never uploads files for an empty side. */
export function designSides(d: { frontPrintKey: string | null; backPrintKey: string | null }): DesignSides {
  return { front: d.frontPrintKey !== null, back: d.backPrintKey !== null };
}

export function printSidesOf(i: { printFrontUrl: string | null; printBackUrl: string | null }): DesignSides | null {
  const sides = { front: i.printFrontUrl !== null, back: i.printBackUrl !== null };
  return sides.front || sides.back ? sides : null;
}

export function isCustomItem(i: { printFrontUrl: string | null; printBackUrl: string | null }): boolean {
  return printSidesOf(i) !== null;
}

export function customFeePaise(sides: DesignSides, fees: CustomFees): number {
  return (sides.front ? fees.frontPaise : 0) + (sides.back ? fees.backPaise : 0);
}

export function customUnitPricePaise(variantPricePaise: number, sides: DesignSides | null, fees: CustomFees): number {
  return variantPricePaise + (sides ? customFeePaise(sides, fees) : 0);
}

export function customPrintLabel(sides: DesignSides | null): string | null {
  if (!sides || (!sides.front && !sides.back)) return null;
  if (sides.front && sides.back) return "Custom print: front + back";
  return sides.front ? "Custom print: front" : "Custom print: back";
}
```

`src/lib/pricing.ts`:
- `PricingLine` gains `custom?: boolean`; `PricingOffer` gains `includeCustom?: boolean`.
- In `offerDiscount`, first line inside the `for (const l of lines)` loop:

```ts
    if (l.custom && !offer.includeCustom) continue;
```

`src/lib/order-status.ts`: append `"PRINTED"` to `ORDER_EVENT_TYPES` (after `"ATTENTION"`).

`src/lib/validation/settings.ts`: add to `settingsInputSchema` (optional so older callers that omit them keep the stored values):

```ts
  customFrontFeePaise: z.number().int().min(0).max(1_000_000).optional(),
  customBackFeePaise: z.number().int().min(0).max(1_000_000).optional(),
```

`src/server/services/settings.ts`: add

```ts
import { customFeesOf, type CustomFees } from "@/lib/custom-pricing";

export async function getCustomFees(): Promise<CustomFees> {
  return customFeesOf(await getSettings());
}
```

`src/lib/validation/promotions.ts`: add `includeCustom: z.boolean().default(false),` to the object inside `offerInputSchema` (before `.superRefine`).

`src/server/services/promotions.ts`: `getLiveOffers` maps `includeCustom: o.includeCustom` into each `PricingOffer`.

`src/server/services/admin-promotions.ts`: `OfferRow` gains `includeCustom: boolean`; the row mapper copies `o.includeCustom`; `createOffer`/`updateOffer` already pass the parsed object, so `includeCustom` is saved with no further change (verify the `data:` object spreads `parsed.data` or lists fields; if it lists fields, add `includeCustom: parsed.data.includeCustom`).

- [ ] **Step 5: Verify and commit**

Run the two test files (GREEN), then `npm run lint && npm run typecheck && npm run db:test:migrate && npm test && npm run build`.

```bash
git add prisma/schema.prisma prisma/migrations src/lib/custom-pricing.ts src/lib/pricing.ts src/lib/order-status.ts src/lib/validation/settings.ts src/lib/validation/promotions.ts src/server/services/settings.ts src/server/services/promotions.ts src/server/services/admin-promotions.ts tests/helpers/db.ts tests/helpers/fixtures.ts tests/unit/custom-pricing.test.ts tests/unit/design-schema.test.ts
git commit -m "feat(studio): add design schema, print fees and custom lines in pricing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 2: Pure studio libraries, PNG header sniffing, storage `get`, per-call upload limits

**Files:**
- Create: `src/lib/studio/constants.ts`, `src/lib/studio/dpi.ts`, `src/lib/studio/history.ts`, `src/lib/studio/canvas-json.ts`, `src/lib/studio/shirt.ts`, `src/lib/studio/gesture.ts`, `src/lib/png.ts`, `tests/helpers/png.ts`
- Modify: `src/server/adapters/storage/types.ts`, `src/server/adapters/storage/local-disk.ts`, `src/server/adapters/storage/s3.ts`, `src/server/uploads.ts`, `src/lib/uploads.ts`
- Test: `tests/unit/studio-lib.test.ts`, `tests/unit/png.test.ts`, `tests/unit/storage.test.ts` (extend), `tests/unit/uploads.test.ts` (extend)

**Interfaces:**
- Consumes: `MAX_UPLOAD_BYTES`, `validateImage`, `storeImage`, `StorageAdapter`, `LocalDiskStorage`, `S3Storage` (Phase 1).
- Produces:

```ts
// @/lib/studio/constants
export const CANVAS_WIDTH = 800; export const CANVAS_HEIGHT = 1000;                    // logical canvas = SVG viewBox
export const PRINT_AREA: { left: 280; top: 250; width: 240; height: 320 };            // 12 × 16 in, same on front and back
export const PRINT_AREA_INCHES: { width: 12; height: 16 };
export const UNITS_PER_INCH = 20;
export const PRINT_SIZES: readonly [{ width: 3600; height: 4800 }, { width: 3072; height: 4096 }];   // 300 DPI, then 256 DPI fallback
export const PREVIEW_WIDTH = 800; export const PREVIEW_HEIGHT = 1000;
export const HISTORY_LIMIT = 20; export const MAX_OBJECTS_PER_SIDE = 30; export const MAX_SIDE_JSON_CHARS = 200_000; export const MAX_TEXT_CHARS = 200;
export const MAX_DESIGN_ASSET_BYTES: number;  // 10 MB
export const MAX_PREVIEW_BYTES: number;       // 3 MB
export const MAX_PRINT_BYTES: number;         // 25 MB
export const MAX_DESIGN_UPLOAD_BYTES: number; // 30 MB (all four files together)
export const DESIGN_ASSET_PREFIX = "designs/assets";
export const DPI_WARN = 150; export const DPI_BLURRY = 100;
export type DesignSide = "front" | "back"; export const DESIGN_SIDES: readonly DesignSide[];
export type StudioFontId = "anton" | "bebas" | "inter" | "marker";
export const STUDIO_FONTS: readonly { id: StudioFontId; label: string }[];
export function isStudioFontId(v: unknown): v is StudioFontId;
// @/lib/studio/dpi
export type DpiLevel = "ok" | "low" | "blurry";
export function effectiveDpi(a: { pixelWidth: number; pixelHeight: number; printedWidthIn: number; printedHeightIn: number }): number;   // floor(min(x, y)); Infinity when size ≤ 0
export function objectDpi(o: { naturalWidth: number; naturalHeight: number; scaledWidth: number; scaledHeight: number }): number;          // canvas units → inches
export function dpiLevel(dpi: number): DpiLevel;                        // < 100 blurry, < 150 low, else ok
export function dpiMessage(level: DpiLevel): string | null;             // "Low resolution: may look soft" | "May print blurry" | null
// @/lib/studio/history
export interface History<T> { past: T[]; present: T; future: T[] }
export function createHistory<T>(initial: T): History<T>;
export function pushHistory<T>(h: History<T>, next: T, limit?: number): History<T>;   // no-op when next === present; keeps ≤ limit past states
export function undoHistory<T>(h: History<T>): History<T>;
export function redoHistory<T>(h: History<T>): History<T>;
export function canUndo(h: History<unknown>): boolean; export function canRedo(h: History<unknown>): boolean;
// @/lib/studio/canvas-json
export interface SideJson { version?: string; objects: Record<string, unknown>[] }
export const EMPTY_SIDE: SideJson;
export function toSideJson(raw: unknown): SideJson | null;
export function fontIdOf(o: Record<string, unknown>): StudioFontId | null;
export function fontIdsIn(json: SideJson): StudioFontId[];
export function withFontFamilies(json: SideJson, families: Record<StudioFontId, string>): SideJson;
export type SideJsonCheck = { ok: true; json: SideJson; assetUrls: string[] } | { ok: false; error: string };
export function validateSideJson(raw: unknown, assetUrlPrefix: string): SideJsonCheck;
// @/lib/studio/shirt
export function safeHex(hex: string | null | undefined, fallback?: string): string;
export function shadeHex(hex: string, amount: number): string;
export function isDarkHex(hex: string): boolean;
export function shirtSvgMarkup(hex: string, side: DesignSide, opts?: { guide?: boolean; background?: string | null }): string;
// @/lib/studio/gesture
export interface Pt { x: number; y: number }
export function pinchTransform(a0: Pt, b0: Pt, a1: Pt, b1: Pt): { scale: number; rotateDeg: number };
export function clampScale(s: number, min?: number, max?: number): number;   // default 0.05 … 20
// @/lib/png
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null;
// @/lib/uploads (added)
export const MAX_DESIGN_ASSET_BYTES: number;                             // re-exported from studio constants
export function designAssetFileError(file: File): string | null;
// @/server/uploads (changed signatures, defaults keep old behaviour)
export function validateImage(bytes: Uint8Array, maxBytes?: number): Detected;
export function storeImage(file: File, prefix: string, opts?: { maxBytes?: number }): Promise<{ url: string; key: string }>;
// StorageAdapter (added)
get(key: string): Promise<Uint8Array | null>;                            // null when missing
// tests/helpers/png
export function fakePng(width: number, height: number, extra?: number): Uint8Array;   // PNG signature + IHDR header only
```

- [ ] **Step 1: Failing tests**

Create `tests/helpers/png.ts`:

```ts
/** Smallest byte string that passes magic-byte sniffing and carries an IHDR width/height. Not a decodable image. */
export function fakePng(width: number, height: number, extra = 16): Uint8Array {
  const b = new Uint8Array(24 + extra);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}
```

Create `tests/unit/png.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pngDimensions } from "@/lib/png";
import { fakePng } from "../helpers/png";

describe("pngDimensions", () => {
  it("reads width and height from the IHDR chunk", () => {
    expect(pngDimensions(fakePng(3600, 4800))).toEqual({ width: 3600, height: 4800 });
    expect(pngDimensions(fakePng(800, 1000))).toEqual({ width: 800, height: 1000 });
  });

  it("rejects non-PNG bytes, short input and a missing IHDR", () => {
    expect(pngDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(pngDimensions(fakePng(10, 10).slice(0, 20))).toBeNull();
    const broken = fakePng(10, 10);
    broken[12] = 0x58;
    expect(pngDimensions(broken)).toBeNull();
  });

  it("works on a subarray view", () => {
    const outer = new Uint8Array(64);
    outer.set(fakePng(12, 34), 8);
    expect(pngDimensions(outer.subarray(8))).toEqual({ width: 12, height: 34 });
  });
});
```

Create `tests/unit/studio-lib.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dpiLevel, dpiMessage, effectiveDpi, objectDpi } from "@/lib/studio/dpi";
import { canRedo, canUndo, createHistory, pushHistory, redoHistory, undoHistory } from "@/lib/studio/history";
import { fontIdsIn, toSideJson, validateSideJson, withFontFamilies } from "@/lib/studio/canvas-json";
import { isDarkHex, safeHex, shadeHex, shirtSvgMarkup } from "@/lib/studio/shirt";
import { clampScale, pinchTransform } from "@/lib/studio/gesture";
import { HISTORY_LIMIT, isStudioFontId, MAX_OBJECTS_PER_SIDE, PRINT_AREA, PRINT_SIZES, UNITS_PER_INCH } from "@/lib/studio/constants";

describe("constants", () => {
  it("keep the print area at 12 × 16 in and both print sizes at 3:4", () => {
    expect(PRINT_AREA.width / UNITS_PER_INCH).toBe(12);
    expect(PRINT_AREA.height / UNITS_PER_INCH).toBe(16);
    for (const s of PRINT_SIZES) expect(s.width / s.height).toBeCloseTo(PRINT_AREA.width / PRINT_AREA.height);
    expect(PRINT_SIZES[0].width / 12).toBe(300);
    expect(isStudioFontId("anton")).toBe(true);
    expect(isStudioFontId("comic")).toBe(false);
  });
});

describe("DPI", () => {
  it("uses the smaller of the two axes", () => {
    expect(effectiveDpi({ pixelWidth: 3600, pixelHeight: 3000, printedWidthIn: 12, printedHeightIn: 12 })).toBe(250);
    expect(effectiveDpi({ pixelWidth: 100, pixelHeight: 100, printedWidthIn: 0, printedHeightIn: 1 })).toBe(Infinity);
  });

  it("converts canvas units to printed inches", () => {
    // 1200 × 1600 px filling the whole 240 × 320 unit print area = 12 × 16 in → 100 DPI
    expect(objectDpi({ naturalWidth: 1200, naturalHeight: 1600, scaledWidth: 240, scaledHeight: 320 })).toBe(100);
    // same image at half size (6 × 8 in) → 200 DPI
    expect(objectDpi({ naturalWidth: 1200, naturalHeight: 1600, scaledWidth: 120, scaledHeight: 160 })).toBe(200);
  });

  it("grades the result without ever blocking", () => {
    expect(dpiLevel(300)).toBe("ok");
    expect(dpiLevel(150)).toBe("ok");
    expect(dpiLevel(149)).toBe("low");
    expect(dpiLevel(100)).toBe("low");
    expect(dpiLevel(99)).toBe("blurry");
    expect(dpiMessage("ok")).toBeNull();
    expect(dpiMessage("low")).toBe("Low resolution: may look soft");
    expect(dpiMessage("blurry")).toBe("May print blurry");
  });
});

describe("history", () => {
  it("undoes and redoes, and a new change clears redo", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b");
    h = pushHistory(h, "c");
    h = undoHistory(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(true);
    h = redoHistory(h);
    expect(h.present).toBe("c");
    h = undoHistory(h);
    h = pushHistory(h, "d");
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual(["a", "b"]);
  });

  it("ignores unchanged snapshots and keeps at most the limit", () => {
    let h = createHistory("0");
    expect(pushHistory(h, "0")).toBe(h);
    for (let i = 1; i <= 30; i++) h = pushHistory(h, String(i));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe("10");
    for (let i = 0; i < 25; i++) h = undoHistory(h);
    expect(h.present).toBe("10");
    expect(canUndo(h)).toBe(false);
  });
});

describe("canvas JSON", () => {
  const prefix = "/api/uploads/designs/assets/";
  const text = { type: "Textbox", text: "HELLO", fontFamily: "__Anton_x", data: { kind: "text", fontId: "anton" } };
  const image = { type: "Image", src: `${prefix}a.png`, data: { kind: "image" } };

  it("normalises raw JSON", () => {
    expect(toSideJson({ version: "6.4.0", objects: [text], background: "#fff" })).toEqual({ version: "6.4.0", objects: [text] });
    expect(toSideJson({ objects: "nope" })).toBeNull();
    expect(toSideJson(null)).toBeNull();
    expect(toSideJson([1])).toBeNull();
  });

  it("remaps font families from the stable font id", () => {
    const json = { objects: [text, image] };
    expect(fontIdsIn(json)).toEqual(["anton"]);
    const out = withFontFamilies(json, { anton: "Anton-X", bebas: "B", inter: "I", marker: "M" });
    expect(out.objects[0].fontFamily).toBe("Anton-X");
    expect(out.objects[1]).toBe(image);
  });

  it("accepts text and studio images and collects asset urls", () => {
    const r = validateSideJson({ version: "6.4.0", objects: [text, image, image] }, prefix);
    expect(r).toEqual({ ok: true, json: { version: "6.4.0", objects: [text, image, image] }, assetUrls: [`${prefix}a.png`] });
  });

  it("rejects foreign images, unknown layers, oversize text and too many layers", () => {
    expect(validateSideJson({ objects: [{ type: "Image", src: "https://evil.example/x.png" }] }, prefix)).toMatchObject({ ok: false });
    expect(validateSideJson({ objects: [{ type: "Image", src: `${prefix}../x.png` }] }, prefix)).toMatchObject({ ok: false });
    expect(validateSideJson({ objects: [{ type: "Rect" }] }, prefix)).toEqual({ ok: false, error: "Design contains an unsupported layer" });
    expect(validateSideJson({ objects: [{ ...text, text: "x".repeat(201) }] }, prefix)).toMatchObject({ ok: false });
    expect(validateSideJson({ objects: Array.from({ length: MAX_OBJECTS_PER_SIDE + 1 }, () => text) }, prefix)).toMatchObject({ ok: false });
    expect(validateSideJson({ objects: [text], backgroundImage: { type: "Image" } }, prefix)).toMatchObject({ ok: false });
    expect(validateSideJson("x", prefix)).toEqual({ ok: false, error: "Design data is malformed" });
  });
});

describe("shirt mockup", () => {
  it("fills the shirt with a validated color", () => {
    const svg = shirtSvgMarkup("#1A2B3C", "front");
    expect(svg).toContain('fill="#1a2b3c"');
    expect(shirtSvgMarkup('"><script>', "front")).not.toContain("<script>");
    expect(safeHex("#abc")).toBe("#f5f5f5");
    expect(safeHex(null, "#000000")).toBe("#000000");
  });

  it("draws the dashed print guide only when asked and differs front to back", () => {
    expect(shirtSvgMarkup("#ffffff", "front", { guide: true })).toContain('data-guide="print-area"');
    expect(shirtSvgMarkup("#ffffff", "front")).not.toContain("data-guide");
    expect(shirtSvgMarkup("#ffffff", "front")).not.toBe(shirtSvgMarkup("#ffffff", "back"));
    expect(shirtSvgMarkup("#ffffff", "back", { background: "#f2f2f2" })).toContain('fill="#f2f2f2"');
  });

  it("shades and classifies colors", () => {
    expect(shadeHex("#101010", -32)).toBe("#000000");
    expect(shadeHex("#f0f0f0", 32)).toBe("#ffffff");
    expect(isDarkHex("#111111")).toBe(true);
    expect(isDarkHex("#f5f5dc")).toBe(false);
  });
});

describe("pinch gesture", () => {
  it("returns the scale and rotation between two finger positions", () => {
    const r = pinchTransform({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 200 });
    expect(r.scale).toBeCloseTo(2);
    expect(r.rotateDeg).toBeCloseTo(90);
    expect(pinchTransform({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 5, y: 5 }).scale).toBe(1);
    expect(clampScale(100)).toBe(20);
    expect(clampScale(0.001)).toBe(0.05);
  });
});
```

Extend `tests/unit/storage.test.ts` (inside the `LocalDiskStorage` describe):

```ts
  it("reads a stored file back and returns null when it is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    const s = new LocalDiskStorage(root, "/api/uploads");
    await s.put("designs/print/a.png", new Uint8Array([7, 8, 9]), "image/png");
    expect(Array.from((await s.get("designs/print/a.png"))!)).toEqual([7, 8, 9]);
    expect(await s.get("designs/print/missing.png")).toBeNull();
    await expect(s.get("../escape.png")).rejects.toThrow();
  });
```

Extend `tests/unit/uploads.test.ts` (inside `describe("validateImage")`):

```ts
  it("accepts a larger per-call limit", () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 10);
    big.set(png);
    expect(() => validateImage(big)).toThrow(ValidationError);
    expect(validateImage(big, MAX_UPLOAD_BYTES * 2)).toEqual({ ext: "png", contentType: "image/png" });
  });
```

Run: `npm test -- tests/unit/png.test.ts tests/unit/studio-lib.test.ts tests/unit/storage.test.ts tests/unit/uploads.test.ts`
Expected: FAIL (modules missing, `get` missing, `validateImage` ignores the limit argument).

- [ ] **Step 2: Implement the pure libraries**

Create `src/lib/studio/constants.ts`:

```ts
// Client-safe constants shared by the studio (browser) and the designs service (server).
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 1000;
/** Print area in canvas units: 240 × 320 units = 12 × 16 in at 20 units per inch. Same position on front and back. */
export const PRINT_AREA = { left: 280, top: 250, width: 240, height: 320 } as const;
export const PRINT_AREA_INCHES = { width: 12, height: 16 } as const;
export const UNITS_PER_INCH = PRINT_AREA.width / PRINT_AREA_INCHES.width;
/** 3600 × 4800 = 300 DPI. 3072 × 4096 (256 DPI) is the fallback for browsers that cannot allocate a 17-megapixel canvas (iOS Safari). */
export const PRINT_SIZES = [{ width: 3600, height: 4800 }, { width: 3072, height: 4096 }] as const;
export const PREVIEW_WIDTH = 800;
export const PREVIEW_HEIGHT = 1000;
export const HISTORY_LIMIT = 20;
export const MAX_OBJECTS_PER_SIDE = 30;
export const MAX_SIDE_JSON_CHARS = 200_000;
export const MAX_TEXT_CHARS = 200;
const MB = 1024 * 1024;
export const MAX_DESIGN_ASSET_BYTES = 10 * MB;
export const MAX_PREVIEW_BYTES = 3 * MB;
export const MAX_PRINT_BYTES = 25 * MB;
export const MAX_DESIGN_UPLOAD_BYTES = 30 * MB;
export const DESIGN_ASSET_PREFIX = "designs/assets";
export const DPI_WARN = 150;
export const DPI_BLURRY = 100;

export type DesignSide = "front" | "back";
export const DESIGN_SIDES: readonly DesignSide[] = ["front", "back"];

export type StudioFontId = "anton" | "bebas" | "inter" | "marker";
export const STUDIO_FONTS: readonly { id: StudioFontId; label: string }[] = [
  { id: "anton", label: "Anton" },
  { id: "bebas", label: "Bebas Neue" },
  { id: "inter", label: "Inter" },
  { id: "marker", label: "Permanent Marker" },
];

export function isStudioFontId(v: unknown): v is StudioFontId {
  return typeof v === "string" && STUDIO_FONTS.some((f) => f.id === v);
}
```

Create `src/lib/studio/dpi.ts`:

```ts
import { DPI_BLURRY, DPI_WARN, UNITS_PER_INCH } from "./constants";

export type DpiLevel = "ok" | "low" | "blurry";

export function effectiveDpi(a: { pixelWidth: number; pixelHeight: number; printedWidthIn: number; printedHeightIn: number }): number {
  if (a.printedWidthIn <= 0 || a.printedHeightIn <= 0) return Infinity;
  return Math.floor(Math.min(a.pixelWidth / a.printedWidthIn, a.pixelHeight / a.printedHeightIn));
}

/** Image pixels versus the size it will print at. Scaled sizes are in canvas units (see UNITS_PER_INCH). */
export function objectDpi(o: { naturalWidth: number; naturalHeight: number; scaledWidth: number; scaledHeight: number }): number {
  return effectiveDpi({
    pixelWidth: o.naturalWidth,
    pixelHeight: o.naturalHeight,
    printedWidthIn: o.scaledWidth / UNITS_PER_INCH,
    printedHeightIn: o.scaledHeight / UNITS_PER_INCH,
  });
}

export function dpiLevel(dpi: number): DpiLevel {
  if (dpi < DPI_BLURRY) return "blurry";
  if (dpi < DPI_WARN) return "low";
  return "ok";
}

export function dpiMessage(level: DpiLevel): string | null {
  if (level === "blurry") return "May print blurry";
  if (level === "low") return "Low resolution: may look soft";
  return null;
}
```

Create `src/lib/studio/history.ts`:

```ts
import { HISTORY_LIMIT } from "./constants";

export interface History<T> { past: T[]; present: T; future: T[] }

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] };
}

export function pushHistory<T>(h: History<T>, next: T, limit: number = HISTORY_LIMIT): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] };
}

export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}

export const canUndo = (h: History<unknown>): boolean => h.past.length > 0;
export const canRedo = (h: History<unknown>): boolean => h.future.length > 0;
```

Create `src/lib/studio/canvas-json.ts`:

```ts
import { isStudioFontId, MAX_OBJECTS_PER_SIDE, MAX_SIDE_JSON_CHARS, MAX_TEXT_CHARS, type StudioFontId } from "./constants";

/** The only shape the studio stores per side: Fabric's `toObject(["data"])` minus canvas-level keys. */
export interface SideJson { version?: string; objects: Record<string, unknown>[] }

export const EMPTY_SIDE: SideJson = { objects: [] };

const TEXT_TYPES = new Set(["textbox", "i-text", "itext", "text"]);
const IMAGE_TYPES = new Set(["image"]);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function toSideJson(raw: unknown): SideJson | null {
  if (!isRecord(raw) || !Array.isArray(raw.objects) || !raw.objects.every(isRecord)) return null;
  return { ...(typeof raw.version === "string" ? { version: raw.version } : {}), objects: raw.objects as Record<string, unknown>[] };
}

export function fontIdOf(o: Record<string, unknown>): StudioFontId | null {
  const d = o.data;
  return isRecord(d) && isStudioFontId(d.fontId) ? d.fontId : null;
}

export function fontIdsIn(json: SideJson): StudioFontId[] {
  return [...new Set(json.objects.map(fontIdOf).filter((f): f is StudioFontId => f !== null))];
}

/** next/font family names are build-specific, so text stores a stable fontId and gets its family set on every load. */
export function withFontFamilies(json: SideJson, families: Record<StudioFontId, string>): SideJson {
  return { ...json, objects: json.objects.map((o) => { const id = fontIdOf(o); return id ? { ...o, fontFamily: families[id] } : o; }) };
}

export type SideJsonCheck = { ok: true; json: SideJson; assetUrls: string[] } | { ok: false; error: string };

export function validateSideJson(raw: unknown, assetUrlPrefix: string): SideJsonCheck {
  const malformed = { ok: false as const, error: "Design data is malformed" };
  if (!isRecord(raw)) return malformed;
  if ((raw.backgroundImage ?? null) !== null || (raw.overlayImage ?? null) !== null) return malformed;
  let size: number;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return malformed;
  }
  if (size > MAX_SIDE_JSON_CHARS) return { ok: false, error: "This design is too complex. Remove some layers." };
  const json = toSideJson(raw);
  if (!json) return malformed;
  if (json.objects.length > MAX_OBJECTS_PER_SIDE) return { ok: false, error: `Use at most ${MAX_OBJECTS_PER_SIDE} layers per side` };
  const assetUrls = new Set<string>();
  for (const o of json.objects) {
    const type = String(o.type ?? "").toLowerCase();
    if (IMAGE_TYPES.has(type)) {
      const src = o.src;
      if (typeof src !== "string" || !src.startsWith(assetUrlPrefix) || src.includes("..")) {
        return { ok: false, error: "Images must be uploaded through the studio" };
      }
      assetUrls.add(src);
    } else if (TEXT_TYPES.has(type)) {
      if (typeof o.text !== "string" || o.text.length > MAX_TEXT_CHARS) return { ok: false, error: `Keep each text under ${MAX_TEXT_CHARS} characters` };
    } else {
      return { ok: false, error: "Design contains an unsupported layer" };
    }
  }
  return { ok: true, json, assetUrls: [...assetUrls] };
}
```

Create `src/lib/studio/shirt.ts`:

```ts
import { CANVAS_HEIGHT, CANVAS_WIDTH, PRINT_AREA, type DesignSide } from "./constants";

const HEX = /^#[0-9a-f]{6}$/i;

export function safeHex(hex: string | null | undefined, fallback = "#f5f5f5"): string {
  return typeof hex === "string" && HEX.test(hex) ? hex.toLowerCase() : fallback;
}

export function shadeHex(hex: string, amount: number): string {
  const n = parseInt(safeHex(hex).slice(1), 16);
  const c = (shift: number) => Math.min(255, Math.max(0, ((n >> shift) & 255) + amount));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, "0")}`;
}

export function isDarkHex(hex: string): boolean {
  const n = parseInt(safeHex(hex).slice(1), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum / 255 < 0.5;
}

const BODY = "M250 180 L330 140 Q400 200 470 140 L550 180 L680 260 L620 360 L560 320 L560 880 L240 880 L240 320 L180 360 L120 260 Z";
const NECK: Record<DesignSide, string> = { front: "M330 140 Q400 230 470 140", back: "M330 140 Q400 172 470 140" };

/**
 * Flat T-shirt mockup in the canvas coordinate space (viewBox 0 0 800 1000). Every interpolated value is a
 * number or a regex-validated hex, so the string is safe for dangerouslySetInnerHTML and for an <img> Blob.
 */
export function shirtSvgMarkup(hex: string, side: DesignSide, opts: { guide?: boolean; background?: string | null } = {}): string {
  const fill = safeHex(hex);
  const edge = shadeHex(fill, -28);
  const id = `tee-shade-${side}`;
  const bg = opts.background ? `<rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="${safeHex(opts.background, "#f2f2f2")}"/>` : "";
  const guideColor = isDarkHex(fill) ? "#ffffff" : "#111111";
  const guide = opts.guide
    ? `<rect data-guide="print-area" x="${PRINT_AREA.left}" y="${PRINT_AREA.top}" width="${PRINT_AREA.width}" height="${PRINT_AREA.height}" fill="none" stroke="${guideColor}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="8 6"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}">${bg}<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.10"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.07"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient></defs><path d="${BODY}" fill="${fill}" stroke="${edge}" stroke-width="6" stroke-linejoin="round"/><path d="${BODY}" fill="url(#${id})"/><path d="${NECK[side]}" fill="none" stroke="${edge}" stroke-width="6"/><path d="M300 862 Q400 846 500 862" fill="none" stroke="#000" stroke-opacity="0.08" stroke-width="4"/>${guide}</svg>`;
}
```

Create `src/lib/studio/gesture.ts`:

```ts
export interface Pt { x: number; y: number }

/** Scale and rotation that take the two-finger segment a0→b0 to a1→b1. */
export function pinchTransform(a0: Pt, b0: Pt, a1: Pt, b1: Pt): { scale: number; rotateDeg: number } {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const ang0 = Math.atan2(b0.y - a0.y, b0.x - a0.x);
  const ang1 = Math.atan2(b1.y - a1.y, b1.x - a1.x);
  return { scale: d0 > 0 ? d1 / d0 : 1, rotateDeg: ((ang1 - ang0) * 180) / Math.PI };
}

export function clampScale(s: number, min = 0.05, max = 20): number {
  return Math.min(max, Math.max(min, s));
}
```

Create `src/lib/png.ts`:

```ts
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];

/** Width and height from a PNG's first chunk (IHDR); null if the bytes are not a PNG. Never decodes pixels. */
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 24) return null;
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  if (!IHDR.every((b, i) => bytes[12 + i] === b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
```

`src/lib/uploads.ts` (append):

```ts
import { MAX_DESIGN_ASSET_BYTES } from "@/lib/studio/constants";

export { MAX_DESIGN_ASSET_BYTES };

/** Same checks as imageFileError, with the studio's 10 MB limit. */
export function designAssetFileError(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) return `Only ${ACCEPTED_IMAGE_LABEL} images are allowed`;
  if (file.size > MAX_DESIGN_ASSET_BYTES) return `Images must be under ${MAX_DESIGN_ASSET_BYTES / (1024 * 1024)} MB`;
  return null;
}
```

(Place the import at the top of the file with a one-line comment that it stays client-safe.)

- [ ] **Step 3: Storage `get` and upload limits**

`src/server/adapters/storage/types.ts`: add `get(key: string): Promise<Uint8Array | null>;` with the doc comment "Reads a stored object; null when it does not exist."

`src/server/adapters/storage/local-disk.ts` (import `readFile` from `node:fs/promises`):

```ts
  async get(key: string): Promise<Uint8Array | null> {
    const full = this.resolveKey(key);
    try {
      return new Uint8Array(await readFile(full));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
```

`src/server/adapters/storage/s3.ts` (import `GetObjectCommand`):

```ts
  async get(key: string): Promise<Uint8Array | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return res.Body ? await res.Body.transformToByteArray() : null;
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }
```

`src/server/uploads.ts`:

```ts
export function validateImage(bytes: Uint8Array, maxBytes: number = MAX_UPLOAD_BYTES): Detected {
  if (bytes.byteLength > maxBytes) {
    throw new ValidationError({ file: [`Images must be under ${Math.round(maxBytes / 1024 / 1024)} MB`] });
  }
  // …magic-byte checks unchanged…
}

export async function storeImage(file: File, prefix: string, opts: { maxBytes?: number } = {}): Promise<{ url: string; key: string }> {
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES;
  // Reject oversize files before buffering them into memory.
  if (file.size > maxBytes) throw new ValidationError({ file: [`Images must be under ${Math.round(maxBytes / 1024 / 1024)} MB`] });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { ext, contentType } = validateImage(bytes, maxBytes);
  const key = newUploadKey(prefix, ext);
  const { url } = await getStorage().put(key, bytes, contentType);
  return { url, key };
}
```

Any test double that implements `StorageAdapter` by hand (search `implements StorageAdapter` in `tests/`) gains a `get` that returns `null`.

- [ ] **Step 4: Verify and commit**

Run the four test files (GREEN), then the full gate.

```bash
git add src/lib/studio src/lib/png.ts src/lib/uploads.ts src/server/adapters/storage/types.ts src/server/adapters/storage/local-disk.ts src/server/adapters/storage/s3.ts src/server/uploads.ts tests/helpers/png.ts tests/unit/png.test.ts tests/unit/studio-lib.test.ts tests/unit/storage.test.ts tests/unit/uploads.test.ts
git commit -m "feat(studio): add pure studio libraries, PNG sniffing and storage reads

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 3: Cart with custom lines, designs service, design API, guest-to-user hand-over, purge job

**Files:**
- Modify: `src/server/services/cart.ts`, `src/server/cart-cookie.ts`, `src/server/api.ts`, `src/server/jobs/index.ts`
- Create: `src/server/services/designs.ts`, `src/server/design-form.ts`, `src/app/api/designs/route.ts`, `src/app/api/designs/[id]/route.ts`, `src/app/api/designs/assets/route.ts`, `src/server/jobs/purge-designs.ts`
- Test: `tests/unit/cart-designs.test.ts`, `tests/unit/designs.test.ts`, `tests/unit/designs-api.test.ts`, `tests/unit/purge-designs.test.ts`

**Interfaces:**
- Consumes: Task 1 schema, `customUnitPricePaise`, `designSides`, `customPrintLabel`, `NO_CUSTOM_FEES`, `CustomFees` (Task 1), `getCustomFees` (Task 1), `createDesignRow`, `createOrderItemRow` (Task 1), `validateSideJson`, `toSideJson`, `SideJson`, studio constants, `pngDimensions`, `validateImage(bytes, max)`, `storeImage(file, prefix, { maxBytes })`, `StorageAdapter.get`, `fakePng` (Task 2), `uploadKeyFromUrl`, `handle`, `ok`, `clientIp`, `resolveApiCartRef`, `rateLimit`, `RateLimitedError`, `JOBS` (Phase 2 T12), `createUser`, `createOrderRow` fixtures.
- Produces:

```ts
// @/server/services/cart (changed)
export interface CartLineDesign { id: string; previewUrl: string | null; label: string; editHref: string }   // editHref = /customize/<slug>?design=<id>
export interface CartLine { /* Phase 1 fields */ design: CartLineDesign | null }      // variant.pricePaise and lineTotalPaise include print fees; product.imageUrl = design preview for custom lines
export function addItem(ref: CartRef, variantId: string, quantity: number, opts?: { designId?: string }): Promise<CartView>;
export function designOwnerWhere(ref: CartRef): Prisma.DesignWhereInput;            // { userId } | { userId: null, cartToken }
// mergeGuestCartIntoUser also hands the guest's designs to the user and moves custom lines (capped by stock across lines)
// @/server/cart-cookie (added)
export function guestCookieHeader(token: string): string;                          // Set-Cookie value matching ensureGuestToken()
// @/server/api (added)
export function withGuestCookie(res: Response, token: string | null): Response;  // X-Cart-Token header + Set-Cookie when a token was minted
// @/server/services/designs
export type { DesignSide };
export interface DesignSideUpload { json: unknown; preview: Uint8Array; print: Uint8Array }
export interface CreateDesignInput { productId: string; variantId: string; quantity: number; rightsConfirmed: boolean; front: DesignSideUpload | null; back: DesignSideUpload | null }
export interface DesignView { id: string; productId: string; colorName: string; front: SideJson | null; back: SideJson | null; frontPreviewUrl: string | null; backPreviewUrl: string | null; createdAt: Date }
export interface StudioProductCard { slug: string; name: string; pricePaise: number; imageUrl: string | null; colors: { name: string; hex: string }[] }
export interface StudioProduct { id: string; slug: string; name: string; fit: Fit; fabric: string; basePricePaise: number; variants: VariantLike[]; fees: CustomFees }
export function designFileUrl(key: string | null): string | null;
export function listStudioProducts(): Promise<StudioProductCard[]>;
export function getStudioProduct(slug: string): Promise<StudioProduct>;            // NotFoundError unless ACTIVE and isCustomizable
export function uploadDesignAsset(file: File): Promise<{ key: string; url: string }>;   // designs/assets/, ≤ 10 MB, PNG/JPEG/WebP by magic bytes
export function createDesignAndAddToCart(ref: CartRef, input: CreateDesignInput): Promise<{ designId: string; cart: CartView }>;
export function getDesignForOwner(ref: CartRef, id: string): Promise<DesignView>;   // NotFoundError for anyone else
// @/server/design-form
export function parseDesignForm(form: FormData): Promise<CreateDesignInput>;
// routes
//   POST /api/designs          multipart (productId, variantId, quantity, rightsConfirmed, frontJson/frontPreview/frontPrint, backJson/backPreview/backPrint) → 201 { data: { designId, cart } }
//   GET  /api/designs/[id]     owner only → { data: DesignView }
//   POST /api/designs/assets   multipart file → 201 { data: { key, url } }
// @/server/jobs/purge-designs
export const DESIGN_RETENTION_DAYS = 30;
export function runPurgeDesigns(now?: Date): Promise<{ purged: number; filesDeleted: number }>;
// @/server/jobs: JOBS gains "purge-designs"
```

Rules (spec §2, §3, §6): a custom line is unique per `(cart, design)`; a plain line is unique per `(cart, variant)` among plain lines; stock is checked against the **sum** of every line of that variant in the cart. A design can only go into its owner's cart, must belong to the line's product and color, and is immutable (there is no update path; "Edit design" creates a new one in Task 6). The server never trusts client prices, client asset keys or client file claims: asset keys are derived from image URLs inside the JSON, files are sniffed by magic bytes and PNG header size, and the color comes from the variant. If adding to the bag fails, the design row and its files are removed. Rate limits: design create 20 per 10 minutes per IP, asset upload 40 per 10 minutes per IP. Purge: designs older than 30 days referenced by no cart line and no order line are deleted with their preview/print files and any asset file no remaining design references (200 per run, conditional delete so a design picked up meanwhile survives).

- [ ] **Step 1: Failing tests**

Create `tests/unit/cart-designs.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDesignRow, createProduct, createUser } from "../helpers/fixtures";
import { addItem, getCart, mergeGuestCartIntoUser, updateItem } from "@/server/services/cart";
import { getSettings } from "@/server/services/settings";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";

async function blank(stock = 10, over: { slug?: string; basePricePaise?: number } = {}) {
  return createProduct({ isCustomizable: true, ...over, variants: [{ size: "M", colorName: "Black", stock }] });
}

describe("cart with custom lines", () => {
  beforeEach(resetDb);

  it("keeps plain and custom lines of one variant apart and checks stock across them", async () => {
    const p = await blank(3);
    const v = p.variants[0];
    const d = await createDesignRow({ productId: p.id, cartToken: "g1" });
    await addItem({ guestToken: "g1" }, v.id, 2);
    const view = await addItem({ guestToken: "g1" }, v.id, 1, { designId: d.id });
    expect(view.items.map((i) => [i.quantity, i.design?.id ?? null])).toEqual([[2, null], [1, d.id]]);
    await expect(addItem({ guestToken: "g1" }, v.id, 1, { designId: d.id })).rejects.toMatchObject({ available: 1 });
    await expect(addItem({ guestToken: "g1" }, v.id, 1)).rejects.toBeInstanceOf(OutOfStockError);
    const custom = view.items.find((i) => i.design)!;
    await expect(updateItem({ guestToken: "g1" }, custom.id, 2)).rejects.toBeInstanceOf(OutOfStockError);
  });

  it("adds the same design once and increases its quantity", async () => {
    const p = await blank();
    const d = await createDesignRow({ productId: p.id, cartToken: "g1" });
    await addItem({ guestToken: "g1" }, p.variants[0].id, 1, { designId: d.id });
    const view = await addItem({ guestToken: "g1" }, p.variants[0].id, 2, { designId: d.id });
    expect(view.items).toHaveLength(1);
    expect(view.items[0].quantity).toBe(3);
  });

  it("refuses designs owned by someone else, made for another product or another color", async () => {
    const p = await blank();
    const other = await createProduct({ isCustomizable: true, variants: [{ size: "M", colorName: "White", stock: 5 }] });
    const theirs = await createDesignRow({ productId: p.id, cartToken: "someone-else" });
    const mine = await createDesignRow({ productId: p.id, cartToken: "g1" });
    const white = await createDesignRow({ productId: other.id, cartToken: "g1", colorName: "Black" });
    await expect(addItem({ guestToken: "g1" }, p.variants[0].id, 1, { designId: theirs.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(addItem({ guestToken: "g1" }, other.variants[0].id, 1, { designId: mine.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(addItem({ guestToken: "g1" }, other.variants[0].id, 1, { designId: white.id })).rejects.toBeInstanceOf(ValidationError);
    const u = await createUser();
    await expect(addItem({ userId: u.id }, p.variants[0].id, 1, { designId: mine.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("prices custom lines with the print fees and links back to the studio", async () => {
    await getSettings();
    await db.storeSetting.update({ where: { id: 1 }, data: { customFrontFeePaise: 5000, customBackFeePaise: 14900 } });
    const p = await blank(10, { slug: "blank-tee", basePricePaise: 54900 });
    const d = await createDesignRow({ productId: p.id, cartToken: "g1", backPrintKey: "designs/print/b.png", backPreviewKey: "designs/previews/b.png" });
    const view = await addItem({ guestToken: "g1" }, p.variants[0].id, 2, { designId: d.id });
    expect(view.items[0]).toMatchObject({
      lineTotalPaise: 2 * 74800,
      variant: { pricePaise: 74800 },
      design: { id: d.id, label: "Custom print: front + back", editHref: `/customize/blank-tee?design=${d.id}`, previewUrl: "/api/uploads/designs/previews/f.png" },
      product: { imageUrl: "/api/uploads/designs/previews/f.png" },
    });
    expect(view.subtotalPaise).toBe(149600);
    expect((await getCart({ guestToken: "g1" })).items[0].design?.id).toBe(d.id);
  });

  it("hands designs and custom lines to the user on login, capped by stock", async () => {
    const p = await blank(3);
    const v = p.variants[0];
    const u = await createUser();
    await addItem({ userId: u.id }, v.id, 2);
    const d = await createDesignRow({ productId: p.id, cartToken: "g1" });
    await createDesignRow({ productId: p.id, cartToken: "g1" }); // designed but never added
    await addItem({ guestToken: "g1" }, v.id, 1, { designId: d.id });
    await addItem({ guestToken: "g1" }, v.id, 1);
    const merged = await mergeGuestCartIntoUser("g1", u.id);
    expect(merged.items.map((i) => [i.quantity, i.design?.id ?? null])).toEqual([[2, null], [1, d.id]]);
    expect(await db.design.count({ where: { userId: u.id, cartToken: null } })).toBe(2);
    expect(await db.cart.count({ where: { guestToken: "g1" } })).toBe(0);
  });

  it("hands designs over even when the guest has no cart", async () => {
    const p = await blank();
    const u = await createUser();
    await createDesignRow({ productId: p.id, cartToken: "lonely" });
    await mergeGuestCartIntoUser("lonely", u.id);
    expect(await db.design.count({ where: { userId: u.id } })).toBe(1);
  });
});
```

(In the merge test the guest's plain unit is dropped because the user already holds 2 plain + 1 custom = 3 = stock.)

Create `tests/unit/designs.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

const root = mkdtempSync(join(tmpdir(), "designs-"));
const storage = new LocalDiskStorage(root, "/api/uploads");
vi.mock("@/server/adapters/storage", async (orig) => ({ ...(await orig<typeof import("@/server/adapters/storage")>()), getStorage: () => storage }));

import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct, createUser } from "../helpers/fixtures";
import { fakePng } from "../helpers/png";
import { mergeGuestCartIntoUser } from "@/server/services/cart";
import {
  createDesignAndAddToCart, getDesignForOwner, getStudioProduct, listStudioProducts, uploadDesignAsset, type CreateDesignInput, type DesignSideUpload,
} from "@/server/services/designs";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";

const text = { type: "Textbox", text: "HELLO", data: { kind: "text", fontId: "anton" } };
const side = (objects: unknown[] = [text], over: Partial<DesignSideUpload> = {}): DesignSideUpload => ({
  json: { version: "6.4.0", objects }, preview: fakePng(800, 1000), print: fakePng(3600, 4800), ...over,
});
const files = (dir: "print" | "previews" | "assets") => {
  const d = join(root, "designs", dir);
  return existsSync(d) ? readdirSync(d).length : 0;
};

async function blank(stock = 5) {
  const p = await createProduct({ isCustomizable: true, variants: [{ size: "M", colorName: "Black", stock }] });
  return { productId: p.id, variantId: p.variants[0].id };
}
const input = (ids: { productId: string; variantId: string }, over: Partial<CreateDesignInput> = {}): CreateDesignInput => ({
  ...ids, quantity: 1, rightsConfirmed: true, front: side(), back: null, ...over,
});

describe("designs service", () => {
  beforeEach(resetDb);

  it("stores four files, derives asset keys from the JSON and adds a custom line", async () => {
    const ids = await blank();
    const asset = await uploadDesignAsset(new File([fakePng(1200, 1600)], "art.png", { type: "image/png" }));
    expect(asset.key).toMatch(/^designs\/assets\/[a-z0-9-]+\.png$/);
    const before = { print: files("print"), previews: files("previews") };
    const { designId, cart } = await createDesignAndAddToCart({ guestToken: "g1" }, input(ids, { back: side([{ type: "Image", src: asset.url, data: { kind: "image" } }]) }));
    const d = await db.design.findUniqueOrThrow({ where: { id: designId } });
    expect(d).toMatchObject({ cartToken: "g1", userId: null, colorName: "Black", rightsConfirmed: true, assetKeys: [asset.key] });
    expect(d.frontPrintKey).toMatch(/^designs\/print\//);
    expect(d.backPreviewKey).toMatch(/^designs\/previews\//);
    expect(files("print")).toBe(before.print + 2);
    expect(files("previews")).toBe(before.previews + 2);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].design).toMatchObject({ id: designId, label: "Custom print: front + back" });
  });

  it("accepts the reduced print size used by small devices", async () => {
    const ids = await blank();
    await expect(createDesignAndAddToCart({ guestToken: "g" }, input(ids, { front: side([text], { print: fakePng(3072, 4096) }) }))).resolves.toMatchObject({ designId: expect.any(String) });
  });

  it("validates rights, emptiness, file formats, sizes and image origins", async () => {
    const ids = await blank();
    const g = { guestToken: "g1" };
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    for (const bad of [
      input(ids, { rightsConfirmed: false }),
      input(ids, { front: null }),
      input(ids, { front: side([]) }),
      input(ids, { quantity: 11 }),
      input(ids, { front: side([text], { print: fakePng(1000, 1000) }) }),
      input(ids, { front: side([text], { preview: fakePng(400, 500) }) }),
      input(ids, { front: side([text], { preview: jpeg }) }),
      input(ids, { front: side([{ type: "Image", src: "https://evil.example/x.png" }]) }),
      input(ids, { front: side([{ type: "Rect" }]) }),
    ]) {
      await expect(createDesignAndAddToCart(g, bad)).rejects.toBeInstanceOf(ValidationError);
    }
    expect(await db.design.count()).toBe(0);
  });

  it("refuses products that are not customizable and variants of another product", async () => {
    const plain = await createProduct();
    const ids = await blank();
    const g = { guestToken: "g" };
    await expect(createDesignAndAddToCart(g, input({ productId: plain.id, variantId: plain.variants[0].id }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(createDesignAndAddToCart(g, input({ productId: ids.productId, variantId: plain.variants[0].id }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("removes the design and its files when the bag refuses the line", async () => {
    const ids = await blank(0);
    const before = files("print");
    await expect(createDesignAndAddToCart({ guestToken: "g" }, input(ids))).rejects.toBeInstanceOf(OutOfStockError);
    expect(await db.design.count()).toBe(0);
    expect(files("print")).toBe(before);
  });

  it("lets only the owner load a design and hands guest designs to the user on login", async () => {
    const ids = await blank();
    const { designId } = await createDesignAndAddToCart({ guestToken: "g1" }, input(ids));
    expect((await getDesignForOwner({ guestToken: "g1" }, designId)).front?.objects).toHaveLength(1);
    await expect(getDesignForOwner({ guestToken: "g2" }, designId)).rejects.toBeInstanceOf(NotFoundError);
    const u = await createUser();
    await expect(getDesignForOwner({ userId: u.id }, designId)).rejects.toBeInstanceOf(NotFoundError);
    const cart = await mergeGuestCartIntoUser("g1", u.id);
    expect(cart.items[0].design?.id).toBe(designId);
    expect(await getDesignForOwner({ userId: u.id }, designId)).toMatchObject({ id: designId, colorName: "Black", back: null });
    await expect(getDesignForOwner({ guestToken: "g1" }, designId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("accepts design assets up to 10 MB", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(fakePng(10, 10));
    expect((await uploadDesignAsset(new File([big], "big.png", { type: "image/png" }))).url).toMatch(/^\/api\/uploads\/designs\/assets\//);
    const huge = new Uint8Array(10 * 1024 * 1024 + 1);
    huge.set(fakePng(10, 10));
    await expect(uploadDesignAsset(new File([huge], "huge.png", { type: "image/png" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("lists customizable products and loads one for the studio", async () => {
    await createProduct({ name: "Plain" });
    const p = await createProduct({ name: "Blank", slug: "blank", basePricePaise: 54900, isCustomizable: true, variants: [{ size: "M", colorName: "Black", colorHex: "#111111", stock: 2, pricePaise: 59900 }, { size: "L", colorName: "Black", colorHex: "#111111", stock: 0 }] });
    expect((await listStudioProducts()).map((c) => [c.slug, c.colors])).toEqual([["blank", [{ name: "Black", hex: "#111111" }]]]);
    const sp = await getStudioProduct("blank");
    expect(sp).toMatchObject({ id: p.id, basePricePaise: 54900, fees: { frontPaise: 0, backPaise: 14900 } });
    expect(sp.variants.map((v) => [v.size, v.pricePaise, v.stock])).toEqual([["M", 59900, 2], ["L", 54900, 0]]);
    await expect(getStudioProduct("plain")).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

Create `tests/unit/designs-api.test.ts` (same storage mock header as `designs.test.ts`, then):

```ts
import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct } from "../helpers/fixtures";
import { fakePng } from "../helpers/png";
import { POST as createDesign } from "@/app/api/designs/route";
import { GET as getDesign } from "@/app/api/designs/[id]/route";
import { POST as uploadAsset } from "@/app/api/designs/assets/route";

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
function req(path: string, init: { method?: string; body?: FormData; token?: string } = {}) {
  const headers = new Headers();
  if (init.token) headers.set("X-Cart-Token", init.token);
  return new NextRequest(`http://localhost${path}`, { method: init.method ?? "GET", body: init.body, headers });
}
function designForm(productId: string, variantId: string, frontJson: unknown) {
  const f = new FormData();
  f.set("productId", productId);
  f.set("variantId", variantId);
  f.set("quantity", "2");
  f.set("rightsConfirmed", "true");
  f.set("frontJson", JSON.stringify(frontJson));
  f.set("frontPreview", new File([fakePng(800, 1000)], "front-preview.png", { type: "image/png" }));
  f.set("frontPrint", new File([fakePng(3600, 4800)], "front-print.png", { type: "image/png" }));
  return f;
}

describe("design API", () => {
  beforeEach(resetDb);

  it("uploads an asset, creates a design for the cart token and shows it only to its owner", async () => {
    const p = await createProduct({ isCustomizable: true });
    const af = new FormData();
    af.set("file", new File([fakePng(1200, 1600)], "art.png", { type: "image/png" }));
    const assetRes = await uploadAsset(req("/api/designs/assets", { method: "POST", body: af }), ctx());
    expect(assetRes.status).toBe(201);
    const asset = (await assetRes.json()).data as { url: string };
    const res = await createDesign(req("/api/designs", { method: "POST", token: "g-api", body: designForm(p.id, p.variants[0].id, { version: "6.4.0", objects: [{ type: "Image", src: asset.url }] }) }), ctx());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.cart.items[0]).toMatchObject({ quantity: 2 });
    const id = body.data.designId as string;
    expect((await db.design.findUniqueOrThrow({ where: { id } })).cartToken).toBe("g-api");
    expect((await getDesign(req(`/api/designs/${id}`, { token: "g-api" }), ctx({ id }))).status).toBe(200);
    expect((await getDesign(req(`/api/designs/${id}`, { token: "someone-else" }), ctx({ id }))).status).toBe(404);
  });

  it("mints a guest cart cookie when the browser has none", async () => {
    const p = await createProduct({ isCustomizable: true });
    const res = await createDesign(req("/api/designs", { method: "POST", body: designForm(p.id, p.variants[0].id, { objects: [{ type: "Textbox", text: "HI" }] }) }), ctx());
    expect(res.status).toBe(201);
    const token = res.headers.get("X-Cart-Token");
    expect(token).toBeTruthy();
    expect(res.headers.get("set-cookie")).toContain(`cart_token=${token}`);
    expect((await db.design.findFirstOrThrow()).cartToken).toBe(token);
  });

  it("answers 400 for an incomplete side or malformed JSON", async () => {
    const p = await createProduct({ isCustomizable: true });
    const f = designForm(p.id, p.variants[0].id, { objects: [] });
    f.delete("frontPrint");
    expect((await createDesign(req("/api/designs", { method: "POST", token: "g", body: f }), ctx())).status).toBe(400);
    const g = designForm(p.id, p.variants[0].id, {});
    g.set("frontJson", "{not json");
    expect((await createDesign(req("/api/designs", { method: "POST", token: "g", body: g }), ctx())).status).toBe(400);
  });
});
```

(Import `beforeEach`, `describe`, `expect`, `it`, `vi` from `vitest` at the top with the storage mock.)

Create `tests/unit/purge-designs.test.ts` (same storage mock header, with `root` exported for `existsSync` checks):

```ts
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDesignRow, createOrderItemRow, createOrderRow, createProduct, createUser } from "../helpers/fixtures";
import { fakePng } from "../helpers/png";
import { runPurgeDesigns } from "@/server/jobs/purge-designs";
import { JOBS } from "@/server/jobs";

const DAY = 86_400_000;

describe("purge-designs job", () => {
  beforeEach(resetDb);

  it("purges old unreferenced designs with their files and keeps everything else", async () => {
    const p = await createProduct({ isCustomizable: true });
    const old = new Date(Date.now() - 31 * DAY);
    for (const k of ["designs/print/old.png", "designs/previews/old.png", "designs/assets/shared.png", "designs/assets/solo.png"]) {
      await storage.put(k, fakePng(1, 1), "image/png");
    }
    const stale = await createDesignRow({ productId: p.id, cartToken: "g", createdAt: old, frontPrintKey: "designs/print/old.png", frontPreviewKey: "designs/previews/old.png", assetKeys: ["designs/assets/shared.png", "designs/assets/solo.png"] });
    const recent = await createDesignRow({ productId: p.id, cartToken: "g", assetKeys: ["designs/assets/shared.png"] });
    const inCart = await createDesignRow({ productId: p.id, cartToken: "g", createdAt: old });
    const cart = await db.cart.create({ data: { guestToken: "g" } });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: p.variants[0].id, quantity: 1, designId: inCart.id } });
    const u = await createUser();
    const ordered = await createDesignRow({ productId: p.id, userId: u.id, createdAt: old });
    await createOrderItemRow((await createOrderRow(u.id)).id, { designId: ordered.id });

    expect(await runPurgeDesigns()).toEqual({ purged: 1, filesDeleted: 3 });
    const left = (await db.design.findMany({ select: { id: true } })).map((d) => d.id).sort();
    expect(left).toEqual([recent.id, inCart.id, ordered.id].sort());
    expect(await db.design.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(existsSync(join(root, "designs", "print", "old.png"))).toBe(false);
    expect(existsSync(join(root, "designs", "previews", "old.png"))).toBe(false);
    expect(existsSync(join(root, "designs", "assets", "solo.png"))).toBe(false);
    expect(existsSync(join(root, "designs", "assets", "shared.png"))).toBe(true);
    expect(await runPurgeDesigns()).toEqual({ purged: 0, filesDeleted: 0 });
  });

  it("is registered as a cron job", () => {
    expect(Object.keys(JOBS)).toContain("purge-designs");
  });
});
```

Run: `npm test -- tests/unit/cart-designs.test.ts tests/unit/designs.test.ts tests/unit/designs-api.test.ts tests/unit/purge-designs.test.ts`
Expected: FAIL (modules and options missing).

- [ ] **Step 2: Cart service**

Replace `src/server/services/cart.ts` with (unchanged exports keep their behaviour for plain lines):

```ts
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { getStorage } from "@/server/adapters/storage";
import { MAX_QTY_PER_LINE } from "@/lib/catalog-types";
import { customPrintLabel, customUnitPricePaise, designSides, NO_CUSTOM_FEES, type CustomFees } from "@/lib/custom-pricing";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";
import { getCustomFees } from "@/server/services/settings";

export type CartRef = { userId: string } | { guestToken: string };
export { MAX_QTY_PER_LINE };

export interface CartLineDesign { id: string; previewUrl: string | null; label: string; editHref: string }

export interface CartLine {
  id: string;
  variantId: string;
  quantity: number;
  lineTotalPaise: number;
  product: { slug: string; name: string; imageUrl: string | null };
  variant: { size: string; colorName: string; colorHex: string; pricePaise: number; stock: number };
  design: CartLineDesign | null;
}

export interface CartView {
  id: string | null;
  items: CartLine[];
  subtotalPaise: number;
  itemCount: number;
}

export const EMPTY_CART: CartView = { id: null, items: [], subtotalPaise: 0, itemCount: 0 };

const designSelect = { id: true, frontPreviewKey: true, backPreviewKey: true, frontPrintKey: true, backPrintKey: true } as const;

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      design: { select: designSelect },
      variant: { include: { product: { include: { images: { orderBy: { sortOrder: "asc" as const } } } } } },
    },
  },
} satisfies Prisma.CartInclude;

type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

function whereRef(ref: CartRef): Prisma.CartWhereUniqueInput {
  return "userId" in ref ? { userId: ref.userId } : { guestToken: ref.guestToken };
}

export function designOwnerWhere(ref: CartRef): Prisma.DesignWhereInput {
  return "userId" in ref ? { userId: ref.userId } : { userId: null, cartToken: ref.guestToken };
}

function toView(cart: CartRow, fees: CustomFees): CartView {
  const storage = getStorage();
  const items: CartLine[] = cart.items.map((it) => {
    const p = it.variant.product;
    const sides = it.design ? designSides(it.design) : null;
    const pricePaise = customUnitPricePaise(it.variant.pricePaise ?? p.basePricePaise, sides, fees);
    const colorImage = p.images.find((img) => img.colorName === it.variant.colorName) ?? p.images[0];
    const previewKey = it.design ? (it.design.frontPreviewKey ?? it.design.backPreviewKey) : null;
    const previewUrl = previewKey ? storage.getPublicUrl(previewKey) : null;
    return {
      id: it.id,
      variantId: it.variantId,
      quantity: it.quantity,
      lineTotalPaise: pricePaise * it.quantity,
      product: { slug: p.slug, name: p.name, imageUrl: previewUrl ?? colorImage?.url ?? null },
      variant: { size: it.variant.size, colorName: it.variant.colorName, colorHex: it.variant.colorHex, pricePaise, stock: it.variant.stock },
      design: it.design
        ? { id: it.design.id, previewUrl, label: customPrintLabel(sides) ?? "Custom print", editHref: `/customize/${p.slug}?design=${it.design.id}` }
        : null,
    };
  });
  return {
    id: cart.id,
    items,
    subtotalPaise: items.reduce((s, i) => s + i.lineTotalPaise, 0),
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
  };
}

async function findOrCreateCartId(ref: CartRef): Promise<string> {
  const existing = await db.cart.findUnique({ where: whereRef(ref), select: { id: true } });
  if (existing) return existing.id;
  const created = await db.cart.create({ data: "userId" in ref ? { userId: ref.userId } : { guestToken: ref.guestToken } });
  return created.id;
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QTY_PER_LINE) {
    throw new ValidationError({ quantity: [`Quantity must be between 0 and ${MAX_QTY_PER_LINE}`] });
  }
}

async function loadSellableVariant(variantId: string) {
  const v = await db.productVariant.findFirst({ where: { id: variantId, product: { status: "ACTIVE" } } });
  if (!v) throw new NotFoundError("Variant");
  return v;
}

/** Units of this variant held by the cart's other lines (plain + custom share one stock). */
async function qtyInOtherLines(cartId: string, variantId: string, excludeItemId: string | null): Promise<number> {
  const r = await db.cartItem.aggregate({
    where: { cartId, variantId, ...(excludeItemId ? { id: { not: excludeItemId } } : {}) },
    _sum: { quantity: true },
  });
  return r._sum.quantity ?? 0;
}

async function assertDesignFits(ref: CartRef, designId: string, variant: { productId: string; colorName: string }): Promise<void> {
  const d = await db.design.findFirst({ where: { id: designId, ...designOwnerWhere(ref) }, select: { productId: true, colorName: true } });
  if (!d) throw new NotFoundError("Design");
  if (d.productId !== variant.productId || d.colorName !== variant.colorName) {
    throw new ValidationError({ designId: ["This design was made for a different tee or color"] });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function getCart(ref: CartRef): Promise<CartView> {
  const cart = await db.cart.findUnique({ where: whereRef(ref), include: cartInclude });
  if (!cart) return EMPTY_CART;
  const fees = cart.items.some((i) => i.designId) ? await getCustomFees() : NO_CUSTOM_FEES;
  return toView(cart, fees);
}

export async function addItem(ref: CartRef, variantId: string, quantity: number, opts: { designId?: string } = {}): Promise<CartView> {
  assertQuantity(quantity);
  if (quantity === 0) throw new ValidationError({ quantity: ["Quantity must be at least 1"] });
  const variant = await loadSellableVariant(variantId);
  const designId = opts.designId ?? null;
  if (designId) await assertDesignFits(ref, designId, variant);
  const cartId = await findOrCreateCartId(ref);
  const existing = designId
    ? await db.cartItem.findUnique({ where: { cartId_designId: { cartId, designId } } })
    : await db.cartItem.findFirst({ where: { cartId, variantId, designId: null } });
  if (existing && existing.variantId !== variantId) throw new ValidationError({ designId: ["This design is already in your bag in another size"] });
  const next = (existing?.quantity ?? 0) + quantity;
  if (next > MAX_QTY_PER_LINE) throw new ValidationError({ quantity: [`You can add at most ${MAX_QTY_PER_LINE} of one item`] });
  const elsewhere = await qtyInOtherLines(cartId, variantId, existing?.id ?? null);
  if (next + elsewhere > variant.stock) throw new OutOfStockError(Math.max(0, variant.stock - elsewhere));
  if (existing) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: next } });
  } else {
    try {
      await db.cartItem.create({ data: { cartId, variantId, designId, quantity: next } });
    } catch (err) {
      // A concurrent add created the same line first (partial unique index or cartId_designId): retry as an update.
      if (isUniqueViolation(err)) return addItem(ref, variantId, quantity, opts);
      throw err;
    }
  }
  return getCart(ref);
}

async function ownedItem(ref: CartRef, itemId: string) {
  const item = await db.cartItem.findFirst({ where: { id: itemId, cart: whereRef(ref) }, include: { variant: true } });
  if (!item) throw new NotFoundError("Cart item");
  return item;
}

export async function updateItem(ref: CartRef, itemId: string, quantity: number): Promise<CartView> {
  assertQuantity(quantity);
  const item = await ownedItem(ref, itemId);
  if (quantity === 0) {
    await db.cartItem.delete({ where: { id: item.id } });
    return getCart(ref);
  }
  const elsewhere = await qtyInOtherLines(item.cartId, item.variantId, item.id);
  if (quantity + elsewhere > item.variant.stock) throw new OutOfStockError(Math.max(0, item.variant.stock - elsewhere));
  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return getCart(ref);
}

export async function removeItem(ref: CartRef, itemId: string): Promise<CartView> {
  const item = await ownedItem(ref, itemId);
  await db.cartItem.delete({ where: { id: item.id } });
  return getCart(ref);
}

export async function mergeGuestCartIntoUser(guestToken: string, userId: string): Promise<CartView> {
  const handOver = { where: { cartToken: guestToken, userId: null }, data: { userId, cartToken: null } };
  const guest = await db.cart.findUnique({ where: { guestToken }, include: { items: { orderBy: { createdAt: "asc" }, include: { variant: true } } } });
  if (!guest) {
    await db.design.updateMany(handOver);
    return getCart({ userId });
  }
  const userCartId = await findOrCreateCartId({ userId });
  await db.$transaction(async (tx) => {
    // Designs made as a guest belong to the user from now on (the studio's "Edit design" needs this).
    await tx.design.updateMany(handOver);
    const held = new Map<string, number>();
    for (const u of await tx.cartItem.findMany({ where: { cartId: userCartId }, select: { variantId: true, quantity: true } })) {
      held.set(u.variantId, (held.get(u.variantId) ?? 0) + u.quantity);
    }
    for (const it of guest.items) {
      const inCart = held.get(it.variantId) ?? 0;
      if (it.designId) {
        const qty = Math.min(it.quantity, it.variant.stock - inCart, MAX_QTY_PER_LINE);
        if (qty <= 0) continue; // dropped with the guest cart; the design itself stays with the user
        await tx.cartItem.update({ where: { id: it.id }, data: { cartId: userCartId, quantity: qty } });
        held.set(it.variantId, inCart + qty);
        continue;
      }
      const existing = await tx.cartItem.findFirst({ where: { cartId: userCartId, variantId: it.variantId, designId: null } });
      const others = inCart - (existing?.quantity ?? 0);
      const merged = Math.min((existing?.quantity ?? 0) + it.quantity, it.variant.stock - others, MAX_QTY_PER_LINE);
      if (merged <= (existing?.quantity ?? 0)) continue;
      if (existing) await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: merged } });
      else await tx.cartItem.create({ data: { cartId: userCartId, variantId: it.variantId, quantity: merged } });
      held.set(it.variantId, others + merged);
    }
    await tx.cart.delete({ where: { id: guest.id } });
  });
  return getCart({ userId });
}
```

Notes: `settings.ts` does not import `cart.ts`, so there is no import cycle. The Phase 1 cart tests keep passing unchanged (plain-only carts behave exactly as before; the merge cap still equals stock when there are no custom lines).

- [ ] **Step 3: Guest cookie for route handlers**

`src/server/cart-cookie.ts` (append; reuse `ONE_YEAR` and `CART_COOKIE`):

```ts
/** Set-Cookie value equivalent to ensureGuestToken(), for route handlers that mint a token themselves. */
export function guestCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${CART_COOKIE}=${token}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; SameSite=Lax${secure}`;
}
```

`src/server/api.ts` (import `guestCookieHeader` next to `CART_COOKIE`):

```ts
/** Like withCartToken, and also stores the token as the browser's cart cookie (the studio posts with fetch). */
export function withGuestCookie(res: Response, token: string | null): Response {
  if (!token) return res;
  res.headers.set(CART_TOKEN_HEADER, token);
  res.headers.append("Set-Cookie", guestCookieHeader(token));
  return res;
}
```

- [ ] **Step 4: Designs service and form parsing**

Create `src/server/services/designs.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { Fit, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { getStorage } from "@/server/adapters/storage";
import { NotFoundError, ValidationError } from "@/server/errors";
import { storeImage, uploadKeyFromUrl, validateImage } from "@/server/uploads";
import { addItem, designOwnerWhere, type CartRef, type CartView } from "@/server/services/cart";
import { getCustomFees } from "@/server/services/settings";
import { MAX_QTY_PER_LINE } from "@/lib/catalog-types";
import type { CustomFees } from "@/lib/custom-pricing";
import { pngDimensions } from "@/lib/png";
import { toSideJson, validateSideJson, type SideJson } from "@/lib/studio/canvas-json";
import {
  DESIGN_ASSET_PREFIX, DESIGN_SIDES, MAX_DESIGN_ASSET_BYTES, MAX_DESIGN_UPLOAD_BYTES, MAX_PREVIEW_BYTES, MAX_PRINT_BYTES,
  PREVIEW_HEIGHT, PREVIEW_WIDTH, PRINT_SIZES, type DesignSide,
} from "@/lib/studio/constants";
import type { VariantLike } from "@/lib/variant-matrix";

export type { DesignSide };

export interface DesignSideUpload { json: unknown; preview: Uint8Array; print: Uint8Array }
export interface CreateDesignInput {
  productId: string; variantId: string; quantity: number; rightsConfirmed: boolean;
  front: DesignSideUpload | null; back: DesignSideUpload | null;
}
export interface DesignView {
  id: string; productId: string; colorName: string; front: SideJson | null; back: SideJson | null;
  frontPreviewUrl: string | null; backPreviewUrl: string | null; createdAt: Date;
}
export interface StudioProductCard { slug: string; name: string; pricePaise: number; imageUrl: string | null; colors: { name: string; hex: string }[] }
export interface StudioProduct { id: string; slug: string; name: string; fit: Fit; fabric: string; basePricePaise: number; variants: VariantLike[]; fees: CustomFees }

export function designFileUrl(key: string | null): string | null {
  return key ? getStorage().getPublicUrl(key) : null;
}

export async function listStudioProducts(): Promise<StudioProductCard[]> {
  const rows = await db.product.findMany({
    where: { status: "ACTIVE", isCustomizable: true },
    orderBy: { createdAt: "asc" },
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      variants: { orderBy: { sortOrder: "asc" }, select: { colorName: true, colorHex: true } },
    },
  });
  return rows.map((p) => {
    const colors = new Map<string, string>();
    for (const v of p.variants) if (!colors.has(v.colorName)) colors.set(v.colorName, v.colorHex);
    return { slug: p.slug, name: p.name, pricePaise: p.basePricePaise, imageUrl: p.images[0]?.url ?? null, colors: [...colors].map(([name, hex]) => ({ name, hex })) };
  });
}

export async function getStudioProduct(slug: string): Promise<StudioProduct> {
  const p = await db.product.findFirst({
    where: { slug, status: "ACTIVE", isCustomizable: true },
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  });
  if (!p) throw new NotFoundError("Customizable product");
  return {
    id: p.id, slug: p.slug, name: p.name, fit: p.fit, fabric: p.fabric, basePricePaise: p.basePricePaise,
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, colorName: v.colorName, colorHex: v.colorHex, stock: v.stock, pricePaise: v.pricePaise ?? p.basePricePaise })),
    fees: await getCustomFees(),
  };
}

export async function uploadDesignAsset(file: File): Promise<{ key: string; url: string }> {
  return storeImage(file, DESIGN_ASSET_PREFIX, { maxBytes: MAX_DESIGN_ASSET_BYTES });
}

function checkPng(bytes: Uint8Array, side: DesignSide, kind: "Preview" | "Print"): void {
  const field = `${side}${kind}`;
  const what = `${side} ${kind.toLowerCase()} file`;
  let ext: string;
  try {
    ext = validateImage(bytes, kind === "Preview" ? MAX_PREVIEW_BYTES : MAX_PRINT_BYTES).ext;
  } catch {
    throw new ValidationError({ [field]: [`The ${what} is not a valid image or is too large`] });
  }
  const dims = ext === "png" ? pngDimensions(bytes) : null;
  const ok =
    dims !== null &&
    (kind === "Preview"
      ? dims.width === PREVIEW_WIDTH && dims.height === PREVIEW_HEIGHT
      : PRINT_SIZES.some((s) => s.width === dims.width && s.height === dims.height));
  if (!ok) throw new ValidationError({ [field]: [`The ${what} has the wrong format or size`] });
}

function assetKeyFromUrl(url: string): string {
  const key = uploadKeyFromUrl(url);
  if (!key || !key.startsWith(`${DESIGN_ASSET_PREFIX}/`)) throw new ValidationError({ design: ["Images must be uploaded through the studio"] });
  return key;
}

export async function createDesignAndAddToCart(ref: CartRef, input: CreateDesignInput): Promise<{ designId: string; cart: CartView }> {
  if (!input.rightsConfirmed) throw new ValidationError({ rightsConfirmed: ["Confirm that you own the rights to this artwork"] });
  if (!input.front && !input.back) throw new ValidationError({ design: ["Add something to the front or back first"] });
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_QTY_PER_LINE) {
    throw new ValidationError({ quantity: [`Choose a quantity between 1 and ${MAX_QTY_PER_LINE}`] });
  }
  const variant = await db.productVariant.findFirst({
    where: { id: input.variantId, productId: input.productId, product: { status: "ACTIVE", isCustomizable: true } },
    select: { id: true, colorName: true },
  });
  if (!variant) throw new NotFoundError("Customizable product");

  const assetUrlPrefix = getStorage().getPublicUrl(`${DESIGN_ASSET_PREFIX}/`);
  const checked: { side: DesignSide; upload: DesignSideUpload; json: SideJson }[] = [];
  const assetKeys = new Set<string>();
  let totalBytes = 0;
  for (const side of DESIGN_SIDES) {
    const upload = input[side];
    if (!upload) continue;
    totalBytes += upload.preview.byteLength + upload.print.byteLength;
    const check = validateSideJson(upload.json, assetUrlPrefix);
    if (!check.ok) throw new ValidationError({ [`${side}Json`]: [check.error] });
    if (check.json.objects.length === 0) throw new ValidationError({ [`${side}Json`]: [`The ${side} is empty`] });
    for (const url of check.assetUrls) assetKeys.add(assetKeyFromUrl(url));
    checkPng(upload.preview, side, "Preview");
    checkPng(upload.print, side, "Print");
    checked.push({ side, upload, json: check.json });
  }
  if (totalBytes > MAX_DESIGN_UPLOAD_BYTES) throw new ValidationError({ design: ["This design is too large to upload. Try smaller images."] });

  const storage = getStorage();
  const written: string[] = [];
  const put = async (bytes: Uint8Array, folder: "previews" | "print") => {
    const key = `designs/${folder}/${randomUUID()}.png`;
    await storage.put(key, bytes, "image/png");
    written.push(key);
    return key;
  };
  const owner = "userId" in ref ? { userId: ref.userId, cartToken: null } : { userId: null, cartToken: ref.guestToken };
  const data: Prisma.DesignUncheckedCreateInput = { ...owner, productId: input.productId, colorName: variant.colorName, assetKeys: [...assetKeys], rightsConfirmed: true };
  try {
    for (const { side, upload, json } of checked) {
      const previewKey = await put(upload.preview, "previews");
      const printKey = await put(upload.print, "print");
      const stored = json as unknown as Prisma.InputJsonObject;
      if (side === "front") Object.assign(data, { frontJson: stored, frontPreviewKey: previewKey, frontPrintKey: printKey });
      else Object.assign(data, { backJson: stored, backPreviewKey: previewKey, backPrintKey: printKey });
    }
    const design = await db.design.create({ data, select: { id: true } });
    try {
      return { designId: design.id, cart: await addItem(ref, variant.id, input.quantity, { designId: design.id }) };
    } catch (err) {
      await db.design.delete({ where: { id: design.id } }).catch((e) => console.error("[designs] rollback failed", design.id, e));
      throw err;
    }
  } catch (err) {
    await Promise.all(written.map((k) => storage.delete(k).catch((e) => console.error("[designs] file cleanup failed", k, e))));
    throw err;
  }
}

export async function getDesignForOwner(ref: CartRef, id: string): Promise<DesignView> {
  const d = await db.design.findFirst({ where: { id, ...designOwnerWhere(ref) } });
  if (!d) throw new NotFoundError("Design");
  return {
    id: d.id, productId: d.productId, colorName: d.colorName, front: toSideJson(d.frontJson), back: toSideJson(d.backJson),
    frontPreviewUrl: designFileUrl(d.frontPreviewKey), backPreviewUrl: designFileUrl(d.backPreviewKey), createdAt: d.createdAt,
  };
}
```

Create `src/server/design-form.ts` (no db; HTTP parsing only):

```ts
import { ValidationError } from "@/server/errors";
import type { CreateDesignInput, DesignSideUpload } from "@/server/services/designs";
import type { DesignSide } from "@/lib/studio/constants";

export async function parseDesignForm(form: FormData): Promise<CreateDesignInput> {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const file = async (k: string) => {
    const v = form.get(k);
    return v instanceof File && v.size > 0 ? new Uint8Array(await v.arrayBuffer()) : null;
  };
  const json = (k: string): unknown => {
    const s = str(k);
    if (!s) return null;
    try {
      return JSON.parse(s) as unknown;
    } catch {
      throw new ValidationError({ [k]: ["Design data is malformed"] });
    }
  };
  async function side(name: DesignSide): Promise<DesignSideUpload | null> {
    const j = json(`${name}Json`);
    const preview = await file(`${name}Preview`);
    const print = await file(`${name}Print`);
    if (j === null && !preview && !print) return null;
    if (j === null || !preview || !print) throw new ValidationError({ [name]: [`The ${name} design is incomplete. Please try again.`] });
    return { json: j, preview, print };
  }
  return {
    productId: str("productId"),
    variantId: str("variantId"),
    quantity: Number.parseInt(str("quantity") || "1", 10),
    rightsConfirmed: str("rightsConfirmed") === "true",
    front: await side("front"),
    back: await side("back"),
  };
}
```

- [ ] **Step 5: Routes**

Create `src/app/api/designs/route.ts`:

```ts
import { clientIp, handle, ok, resolveApiCartRef, withGuestCookie } from "@/server/api";
import { parseDesignForm } from "@/server/design-form";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { createDesignAndAddToCart } from "@/server/services/designs";
import { MAX_DESIGN_UPLOAD_BYTES } from "@/lib/studio/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const rl = rateLimit(`designs:${clientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_DESIGN_UPLOAD_BYTES + 1024 * 1024) throw new ValidationError({ design: ["This design is too large to upload. Try smaller images."] });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ValidationError({ body: ["Expected multipart form data"] });
  }
  const input = await parseDesignForm(form);
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  const result = await createDesignAndAddToCart(ref, input);
  return withGuestCookie(ok(result, { status: 201 }), newGuestToken);
});
```

Create `src/app/api/designs/[id]/route.ts`:

```ts
import { handle, ok, resolveApiCartRef } from "@/server/api";
import { NotFoundError } from "@/server/errors";
import { getDesignForOwner } from "@/server/services/designs";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  if (newGuestToken) throw new NotFoundError("Design"); // a brand-new visitor owns nothing
  return ok(await getDesignForOwner(ref, id));
});
```

Create `src/app/api/designs/assets/route.ts`:

```ts
import { clientIp, handle, ok } from "@/server/api";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { uploadDesignAsset } from "@/server/services/designs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const rl = rateLimit(`design-assets:${clientIp(req)}`, 40, 10 * 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    throw new ValidationError({ file: ["Expected multipart form data"] });
  }
  if (!(file instanceof File) || file.size === 0) throw new ValidationError({ file: ["Choose an image to upload"] });
  return ok(await uploadDesignAsset(file), { status: 201 });
});
```

- [ ] **Step 6: Purge job**

Create `src/server/jobs/purge-designs.ts`:

```ts
import { db } from "@/server/db";
import { getStorage } from "@/server/adapters/storage";

export const DESIGN_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
const BATCH = 200;

export async function runPurgeDesigns(now: Date = new Date()): Promise<{ purged: number; filesDeleted: number }> {
  const cutoff = new Date(now.getTime() - DESIGN_RETENTION_DAYS * DAY_MS);
  const unreferenced = { cartItems: { none: {} }, orderItems: { none: {} } };
  const stale = await db.design.findMany({ where: { createdAt: { lt: cutoff }, ...unreferenced }, orderBy: { createdAt: "asc" }, take: BATCH });
  const storage = getStorage();
  let purged = 0;
  let filesDeleted = 0;
  for (const d of stale) {
    // Conditional delete: a design added to a bag or ordered since the read survives.
    const r = await db.design.deleteMany({ where: { id: d.id, ...unreferenced } });
    if (r.count !== 1) continue;
    purged++;
    const own = [d.frontPreviewKey, d.backPreviewKey, d.frontPrintKey, d.backPrintKey].filter((k): k is string => k !== null);
    const orphanAssets: string[] = [];
    for (const key of d.assetKeys) {
      if ((await db.design.count({ where: { assetKeys: { has: key } } })) === 0) orphanAssets.push(key);
    }
    for (const key of [...own, ...orphanAssets]) {
      try {
        await storage.delete(key);
        filesDeleted++;
      } catch (err) {
        console.error("[purge-designs] could not delete", key, err);
      }
    }
  }
  return { purged, filesDeleted };
}
```

`src/server/jobs/index.ts`: import `runPurgeDesigns` and add `"purge-designs": runPurgeDesigns,` to `JOBS`.

- [ ] **Step 7: Verify and commit**

Run the four new test files and `tests/unit/cart.test.ts`, `tests/unit/cart-ref.test.ts`, `tests/unit/api.test.ts` (GREEN), then the full gate.

```bash
git add src/server/services/cart.ts src/server/cart-cookie.ts src/server/api.ts src/server/services/designs.ts src/server/design-form.ts src/app/api/designs src/server/jobs/purge-designs.ts src/server/jobs/index.ts tests/unit/cart-designs.test.ts tests/unit/designs.test.ts tests/unit/designs-api.test.ts tests/unit/purge-designs.test.ts
git commit -m "feat(studio): add designs service, design API, custom cart lines and purge job

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 4: Custom lines through checkout, orders, emails, invoices, customer order pages and the packing slip

**Files:**
- Modify: `src/server/services/orders.ts`, `src/server/services/order-records.ts`, `src/server/services/checkout.ts`, `src/server/emails/templates.ts`, `src/lib/gst.ts`, `src/components/storefront/checkout/checkout-form.tsx`, `src/app/(storefront)/account/orders/[number]/page.tsx`, `src/components/print/slip-document.tsx`
- Create: `src/components/storefront/custom-print-thumbs.tsx`
- Test: `tests/unit/custom-orders.test.ts`

**Interfaces:**
- Consumes: `customUnitPricePaise`, `designSides`, `printSidesOf`, `isCustomItem`, `customPrintLabel`, `CustomFees`, `customFeesOf` (Task 1), `getCustomFees` (Task 1), `designFileUrl` (Task 3), `addItem(ref, variantId, qty, { designId })` (Task 3), `createDesignRow` (Task 1), Phase 2 `placeOrder`, `markOrderPaid`, `getOrderById`, `getCheckoutView`, `previewCartPricing`, `orderConfirmationEmail`, `siteUrl`, `invoiceFromOrder`, `SlipDocument`, `createAddress`, `createUser`.
- Produces:

```ts
// @/server/services/orders (changed)
export type CheckoutLineRow;                                              // include gains design (print/preview keys)
export function unitPriceOf(l: CheckoutLineRow, fees: CustomFees): number;
export function lineName(l: CheckoutLineRow): string;                      // "Tee (Black / M) · custom print" for custom lines
export function toPricingLines(rows: CheckoutLineRow[], fees: CustomFees): PricingLine[];   // sets custom: true for custom lines
export function reconcileCartStock(rows: CheckoutLineRow[]): Promise<{ rows: CheckoutLineRow[]; issues: StockIssue[] }>;   // stock shared across lines of a variant
// placeOrder snapshots designId, designFrontPreviewUrl, designBackPreviewUrl, printFrontUrl, printBackUrl; imageUrl = front (else back) preview
// afterPaid removes exactly the ordered lines: plain lines by variant, custom lines by design
// @/server/services/order-records (changed)
export interface OrderItemView { /* Phase 2 fields */ designId: string | null; designFrontPreviewUrl: string | null; designBackPreviewUrl: string | null; printFrontUrl: string | null; printBackUrl: string | null; printedAt: Date | null; heldAt: Date | null; holdNote: string | null }
// @/server/services/checkout (changed)
export interface CheckoutLineView { /* Phase 2 fields */ designId: string | null; customLabel: string | null }
// @/server/emails/templates (added)
export function absoluteUrl(url: string): string;                         // "/x" → siteUrl() + "/x"; absolute URLs unchanged
// components
export function CustomPrintThumbs(props: { front: string | null; back: string | null; size?: number; className?: string }): JSX.Element | null;   // "Front"/"Back" captioned previews
```

Rules (spec §2, §4): the customer pays for the blank plus print fees; custom lines consume the blank's stock like any line; offers skip them unless `includeCustom`. Order items keep URL snapshots so an order stays printable even if its design row is later removed with its product. Paying for an order must not remove a *different* custom line the customer added after placing it.

- [ ] **Step 1: Failing tests**

Create `tests/unit/custom-orders.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createDesignRow, createProduct, createUser } from "../helpers/fixtures";
import { addItem } from "@/server/services/cart";
import { createAddress } from "@/server/services/addresses";
import { getOrderById } from "@/server/services/order-records";
import { markOrderPaid, placeOrder } from "@/server/services/orders";
import { getCheckoutView } from "@/server/services/checkout";
import { getSettings } from "@/server/services/settings";
import { StockChangedError } from "@/server/errors";
import { absoluteUrl, orderConfirmationEmail, siteUrl } from "@/server/emails/templates";
import { invoiceFromOrder } from "@/lib/gst";

const ADDRESS = { fullName: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };

async function setup(stock = 5) {
  await getSettings();
  await db.storeSetting.update({ where: { id: 1 }, data: { customFrontFeePaise: 0, customBackFeePaise: 14900 } });
  const user = await createUser();
  const product = await createProduct({ slug: "blank-tee", basePricePaise: 54900, isCustomizable: true, variants: [{ size: "M", colorName: "Black", stock }] });
  const variant = product.variants[0];
  const address = await createAddress(user.id, ADDRESS);
  const design = await createDesignRow({ productId: product.id, userId: user.id, backPrintKey: "designs/print/b.png", backPreviewKey: "designs/previews/b.png" });
  return { user, product, variant, address, design };
}

describe("custom lines in checkout and orders", () => {
  beforeEach(resetDb);

  it("snapshots price with fees, previews and print files", async () => {
    const { user, variant, address, design } = await setup();
    await addItem({ userId: user.id }, variant.id, 1);
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    const view = await getCheckoutView(user.id);
    expect(view.lines.map((l) => [l.unitPricePaise, l.customLabel])).toEqual([[54900, null], [69800, "Custom print: front + back"]]);
    const pay = await placeOrder(user.id, { addressId: address.id });
    const order = await getOrderById(pay.orderId);
    expect(order.subtotalPaise).toBe(124700);
    expect(order.items.find((i) => i.designId === design.id)).toMatchObject({
      unitPricePaise: 69800,
      imageUrl: "/api/uploads/designs/previews/f.png",
      designFrontPreviewUrl: "/api/uploads/designs/previews/f.png",
      designBackPreviewUrl: "/api/uploads/designs/previews/b.png",
      printFrontUrl: "/api/uploads/designs/print/f.png",
      printBackUrl: "/api/uploads/designs/print/b.png",
      printedAt: null,
      heldAt: null,
    });
    expect(order.items.find((i) => i.designId === null)).toMatchObject({ unitPricePaise: 54900, printFrontUrl: null, printBackUrl: null });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(3);
  });

  it("leaves custom lines out of offers unless the offer includes them", async () => {
    const { user, variant, design } = await setup();
    await db.offer.create({ data: { label: "Any 2 for ₹999", type: "BUNDLE_PRICE", minQty: 2, pricePaise: 99900 } });
    await addItem({ userId: user.id }, variant.id, 1);
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    expect((await getCheckoutView(user.id)).price).toMatchObject({ offer: null, discountPaise: 0, subtotalPaise: 124700 });
    await db.offer.updateMany({ data: { includeCustom: true } });
    expect((await getCheckoutView(user.id)).price).toMatchObject({ applied: "offer", discountPaise: 124700 - 99900 });
  });

  it("clears only the ordered lines when the order is paid", async () => {
    const { user, product, variant, address, design } = await setup();
    await addItem({ userId: user.id }, variant.id, 1);
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    const pay = await placeOrder(user.id, { addressId: address.id });
    const later = await createDesignRow({ productId: product.id, userId: user.id });
    await addItem({ userId: user.id }, variant.id, 1, { designId: later.id });
    await markOrderPaid(pay.orderId, "pay_custom_1", "mock");
    const left = await db.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(left.map((i) => i.designId)).toEqual([later.id]);
  });

  it("reconciles stock across plain and custom lines of one variant", async () => {
    const { user, variant, address, design } = await setup(2);
    await addItem({ userId: user.id }, variant.id, 1);
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: 1 } });
    await expect(placeOrder(user.id, { addressId: address.id })).rejects.toBeInstanceOf(StockChangedError);
    const left = await db.cartItem.findMany({ where: { cart: { userId: user.id } } });
    expect(left.map((i) => [i.designId, i.quantity])).toEqual([[null, 1]]);
  });

  it("shows the design in the confirmation email and marks it on the invoice", async () => {
    const { user, variant, address, design } = await setup();
    await addItem({ userId: user.id }, variant.id, 1, { designId: design.id });
    const order = await getOrderById((await placeOrder(user.id, { addressId: address.id })).orderId);
    const mail = orderConfirmationEmail(order);
    expect(mail.html).toContain(`src="${siteUrl()}/api/uploads/designs/previews/f.png"`);
    expect(mail.html).toContain("Custom print: front + back");
    expect(mail.text).toContain("Custom print: front + back");
    expect(absoluteUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    const invoice = invoiceFromOrder(order, await getSettings());
    expect(invoice.lines[0].description).toContain("custom print");
  });
});
```

Run: `npm test -- tests/unit/custom-orders.test.ts`
Expected: FAIL (`customLabel`, design snapshot fields, `absoluteUrl` missing; offers count custom lines; payment clears the later design line; reconcile ignores shared stock).

- [ ] **Step 2: Order service**

In `src/server/services/orders.ts`:

```ts
import { customPrintLabel, customUnitPricePaise, designSides, type CustomFees } from "@/lib/custom-pricing";
import { designFileUrl } from "@/server/services/designs";
import { getCustomFees } from "@/server/services/settings";

const checkoutLineInclude = {
  design: { select: { id: true, frontPreviewKey: true, backPreviewKey: true, frontPrintKey: true, backPrintKey: true } },
  variant: {
    include: {
      product: { include: { images: { orderBy: { sortOrder: "asc" as const } }, collections: { select: { collectionId: true } } } },
    },
  },
} satisfies Prisma.CartItemInclude;

export function unitPriceOf(l: CheckoutLineRow, fees: CustomFees): number {
  return customUnitPricePaise(l.variant.pricePaise ?? l.variant.product.basePricePaise, l.design ? designSides(l.design) : null, fees);
}

export function lineName(l: CheckoutLineRow): string {
  return `${l.variant.product.name} (${l.variant.colorName} / ${l.variant.size})${l.design ? " · custom print" : ""}`;
}

export function toPricingLines(rows: CheckoutLineRow[], fees: CustomFees): PricingLine[] {
  return rows.map((l) => ({
    unitPricePaise: unitPriceOf(l, fees),
    quantity: l.quantity,
    collectionIds: l.variant.product.collections.map((c) => c.collectionId),
    custom: l.designId !== null,
  }));
}

export async function reconcileCartStock(rows: CheckoutLineRow[]): Promise<{ rows: CheckoutLineRow[]; issues: StockIssue[] }> {
  const kept: CheckoutLineRow[] = [];
  const issues: StockIssue[] = [];
  const remaining = new Map<string, number>(); // variantId → units still free for later lines in this bag
  for (const l of rows) {
    const stock = l.variant.product.status === "ACTIVE" ? Math.max(0, l.variant.stock) : 0;
    const available = remaining.get(l.variantId) ?? stock;
    if (l.quantity <= available) {
      kept.push(l);
      remaining.set(l.variantId, available - l.quantity);
      continue;
    }
    issues.push({ variantId: l.variantId, name: lineName(l), requested: l.quantity, available });
    remaining.set(l.variantId, 0);
    if (available === 0) {
      await db.cartItem.delete({ where: { id: l.id } });
    } else {
      await db.cartItem.update({ where: { id: l.id }, data: { quantity: available } });
      kept.push({ ...l, quantity: available });
    }
  }
  return { rows: kept, issues };
}

function snapshot(l: CheckoutLineRow, fees: CustomFees) {
  const p = l.variant.product;
  const unit = unitPriceOf(l, fees);
  const image = p.images.find((i) => i.colorName === l.variant.colorName) ?? p.images[0];
  const d = l.design;
  const designFrontPreviewUrl = designFileUrl(d?.frontPreviewKey ?? null);
  const designBackPreviewUrl = designFileUrl(d?.backPreviewKey ?? null);
  return {
    productId: p.id, variantId: l.variantId, productName: p.name, productSlug: p.slug, size: l.variant.size,
    colorName: l.variant.colorName, imageUrl: designFrontPreviewUrl ?? designBackPreviewUrl ?? image?.url ?? null, sku: l.variant.sku,
    unitPricePaise: unit, quantity: l.quantity, lineTotalPaise: unit * l.quantity,
    designId: d?.id ?? null, designFrontPreviewUrl, designBackPreviewUrl,
    printFrontUrl: designFileUrl(d?.frontPrintKey ?? null), printBackUrl: designFileUrl(d?.backPrintKey ?? null),
  };
}
```

In `placeOrder`: after `reconcileCartStock`, `const fees = await getCustomFees();`, call `quote({ lines: toPricingLines(rows, fees), … })` and create items with `rows.map((l) => snapshot(l, fees))`. The per-line conditional decrement inside the transaction stays as is (two lines of one variant decrement sequentially, so the second fails correctly when stock runs out).

Replace `afterPaid` so it removes exactly what was ordered:

```ts
async function afterPaid(orderId: string, userId: string, items: { variantId: string | null; designId: string | null }[]): Promise<void> {
  const plainVariantIds = items.filter((i) => i.designId === null && i.variantId !== null).map((i) => i.variantId as string);
  const designIds = items.map((i) => i.designId).filter((d): d is string => d !== null);
  try {
    await db.cartItem.deleteMany({
      where: { cart: { userId }, OR: [{ designId: null, variantId: { in: plainVariantIds } }, { designId: { in: designIds } }] },
    });
    await db.cart.updateMany({ where: { userId }, data: { remindedAt: null } });
  } catch (err) {
    console.error("[orders] cart cleanup failed", orderId, err);
  }
  await notifyOrder(orderId, "paid");
}
```

(Keep the notification call exactly as Phase 2 Task 6 wired it; `markOrderPaid` already passes `order.items`, which now carry `designId`.)

`customPrintLabel` is imported for Step 3; remove it from this file's imports if unused here.

- [ ] **Step 3: Order views, checkout view, emails, invoice**

`src/server/services/order-records.ts`: `OrderItemView` gains `designId`, `designFrontPreviewUrl`, `designBackPreviewUrl`, `printFrontUrl`, `printBackUrl`, `printedAt`, `heldAt`, `holdNote`; `toOrderView` copies them from the row (`i.designId`, …).

`src/server/services/checkout.ts`:
- `CheckoutLineView` gains `designId: string | null; customLabel: string | null`.
- `toLineView(l, fees)`: unit via `unitPriceOf(l, fees)`; `imageUrl` = `designFileUrl(l.design?.frontPreviewKey ?? l.design?.backPreviewKey ?? null) ?? colour image`; `designId: l.designId`; `customLabel: l.design ? customPrintLabel(designSides(l.design)) : null`.
- `getCheckoutView`: `const fees = customFeesOf(settings);` (settings is already loaded) and pass it to `toPricingLines(rows, fees)` and `toLineView(l, fees)`.
- `quoteForUser`: `toPricingLines(await loadCheckoutLines(userId), await getCustomFees())`.
- `previewCartPricing(ref)`: include `design: { select: { frontPrintKey: true, backPrintKey: true } }` on the items query; after loading settings compute `const fees = customFeesOf(settings)`; each line is `{ unitPricePaise: customUnitPricePaise(variantPrice, i.design ? designSides(i.design) : null, fees), quantity, collectionIds, custom: i.designId !== null }`.

`src/server/emails/templates.ts`:

```ts
export function absoluteUrl(url: string): string {
  return url.startsWith("/") ? `${siteUrl()}${url}` : url;
}
```

In `itemsHtml`, build each row's first cell as below (plain rows keep today's markup); in `itemsText` append ` [${label}]` for custom rows. Import `customPrintLabel`, `printSidesOf` from `@/lib/custom-pricing`.

```ts
    .map((i) => {
      const label = customPrintLabel(printSidesOf(i));
      const thumb = label && i.imageUrl ? `<img src="${e(absoluteUrl(i.imageUrl))}" width="64" height="80" alt="" style="float:left;margin:0 12px 0 0;border-radius:4px">` : "";
      const tag = label ? `<br><span style="color:#b45309;font-size:12px">${e(label)}</span>` : "";
      return `<tr><td style="padding:6px 0">${thumb}${e(i.productName)}<br><span style="color:#666;font-size:12px">${e(i.colorName)} / ${e(i.size)} × ${i.quantity}</span>${tag}</td><td style="padding:6px 0;text-align:right;vertical-align:top">${e(formatPaise(i.lineTotalPaise))}</td></tr>`;
    })
```

`src/lib/gst.ts` `invoiceFromOrder`: the description becomes `` `${i.productName} (${i.colorName} / ${i.size})${isCustomItem(i) ? " · custom print" : ""} · ${i.sku}` `` (import `isCustomItem`).

- [ ] **Step 4: Customer-facing views and the packing slip**

Create `src/components/storefront/custom-print-thumbs.tsx` (server-safe, no hooks):

```tsx
/* eslint-disable @next/next/no-img-element -- previews come from our storage at a fixed 800 × 1000 size; used in emails-like print and order views */
import { cn } from "@/lib/utils";

export function CustomPrintThumbs({ front, back, size = 64, className }: { front: string | null; back: string | null; size?: number; className?: string }) {
  const shots = [["Front", front], ["Back", back]].filter((s): s is [string, string] => s[1] !== null);
  if (shots.length === 0) return null;
  return (
    <div className={cn("flex gap-2", className)} data-testid="custom-print-thumbs">
      {shots.map(([label, url]) => (
        <figure key={label} className="text-center">
          <img src={url} alt={`${label} of your custom tee`} width={size} height={Math.round(size * 1.25)} className="rounded-sm border border-border bg-surface object-cover" loading="lazy" />
          <figcaption className="mt-0.5 text-[10px] uppercase tracking-wide text-text-muted">{label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
```

`src/components/storefront/checkout/checkout-form.tsx`: in the order summary line list, under the name/"colour / size" text, render `{line.customLabel && <span className="text-xs font-medium text-brand" data-testid="checkout-custom-badge">{line.customLabel}</span>}` (the thumbnail already shows the preview because `imageUrl` is the preview).

`src/app/(storefront)/account/orders/[number]/page.tsx`: in the items list, for items where `isCustomItem(item)`: show a `Badge variant="outline"` "Custom" next to the name, the `customPrintLabel(printSidesOf(item))` text under "colour / size", and `<CustomPrintThumbs front={item.designFrontPreviewUrl} back={item.designBackPreviewUrl} />` below. Custom items link to `/products/{productSlug}` like plain ones (the design itself is not editable after ordering).

`src/components/print/slip-document.tsx`: in the checklist row, when `isCustomItem(item)` add a bold line **`{customPrintLabel(printSidesOf(item))}`** (renders "Custom print: front", "…: back" or "…: front + back") under colour / size, and use `item.designFrontPreviewUrl ?? item.imageUrl` for the 40 px thumbnail.

- [ ] **Step 5: Verify and commit**

Run `tests/unit/custom-orders.test.ts` and the Phase 2 `orders`, `checkout`, `email-templates`, `gst`, `jobs` test files (GREEN), then the full gate. Manual check on port 3001 is deferred to Task 6 (the studio creates the first real designs).

```bash
git add src/server/services/orders.ts src/server/services/order-records.ts src/server/services/checkout.ts src/server/emails/templates.ts src/lib/gst.ts src/components/storefront/custom-print-thumbs.tsx src/components/storefront/checkout/checkout-form.tsx "src/app/(storefront)/account/orders/[number]/page.tsx" src/components/print/slip-document.tsx tests/unit/custom-orders.test.ts
git commit -m "feat(studio): carry custom designs through checkout, orders, emails and slips

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 5: Studio shell — landing grid, studio route, SVG mockup, product panel, mobile bottom sheet, "Customize this"

**Files:**
- Replace: `src/app/(storefront)/customize/page.tsx`
- Create: `src/app/(storefront)/customize/[slug]/page.tsx`, `src/app/(storefront)/customize/[slug]/loading.tsx`, `src/components/studio/shirt-svg.tsx`, `src/components/studio/studio-loader.tsx`, `src/components/studio/studio.tsx`, `src/components/studio/studio-panel.tsx`, `src/components/studio/product-panel.tsx`, `src/components/studio/price-summary.tsx`, `src/components/studio/side-toggle.tsx`, `src/components/studio/fonts.ts`
- Modify: `src/components/storefront/product-purchase.tsx`

**Interfaces:**
- Consumes: `listStudioProducts`, `getStudioProduct`, `getDesignForOwner`, `StudioProduct`, `StudioProductCard`, `DesignView` (Task 3), `resolveCartRef`, `NotFoundError`, `shirtSvgMarkup`, `safeHex`, studio constants, `SideJson`, `EMPTY_SIDE`, `toSideJson` (Task 2), `customUnitPricePaise`, `customFeePaise`, `CustomFees` (Task 1), `colorsOf`, `sizesFor`, `defaultColor`, `VariantLike` (Phase 1), `formatPaise`, `NotifyMe`, `Reveal`, `displayFont`, `Tabs` primitives, `Button`.
- Produces:

```ts
// src/components/studio/fonts.ts (client-safe module, next/font declarations)
export const STUDIO_FONT_FAMILIES: Record<StudioFontId, string>;          // next/font style.fontFamily strings
export const STUDIO_FONT_CLASSNAMES: string;                               // className list that makes the fonts load on the studio page
// components
export function ShirtSvg(props: { hex: string; side: DesignSide; guide?: boolean; className?: string }): JSX.Element;
export interface StudioInitialDesign { designId: string; colorName: string; front: SideJson; back: SideJson }
export interface StudioProps { product: StudioProduct; initialColor: string | null; initialDesign: StudioInitialDesign | null }
export function StudioLoader(props: StudioProps): JSX.Element;            // next/dynamic(ssr: false) wrapper with a skeleton
export function Studio(props: StudioProps): JSX.Element;                  // data-testid="studio-page", data-ready, data-object-count
export type StudioTab = "product" | "upload" | "text" | "layers";
export function StudioPanel(props: { tab: StudioTab; onTab(t: StudioTab): void; expanded: boolean; onExpanded(v: boolean): void; tabs: { id: StudioTab; label: string; content: React.ReactNode }[]; footer: React.ReactNode }): JSX.Element;
export function ProductPanel(props: { product: StudioProduct; color: string | null; size: string | null; onColor(name: string): void; onSize(size: string): void; sizeError: boolean }): JSX.Element;
export function PriceSummary(props: { basePricePaise: number; fees: CustomFees; sides: DesignSides; className?: string }): JSX.Element;   // data-testid="studio-price"
export function SideToggle(props: { side: DesignSide; onSide(s: DesignSide): void; counts: Record<DesignSide, number> }): JSX.Element;
// pages: /customize (landing grid, data-testid="customize-page"), /customize/[slug]?color=&design=
```

UI rules (spec §4): desktop (≥ 768 px, `md:`) is two columns — canvas stage left, tool panel right (`md:grid-cols-[minmax(0,1fr)_380px]`). Mobile is the canvas full width with the tool panel as a **non-modal bottom sheet**: a fixed bar with the tab row and the sticky price/"Add to cart" footer; tapping a tab expands the sheet to at most `50dvh` (content scrolls inside), a chevron button collapses it. The same DOM serves both layouts (no duplicated test ids): the panel is `fixed inset-x-0 bottom-0 z-30 … md:static md:z-auto`. Every control is ≥ 44 px. The page reserves bottom padding on mobile (`pb-40 md:pb-10`) so the collapsed sheet never covers the shirt.

- [ ] **Step 1: Fonts and the mockup component**

Create `src/components/studio/fonts.ts`:

```ts
import { Anton, Inter, Permanent_Marker } from "next/font/google";
import { displayFont } from "@/app/fonts";
import type { StudioFontId } from "@/lib/studio/constants";

const anton = Anton({ weight: "400", subsets: ["latin"], display: "swap" });
const inter = Inter({ weight: ["400", "700"], style: ["normal", "italic"], subsets: ["latin"], display: "swap" });
const marker = Permanent_Marker({ weight: "400", subsets: ["latin"], display: "swap" });

/** Build-specific family strings; canvas text stores the stable StudioFontId and is remapped on load (withFontFamilies). */
export const STUDIO_FONT_FAMILIES: Record<StudioFontId, string> = {
  anton: anton.style.fontFamily,
  bebas: displayFont.style.fontFamily,
  inter: inter.style.fontFamily,
  marker: marker.style.fontFamily,
};

export const STUDIO_FONT_CLASSNAMES = [anton.className, inter.className, marker.className].join(" ");
```

(Import this module only from `src/components/studio/*`; `next/font` calls must stay at module top level.)

Create `src/components/studio/shirt-svg.tsx`:

```tsx
import { shirtSvgMarkup } from "@/lib/studio/shirt";
import type { DesignSide } from "@/lib/studio/constants";
import { cn } from "@/lib/utils";

/** Pure SVG tee filled with the variant hex. shirtSvgMarkup only interpolates numbers and a validated hex. */
export function ShirtSvg({ hex, side, guide = true, className }: { hex: string; side: DesignSide; guide?: boolean; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${side === "front" ? "Front" : "Back"} of the tee`}
      className={cn("[&>svg]:h-full [&>svg]:w-full", className)}
      dangerouslySetInnerHTML={{ __html: shirtSvgMarkup(hex, side, { guide }) }}
      data-testid="shirt-svg"
    />
  );
}
```

- [ ] **Step 2: Landing page**

Replace `src/app/(storefront)/customize/page.tsx` (server): keep `metadata`, the `STEPS` list and the `Reveal` motion; `data-testid="customize-page"` on the root.
- `const products = await listStudioProducts();`
- Hero: eyebrow "Made to order", `h1` "Design your own", one line of copy ("Upload artwork or type a line, place it on the front or back, and we print it for you.").
- Grid `grid grid-cols-2 gap-4 md:grid-cols-3` of cards, each a `Link` to `/customize/{slug}` with `data-testid="studio-product-card"`, `min-h-11`: 4:5 image (`next/image`, `fill`, `sizes="(min-width: 768px) 33vw, 50vw"`), name, "from {formatPaise(pricePaise)}", and up to 6 colour dots (`size-4 rounded-full border`, `title={name}`, `aria-hidden`) plus `sr-only` "{n} colours".
- Empty state when `products.length === 0`: "The design studio is getting ready", "Leave your email and we will tell you when it opens." with `<NotifyMe />` and a secondary `Button` link "Shop blank tees" → `/collections/plain-tees` (`h-11`).
- The `STEPS` list stays below the grid.

- [ ] **Step 3: Studio route**

Create `src/app/(storefront)/customize/[slug]/page.tsx` (server):

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioLoader } from "@/components/studio/studio-loader";
import { resolveCartRef } from "@/server/cart-ref";
import { NotFoundError } from "@/server/errors";
import { getDesignForOwner, getStudioProduct, type StudioProduct } from "@/server/services/designs";
import { EMPTY_SIDE } from "@/lib/studio/canvas-json";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ color?: string; design?: string }> };

async function load(slug: string): Promise<StudioProduct> {
  try {
    return await getStudioProduct(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await load((await params).slug);
  return { title: `Design your ${product.name}`, robots: { index: false, follow: true } };
}

export default async function StudioPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const product = await load(slug);
  let initialDesign = null;
  if (sp.design) {
    const ref = await resolveCartRef({ create: false });
    const d = ref ? await getDesignForOwner(ref, sp.design).catch((err) => (err instanceof NotFoundError ? null : Promise.reject(err))) : null;
    if (d && d.productId === product.id) {
      initialDesign = { designId: d.id, colorName: d.colorName, front: d.front ?? EMPTY_SIDE, back: d.back ?? EMPTY_SIDE };
    }
  }
  const initialColor = initialDesign?.colorName ?? (product.variants.some((v) => v.colorName === sp.color) ? sp.color! : null);
  return (
    <div className="container-x py-4 pb-40 md:py-8 md:pb-10">
      <StudioLoader product={product} initialColor={initialColor} initialDesign={initialDesign} />
    </div>
  );
}
```

Create `src/app/(storefront)/customize/[slug]/loading.tsx`: a `Skeleton` 4:5 block plus a panel skeleton in the same two-column grid.

Create `src/components/studio/studio-loader.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudioProps } from "./studio";

// The studio (and Fabric, loaded inside it) never renders on the server.
const Studio = dynamic(() => import("./studio").then((m) => m.Studio), {
  ssr: false,
  loading: () => (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true" aria-label="Loading the design studio">
      <Skeleton className="aspect-[4/5] w-full" />
      <Skeleton className="hidden h-[480px] md:block" />
    </div>
  ),
});

export function StudioLoader(props: StudioProps) {
  return <Studio {...props} />;
}
```

- [ ] **Step 4: Studio shell components**

Create `src/components/studio/side-toggle.tsx` (client): a two-button segmented control (`role="group"`, `aria-label="Side"`), buttons `min-h-11 min-w-24` with `aria-pressed`, `data-testid="studio-side-front"` / `"studio-side-back"`, label "Front" / "Back" plus a small count badge when `counts[side] > 0` (`sr-only` " (n layers)").

Create `src/components/studio/price-summary.tsx` (server-safe):

```tsx
import { customUnitPricePaise, type CustomFees, type DesignSides } from "@/lib/custom-pricing";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

const fee = (paise: number) => (paise === 0 ? "free" : formatPaise(paise));

export function PriceSummary({ basePricePaise, fees, sides, className }: { basePricePaise: number; fees: CustomFees; sides: DesignSides; className?: string }) {
  const parts = [`Tee ${formatPaise(basePricePaise)}`];
  if (sides.front) parts.push(`front print ${fee(fees.frontPaise)}`);
  if (sides.back) parts.push(`back print ${fee(fees.backPaise)}`);
  return (
    <div className={cn("min-w-0 text-sm", className)}>
      <p className="font-display text-2xl" data-testid="studio-price" aria-live="polite">{formatPaise(customUnitPricePaise(basePricePaise, sides, fees))}</p>
      <p className="truncate text-xs text-text-muted">{sides.front || sides.back ? parts.join(" + ") : "Add a design to the front or back"}</p>
    </div>
  );
}
```

Create `src/components/studio/product-panel.tsx` (client), `data-testid="product-panel"`:
- Product name (`h2`), fit/fabric line.
- **Colour**: `role="radiogroup" aria-label="Colour"`, one button per `colorsOf(product.variants)`: `size-11 rounded-full border-2` (brand border when selected), `role="radio"`, `aria-checked`, `aria-label={name}`, `style={{ backgroundColor: hex }}`, `data-testid="studio-color"`; the chosen name printed next to the legend.
- **Size**: `role="radiogroup" aria-label="Size"`, chips from `sizesFor(product.variants, color)`: `min-h-11 min-w-12 rounded-full border px-4`, `disabled` when `stock === 0`, `data-testid="studio-size"`, "{n} left" under chips with `0 < stock < 5`; `sizeError` turns the legend `text-danger` with "Pick a size to continue".
- Stock line: "In stock" / "Only n left" / "Sold out in this colour" for the chosen size or colour.
- A note: "Print area 12 × 16 in on each side. Printed in-house, ships in 3–5 days."

Create `src/components/studio/studio-panel.tsx` (client) — the desktop column / mobile sheet:

```tsx
"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type StudioTab = "product" | "upload" | "text" | "layers";

export function StudioPanel({ tab, onTab, expanded, onExpanded, tabs, footer }: {
  tab: StudioTab; onTab: (t: StudioTab) => void; expanded: boolean; onExpanded: (v: boolean) => void;
  tabs: { id: StudioTab; label: string; content: React.ReactNode }[]; footer: React.ReactNode;
}) {
  return (
    <aside
      data-testid="studio-sheet"
      aria-label="Design tools"
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[85dvh] flex-col rounded-t-xl border-t border-border bg-bg shadow-[0_-8px_24px_rgba(0,0,0,0.12)] md:static md:z-auto md:max-h-none md:rounded-md md:border md:shadow-none"
    >
      <div className="flex items-center gap-1 border-b border-border px-2" role="tablist" aria-label="Tools">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`studio-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="studio-tabpanel"
            data-testid={`studio-tab-${t.id}`}
            onClick={() => { onTab(t.id); onExpanded(true); }}
            className={cn("min-h-12 flex-1 rounded-md px-2 text-sm", tab === t.id ? "font-medium text-text" : "text-text-muted")}
          >
            {t.label}
          </button>
        ))}
        <button type="button" onClick={() => onExpanded(!expanded)} aria-expanded={expanded} aria-controls="studio-tabpanel" className="flex size-11 items-center justify-center md:hidden" aria-label={expanded ? "Hide tools" : "Show tools"}>
          {expanded ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
        </button>
      </div>
      <div id="studio-tabpanel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`} className={cn("overflow-y-auto overscroll-contain p-4", expanded ? "max-h-[50dvh]" : "hidden", "md:block md:max-h-none")}>
        {tabs.find((t) => t.id === tab)?.content}
      </div>
      <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4">{footer}</div>
    </aside>
  );
}
```

Create `src/components/studio/studio.tsx` (client) — the shell. In this task it owns colour, size, side and tab state and renders the mockup; Task 6 adds the canvas, the three editing tabs, counts and the working "Add to cart".

```tsx
"use client";

import { useMemo, useState } from "react";
import { colorsOf, defaultColor, sizesFor } from "@/lib/variant-matrix";
import type { DesignSide } from "@/lib/studio/constants";
import type { SideJson } from "@/lib/studio/canvas-json";
import type { StudioProduct } from "@/server/services/designs";
import { STUDIO_FONT_CLASSNAMES } from "./fonts";
import { PriceSummary } from "./price-summary";
import { ProductPanel } from "./product-panel";
import { ShirtSvg } from "./shirt-svg";
import { SideToggle } from "./side-toggle";
import { StudioPanel, type StudioTab } from "./studio-panel";

export interface StudioInitialDesign { designId: string; colorName: string; front: SideJson; back: SideJson }
export interface StudioProps { product: StudioProduct; initialColor: string | null; initialDesign: StudioInitialDesign | null }

export function Studio({ product, initialColor, initialDesign }: StudioProps) {
  const [color, setColor] = useState<string | null>(initialColor ?? defaultColor(product.variants));
  const [size, setSize] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState(false);
  const [side, setSide] = useState<DesignSide>("front");
  const [tab, setTab] = useState<StudioTab>("product");
  const [expanded, setExpanded] = useState(false);
  const hex = colorsOf(product.variants).find((c) => c.name === color)?.hex ?? "#f5f5f5";
  const chosen = useMemo(() => (color ? sizesFor(product.variants, color).find((s) => s.size === size) ?? null : null), [product.variants, color, size]);
  const counts = { front: initialDesign?.front.objects.length ?? 0, back: initialDesign?.back.objects.length ?? 0 }; // replaced by live counts in Task 6
  const sides = { front: counts.front > 0, back: counts.back > 0 };

  return (
    <div data-testid="studio-page" data-ready="false" data-object-count={counts[side]} className={`grid gap-6 md:grid-cols-[minmax(0,1fr)_380px] ${STUDIO_FONT_CLASSNAMES}`}>
      <section aria-label="Design preview" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl md:text-3xl">{product.name}</h1>
          <SideToggle side={side} onSide={setSide} counts={counts} />
        </div>
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[640px] touch-none select-none overflow-hidden rounded-md bg-surface" data-testid="studio-stage">
          <ShirtSvg hex={hex} side={side} className="absolute inset-0" />
          {/* Task 6 mounts the Fabric canvas here, absolutely positioned over the SVG. */}
        </div>
      </section>
      <StudioPanel
        tab={tab}
        onTab={setTab}
        expanded={expanded}
        onExpanded={setExpanded}
        tabs={[{ id: "product", label: "Product", content: <ProductPanel product={product} color={color} size={size} sizeError={sizeError} onColor={(c) => { setColor(c); setSize(null); }} onSize={(s) => { setSize(s); setSizeError(false); }} /> }]}
        footer={
          <div className="flex items-center justify-between gap-3">
            <PriceSummary basePricePaise={chosen?.pricePaise ?? product.basePricePaise} fees={product.fees} sides={sides} />
            <button type="button" disabled className="h-11 rounded-md bg-brand px-4 font-display text-lg text-brand-ink opacity-50" data-testid="studio-add-to-cart">Add to cart</button>
          </div>
        }
      />
    </div>
  );
}
```
- [ ] **Step 5: "Customize this" on product pages**

`src/components/storefront/product-purchase.tsx`: when `product.isCustomizable`, render under the Add-to-bag row:

```tsx
{product.isCustomizable && (
  <Button render={<Link href={`/customize/${product.slug}${color ? `?color=${encodeURIComponent(color)}` : ""}`} />} nativeButton={false} variant="secondary" className="h-11 w-full font-display text-lg tracking-wide" data-testid="customize-this">
    Customize this
  </Button>
)}
```

(`Link` from `next/link`.)

- [ ] **Step 6: Verify and commit**

Full gate. Manual check on port 3001 (seeded DB): `/customize` shows the two blank tees; at 360 px the grid has two columns and no sideways scroll; a card opens `/customize/blank-oversized-tee`; colour swatches repaint the SVG shirt (black, white, beige, navy, lime) with a visible dashed print area; size chips disable sold-out sizes; the bottom sheet expands on a tab tap and collapses with the chevron; the price reads the blank price. A product page for a blank tee shows **Customize this** linking with `?color=`. Stop the server.

```bash
git add "src/app/(storefront)/customize" src/components/studio src/components/storefront/product-purchase.tsx
git commit -m "feat(studio): add customize landing, studio shell, SVG mockup and product panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 6: Fabric canvas editor — upload, text, transforms, layers, undo/redo, print-area clip, DPI warnings, export, add to cart, edit flow, custom cart lines

**Files:**
- Modify: `package.json`, `package-lock.json` (fabric), `src/components/studio/studio.tsx`, `src/components/storefront/cart-line.tsx`
- Create: `src/components/studio/fabric-types.ts`, `src/components/studio/use-studio-canvas.ts`, `src/components/studio/use-pinch.ts`, `src/components/studio/export-design.ts`, `src/components/studio/upload-panel.tsx`, `src/components/studio/text-panel.tsx`, `src/components/studio/layers-panel.tsx`, `src/components/studio/object-toolbar.tsx`, `src/components/studio/dpi-chip.tsx`, `src/components/studio/add-to-cart-bar.tsx`

**Interfaces:**
- Consumes: Task 5 shell (`Studio`, `StudioPanel`, `ProductPanel`, `PriceSummary`, `SideToggle`, `ShirtSvg`, `STUDIO_FONT_FAMILIES`, `StudioInitialDesign`), studio constants, `createHistory`, `pushHistory`, `undoHistory`, `redoHistory`, `canUndo`, `canRedo`, `SideJson`, `EMPTY_SIDE`, `toSideJson`, `fontIdsIn`, `withFontFamilies`, `objectDpi`, `dpiLevel`, `dpiMessage`, `pinchTransform`, `clampScale`, `shirtSvgMarkup`, `isDarkHex` (Task 2), `designAssetFileError`, `MAX_DESIGN_ASSET_BYTES` (Task 2), `POST /api/designs/assets`, `POST /api/designs` (Task 3), `CartLine.design` (Task 3), `useCartUI`, `sonner` toast.
- Produces:

```ts
// src/components/studio/fabric-types.ts
export type FabricModule = typeof import("fabric");
export interface StudioObjectData { kind: "text" | "image"; fontId?: StudioFontId }
export function loadFabric(): Promise<FabricModule>;                              // memoised dynamic import
// src/components/studio/use-studio-canvas.ts
export interface LayerInfo { index: number; kind: "text" | "image"; label: string; dpi: number | null; selected: boolean }
export interface SelectedText { text: string; fill: string; fontSize: number; fontId: StudioFontId; bold: boolean; italic: boolean; align: "left" | "center" | "right"; charSpacing: number }
export interface StudioCanvasApi {
  hostRef: React.RefObject<HTMLDivElement | null>; canvasElRef: React.RefObject<HTMLCanvasElement | null>;
  ready: boolean; side: DesignSide; setSide(s: DesignSide): Promise<void>; counts: Record<DesignSide, number>;
  layers: LayerInfo[]; selectedKind: "text" | "image" | null; selectedText: SelectedText | null; selectedDpi: number | null;
  canUndo: boolean; canRedo: boolean; undo(): Promise<void>; redo(): Promise<void>;
  addText(text: string, fontId: StudioFontId): Promise<void>; updateText(patch: Partial<SelectedText>): Promise<void>;
  addImage(url: string): Promise<void>;
  selectLayer(index: number): void; removeSelected(): void; duplicateSelected(): Promise<void>;
  forward(): void; backward(): void; centerSelected(): void;
  sideJson(s: DesignSide): SideJson;                                               // current committed state per side
}
export function useStudioCanvas(opts: { families: Record<StudioFontId, string>; initial: Record<DesignSide, SideJson>; inkHex: string }): StudioCanvasApi;
// src/components/studio/use-pinch.ts
export function usePinch(hostRef: React.RefObject<HTMLElement | null>, target: () => { scale(s: number): void; rotate(deg: number): void; begin(): void; end(): void } | null): void;
// src/components/studio/export-design.ts
export interface SideExport { preview: Blob; print: Blob }
export function exportSide(fabric: FabricModule, json: SideJson, opts: { families: Record<StudioFontId, string>; colorHex: string; side: DesignSide }): Promise<SideExport | null>;   // null for an empty side
export function submitDesign(args: { productId: string; variantId: string; quantity: number; front: SideJson; back: SideJson; exports: Record<DesignSide, SideExport | null> }): Promise<{ designId: string }>;
export function uploadAsset(file: File): Promise<{ url: string }>;
// components
export function UploadPanel(props: { onUpload(file: File): Promise<void>; busy: boolean }): JSX.Element;
export function TextPanel(props: { selected: SelectedText | null; onAdd(text: string, fontId: StudioFontId): Promise<void>; onChange(patch: Partial<SelectedText>): Promise<void> }): JSX.Element;
export function LayersPanel(props: { layers: LayerInfo[]; onSelect(i: number): void; onForward(): void; onBackward(): void; onRemove(): void }): JSX.Element;
export function ObjectToolbar(props: { api: StudioCanvasApi }): JSX.Element;
export function DpiChip(props: { dpi: number | null }): JSX.Element | null;       // data-testid="dpi-warning"
export function AddToCartBar(props: { price: React.ReactNode; rights: boolean; onRights(v: boolean): void; onAdd(): void; busy: boolean; status: string | null }): JSX.Element;
```

Behaviour (spec §2, §4):
- **Coordinates:** Fabric works in the 800 × 1000 logical space of the SVG. The `<canvas>` is sized to the stage's CSS width (`width × 1.25` tall) and `setZoom(width / 800)`; a `ResizeObserver` keeps it in sync. `canvas.clipPath` is an `absolutePositioned` `Rect` equal to `PRINT_AREA`, and `controlsAboveOverlay: true` keeps selection handles visible outside it. Objects outside the area are simply not rendered (and never printed).
- **Objects:** image (uploaded through `POST /api/designs/assets`, ≤ 10 MB, PNG/JPEG/WebP, scaled to fit 80 % of the print area and centred in it) and `Textbox` (default text colour contrasts with the shirt: white on dark, near-black on light; `data.fontId` stored). Move/scale/rotate come from Fabric; toolbar: undo, redo, duplicate (+20/+20), bring forward, send backward, centre in print area, delete. Keyboard: Delete/Backspace removes (not while editing text), Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo.
- **History:** per side, 20 steps (`HISTORY_LIMIT`), snapshots are `JSON.stringify(sideJson)` taken on `object:added`, `object:removed`, `object:modified` and after every `updateText`; loading a snapshot (undo/redo/side switch) suppresses snapshotting.
- **DPI:** for image layers `objectDpi({ naturalWidth: img.width, naturalHeight: img.height, scaledWidth: img.getScaledWidth(), scaledHeight: img.getScaledHeight() })`, recomputed on `object:scaling` and `object:modified`; `DpiChip` shows amber (< 150) or red (< 100) with `dpiMessage`; never blocks.
- **Fonts:** before adding text or changing its font, and before loading JSON, `await document.fonts.load(\`48px ${family}\`)` for each font id involved; JSON is loaded through `withFontFamilies`.
- **Touch:** the stage has `touch-action: none`; Fabric handles one-finger drag/select; `usePinch` scales and rotates the active object with two fingers (Pointer Events, `pinchTransform`, `clampScale`), committing one history step on release.
- **Add to cart:** requires a size (else open the Product tab and show the size error), at least one non-empty side ("Add a design to the front or back first"), and the rights checkbox ("Please confirm you own the rights to this artwork"). Then: status "Preparing print files…" (`aria-live`), `exportSide` for both sides, `submitDesign`, `toast.success("Added to your bag")`, `router.refresh()`, `useCartUI.getState().setOpen(true)`. Errors toast the server message. The button shows "Adding…" and is disabled while busy.
- **Edit flow:** with `initialDesign`, both sides load from it, the colour is locked to the design's colour until the user changes it, and a banner says "You are editing a copy. Your bag keeps the original until you remove it." Adding creates a **new** design (designs are immutable).

- [ ] **Step 1: Install Fabric**

```bash
npm install fabric@^6
```

Confirm `package.json` lists `"fabric": "^6.x"` and nothing else changed. Then run `npm run build` once before writing code that imports it: if the build fails resolving `canvas` or `jsdom` from `fabric` in the server bundle, add `serverExternalPackages: ["fabric"]` to `next.config.ts` (the only change allowed there; Fabric is never executed on the server) and include `next.config.ts` in this task's commit.

- [ ] **Step 2: Fabric loader and custom properties**

Create `src/components/studio/fabric-types.ts`:

```ts
import type { StudioFontId } from "@/lib/studio/constants";

export type FabricModule = typeof import("fabric");
export interface StudioObjectData { kind: "text" | "image"; fontId?: StudioFontId }

let pending: Promise<FabricModule> | null = null;
/** The only place Fabric is imported. Browser only (callers run inside effects or event handlers). */
export function loadFabric(): Promise<FabricModule> {
  pending ??= import("fabric");
  return pending;
}

declare module "fabric" {
  interface FabricObject { data?: StudioObjectData }
}
```

(If Fabric's typings reject the augmentation, drop the `declare module` block and read/write `data` through `(obj as FabricObject & { data?: StudioObjectData })`; behaviour is identical because serialisation uses `toObject(["data"])`.)

- [ ] **Step 3: The canvas hook**

Create `src/components/studio/use-studio-canvas.ts` (client). Key implementation (fill the obvious remainder in the same style):

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Canvas, FabricImage, FabricObject, Textbox } from "fabric";
import { CANVAS_WIDTH, PRINT_AREA, type DesignSide, type StudioFontId } from "@/lib/studio/constants";
import { toSideJson, withFontFamilies, fontIdsIn, type SideJson } from "@/lib/studio/canvas-json";
import { canRedo, canUndo, createHistory, pushHistory, redoHistory, undoHistory, type History } from "@/lib/studio/history";
import { objectDpi } from "@/lib/studio/dpi";
import { loadFabric, type FabricModule } from "./fabric-types";

const CENTER = { x: PRINT_AREA.left + PRINT_AREA.width / 2, y: PRINT_AREA.top + PRINT_AREA.height / 2 };

export function useStudioCanvas({ families, initial, inkHex }: { families: Record<StudioFontId, string>; initial: Record<DesignSide, SideJson>; inkHex: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricModule | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const sideRef = useRef<DesignSide>("front");
  const restoring = useRef(false);
  const histories = useRef<Record<DesignSide, History<string>>>({
    front: createHistory(JSON.stringify(initial.front)),
    back: createHistory(JSON.stringify(initial.back)),
  });
  const [ready, setReady] = useState(false);
  const [side, setSideState] = useState<DesignSide>("front");
  const [tick, setTick] = useState(0); // re-render after canvas changes
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const ensureFonts = useCallback(async (ids: StudioFontId[]) => {
    await Promise.all(ids.map((id) => document.fonts.load(`48px ${families[id]}`).catch(() => undefined)));
  }, [families]);

  const serialize = useCallback((): SideJson => {
    const c = canvasRef.current!;
    return toSideJson(c.toObject(["data"])) ?? { objects: [] };
  }, []);

  const commit = useCallback(() => {
    if (restoring.current || !canvasRef.current) return;
    const s = sideRef.current;
    histories.current[s] = pushHistory(histories.current[s], JSON.stringify(serialize()));
    bump();
  }, [bump, serialize]);

  const load = useCallback(async (json: string) => {
    const c = canvasRef.current, f = fabricRef.current;
    if (!c || !f) return;
    restoring.current = true;
    try {
      const parsed = toSideJson(JSON.parse(json)) ?? { objects: [] };
      await ensureFonts(fontIdsIn(parsed));
      c.discardActiveObject();
      await c.loadFromJSON(withFontFamilies(parsed, families));
      c.clipPath = new f.Rect({ ...PRINT_AREA, absolutePositioned: true });
      c.requestRenderAll();
    } finally {
      restoring.current = false;
      bump();
    }
  }, [bump, ensureFonts, families]);

  // Init once: dynamic import, canvas, clip, resize, events, first side.
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    (async () => {
      const f = await loadFabric();
      if (disposed || !canvasElRef.current || !hostRef.current) return;
      fabricRef.current = f;
      const c = new f.Canvas(canvasElRef.current, { preserveObjectStacking: true, controlsAboveOverlay: true, allowTouchScrolling: false });
      canvasRef.current = c;
      const fit = () => {
        const w = hostRef.current?.clientWidth ?? 0;
        if (!w) return;
        c.setDimensions({ width: w, height: Math.round(w * 1.25) });
        c.setZoom(w / CANVAS_WIDTH);
        c.requestRenderAll();
      };
      fit();
      observer = new ResizeObserver(fit);
      observer.observe(hostRef.current);
      for (const ev of ["object:added", "object:removed", "object:modified"] as const) c.on(ev, commit);
      for (const ev of ["selection:created", "selection:updated", "selection:cleared", "object:scaling"] as const) c.on(ev, bump);
      await load(histories.current.front.present);
      if (!disposed) setReady(true);
    })();
    return () => {
      disposed = true;
      observer?.disconnect();
      void canvasRef.current?.dispose();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialise exactly once per mount
  }, []);

  const setSide = useCallback(async (s: DesignSide) => {
    if (s === sideRef.current) return;
    sideRef.current = s;
    setSideState(s);
    await load(histories.current[s].present);
  }, [load]);

  const undo = useCallback(async () => {
    const s = sideRef.current;
    histories.current[s] = undoHistory(histories.current[s]);
    await load(histories.current[s].present);
  }, [load]);
  // redo: same with redoHistory

  const addToCanvas = useCallback((obj: FabricObject) => {
    const c = canvasRef.current, f = fabricRef.current;
    if (!c || !f) return;
    obj.setPositionByOrigin(new f.Point(CENTER.x, CENTER.y), "center", "center");
    obj.setCoords();
    c.add(obj);            // fires object:added → commit
    c.setActiveObject(obj);
    c.requestRenderAll();
  }, []);

  const addText = useCallback(async (text: string, fontId: StudioFontId) => {
    const f = fabricRef.current;
    if (!f || !text.trim()) return;
    await ensureFonts([fontId]);
    const t = new f.Textbox(text.trim().slice(0, 200), {
      fontFamily: families[fontId], fontSize: 56, fill: inkHex, textAlign: "center", width: PRINT_AREA.width * 0.9, splitByGrapheme: false,
    });
    t.data = { kind: "text", fontId };
    addToCanvas(t);
  }, [addToCanvas, ensureFonts, families, inkHex]);

  const addImage = useCallback(async (url: string) => {
    const f = fabricRef.current;
    if (!f) return;
    const img = await f.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    img.data = { kind: "image" };
    img.scale(Math.min((PRINT_AREA.width * 0.8) / img.width, (PRINT_AREA.height * 0.8) / img.height));
    addToCanvas(img);
  }, [addToCanvas]);

  // updateText(patch): on the active Textbox, map patch → { text, fill, fontSize, fontWeight: bold ? "bold" : "normal",
  //   fontStyle: italic ? "italic" : "normal", textAlign: align, charSpacing }; for fontId: await ensureFonts([id]),
  //   set fontFamily = families[id] and data.fontId = id. Then c.requestRenderAll() and commit() (set() fires no event).
  // selectLayer(index): c.setActiveObject(c.getObjects()[index]); c.requestRenderAll(); bump().
  // removeSelected(): c.remove(...c.getActiveObjects()); c.discardActiveObject().
  // duplicateSelected(): const copy = await active.clone(["data"]); copy.set({ left: active.left + 20, top: active.top + 20 }); c.add(copy); c.setActiveObject(copy).
  // forward()/backward(): c.bringObjectForward(active) / c.sendObjectBackwards(active); c.requestRenderAll(); commit().
  // centerSelected(): active.setPositionByOrigin(new f.Point(CENTER.x, CENTER.y), "center", "center"); active.setCoords(); commit().
  // sideJson(s): JSON.parse(histories.current[s].present) through toSideJson (fallback EMPTY_SIDE).
  // counts: for the current side c.getObjects().length (live), for the other side sideJson(other).objects.length.
  // layers: c.getObjects() mapped top-first → { index, kind: o.data?.kind ?? "image", label: text (≤ 24 chars) or "Image",
  //   dpi: image ? objectDpi({ naturalWidth: img.width, naturalHeight: img.height, scaledWidth: img.getScaledWidth(), scaledHeight: img.getScaledHeight() }) : null,
  //   selected: c.getActiveObjects().includes(o) }.
  // selectedText: read back from the active Textbox (fontId from data, bold = fontWeight === "bold" || 700, …).
  // Keyboard (useEffect on window keydown): ignore when (c.getActiveObject() as Textbox | undefined)?.isEditing or the event target is an input/textarea.

  return { /* StudioCanvasApi fields listed under Interfaces, computed from refs on each render (tick forces re-render) */ };
}
```

Every value in `StudioCanvasApi` is derived on render from `canvasRef.current` (guarded for `null` before `ready`), so no Fabric object is ever stored in React state.

Create `src/components/studio/use-pinch.ts` (client): on `pointerdown`/`pointermove`/`pointerup`/`pointercancel` of `hostRef.current` (with `{ passive: true }`), track up to two `pointerType === "touch"` pointers in a `Map<number, Pt>`. When the second finger lands and `target()` returns an object, remember both start points and call `begin()` (which records the object's `scaleX`, `scaleY`, `angle`). On move with two fingers: `const { scale, rotateDeg } = pinchTransform(a0, b0, a1, b1)`; `target.scale(clampScale(startScale * scale))`; `target.rotate(startAngle + rotateDeg)`; `canvas.requestRenderAll()`. On release of either finger: `end()` → `commit()` once. The hook exposes nothing else; the canvas hook passes a `target` factory that works on the active object and uses `obj.set({ scaleX, scaleY })`, `obj.rotate(deg)`, `obj.setCoords()`.

- [ ] **Step 4: Export and upload**

Create `src/components/studio/export-design.ts`:

```ts
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, PRINT_AREA, PRINT_SIZES, CANVAS_HEIGHT, CANVAS_WIDTH, type DesignSide, type StudioFontId } from "@/lib/studio/constants";
import { fontIdsIn, withFontFamilies, type SideJson } from "@/lib/studio/canvas-json";
import { shirtSvgMarkup } from "@/lib/studio/shirt";
import type { FabricModule } from "./fabric-types";

export interface SideExport { preview: Blob; print: Blob }

const toBlob = (el: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => el.toBlob(resolve, "image/png"));

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string; details?: Record<string, string[]> } };
    const first = body.error?.details && Object.values(body.error.details)[0]?.[0];
    return first ?? body.error?.message ?? "Something went wrong. Please try again.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

export async function uploadAsset(file: File): Promise<{ url: string }> {
  const body = new FormData();
  body.set("file", file);
  const res = await fetch("/api/designs/assets", { method: "POST", body });
  if (!res.ok) throw new Error(await readError(res));
  return ((await res.json()) as { data: { url: string } }).data;
}

export async function exportSide(fabric: FabricModule, json: SideJson, opts: { families: Record<StudioFontId, string>; colorHex: string; side: DesignSide }): Promise<SideExport | null> {
  if (json.objects.length === 0) return null;
  await Promise.all(fontIdsIn(json).map((id) => document.fonts.load(`48px ${opts.families[id]}`).catch(() => undefined)));
  const sc = new fabric.StaticCanvas(undefined, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, enableRetinaScaling: false });
  try {
    await sc.loadFromJSON(withFontFamilies(json, opts.families));
    sc.clipPath = new fabric.Rect({ ...PRINT_AREA, absolutePositioned: true });
    sc.renderAll();
    let print: Blob | null = null;
    for (const size of PRINT_SIZES) {
      try {
        const el = sc.toCanvasElement(size.width / PRINT_AREA.width, { ...PRINT_AREA });
        print = await toBlob(el);
        el.width = 0;
        el.height = 0; // release the large bitmap immediately (matters on phones)
        if (print && print.size > 0) break;
      } catch (err) {
        console.warn("[studio] print export failed at", size, err);
      }
      print = null;
    }
    if (!print) throw new Error("This device could not prepare the print file. Please try a desktop browser.");
    const out = document.createElement("canvas");
    out.width = PREVIEW_WIDTH;
    out.height = PREVIEW_HEIGHT;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw previews.");
    const svgUrl = URL.createObjectURL(new Blob([shirtSvgMarkup(opts.colorHex, opts.side, { background: "#f2f2f2" })], { type: "image/svg+xml" }));
    try {
      const shirt = new Image();
      shirt.src = svgUrl;
      await shirt.decode();
      ctx.drawImage(shirt, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
    ctx.drawImage(sc.toCanvasElement(PREVIEW_WIDTH / CANVAS_WIDTH), 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    const preview = await toBlob(out);
    if (!preview) throw new Error("Could not prepare the preview.");
    return { preview, print };
  } finally {
    void sc.dispose();
  }
}

export async function submitDesign(args: { productId: string; variantId: string; quantity: number; front: SideJson; back: SideJson; exports: Record<DesignSide, SideExport | null> }): Promise<{ designId: string }> {
  const body = new FormData();
  body.set("productId", args.productId);
  body.set("variantId", args.variantId);
  body.set("quantity", String(args.quantity));
  body.set("rightsConfirmed", "true");
  for (const side of ["front", "back"] as const) {
    const ex = args.exports[side];
    if (!ex) continue;
    body.set(`${side}Json`, JSON.stringify(args[side]));
    body.set(`${side}Preview`, new File([ex.preview], `${side}-preview.png`, { type: "image/png" }));
    body.set(`${side}Print`, new File([ex.print], `${side}-print.png`, { type: "image/png" }));
  }
  const res = await fetch("/api/designs", { method: "POST", body });
  if (!res.ok) throw new Error(await readError(res));
  return ((await res.json()) as { data: { designId: string } }).data;
}
```

(Assets are same-origin under `/api/uploads` locally; with S3 the bucket needs CORS `GET` from the site origin so the canvas is not tainted — documented in Task 8's README section.)

- [ ] **Step 5: Panels and toolbar**

Create `src/components/studio/dpi-chip.tsx`: returns `null` when `dpi === null` or `dpiLevel(dpi) === "ok"`; otherwise a `role="status"` pill `data-testid="dpi-warning"`: amber (`bg-amber-100 text-amber-900`) "{dpiMessage} ({dpi} DPI)" for `low`, red (`bg-red-100 text-red-900`) for `blurry`, with an `AlertTriangle` icon.

Create `src/components/studio/upload-panel.tsx` (client): a large drop zone `<label>` (`min-h-32`, dashed border) wrapping `<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" data-testid="upload-input">`, text "Upload PNG, JPG or WebP · up to 10 MB", and drag-and-drop on desktop. On change: `designAssetFileError(file)` → `toast.error`; else `await onUpload(file)` (the studio calls `uploadAsset` then `api.addImage(url)`), `busy` shows "Uploading…" with `aria-busy`. Tip text: "For a sharp print use at least 3600 × 4800 px for a full-size design."

Create `src/components/studio/text-panel.tsx` (client):
- "Add text" form: `<Label htmlFor="studio-text">Text</Label>` + `Input id="studio-text" data-testid="text-input" className="h-11" maxLength={200}`, font `<select id="studio-font" className="h-11">` of `STUDIO_FONTS`, **Add text** button (`h-11`, `data-testid="add-text"`) → `onAdd(text, fontId)`, then clears the input.
- When `selected` (a text layer is active): "Edit selected text" `<textarea rows={2} maxLength={200}>` (live `onChange({ text })`), font select, colour (`<input type="color" className="size-11">` plus 6 swatches `size-11`: black, white, brand red, yellow, navy, green), size slider (`<input type="range" min={12} max={160}>`, labelled "Size"), **Bold**/**Italic** toggle buttons (`aria-pressed`, `size-11`), alignment radio group (left/centre/right icons, `size-11`), letter spacing slider (`min={-100} max={800} step={10}`, labelled "Letter spacing").
- Every control has a visible label or `aria-label`.

Create `src/components/studio/layers-panel.tsx` (client): `<ol aria-label="Layers">` top-first; each `<li data-testid="layer-item">` is a row with a select button (`min-h-11 flex-1 text-left`, `aria-pressed={selected}`, icon `Type`/`Image`, label), `DpiChip` for images, and icon buttons (`size-11`) "Bring forward", "Send backward", "Delete layer" that act on that layer (select it first). Empty state: "Nothing on this side yet. Add text or upload an image."

Create `src/components/studio/object-toolbar.tsx` (client): a `role="toolbar" aria-label="Edit"` row under the stage with icon buttons (`size-11`, `lucide-react` icons) whose `aria-label`s are exactly (Task 8 queries them): `"Undo"` (`Undo2`, disabled when `!api.canUndo`), `"Redo"` (`Redo2`, disabled when `!api.canRedo`), `"Duplicate"` (`Copy`), `"Bring forward"` (`ArrowUp`), `"Send backward"` (`ArrowDown`), `"Centre"` (`Crosshair`), `"Delete"` (`Trash2`, `text-danger`); selection-dependent buttons are disabled when nothing is selected. Wraps on narrow screens (`flex flex-wrap justify-center gap-1`). Shows `<DpiChip dpi={api.selectedDpi} />` at the end.

Create `src/components/studio/add-to-cart-bar.tsx` (client): the panel footer — rights checkbox (`<label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" data-testid="rights-checkbox" …/> I own the rights to this artwork</label>`), then a row with `price` and the **Add to cart** `Button` (`h-11 px-5 font-display text-lg`, `data-testid="studio-add-to-cart"`, text "Adding…" while busy), and a `role="status" aria-live="polite"` line for `status`.

- [ ] **Step 6: Wire the studio**

Update `src/components/studio/studio.tsx`:
- `const inkHex = isDarkHex(hex) ? "#ffffff" : "#111111";` and `const api = useStudioCanvas({ families: STUDIO_FONT_FAMILIES, initial: { front: initialDesign?.front ?? EMPTY_SIDE, back: initialDesign?.back ?? EMPTY_SIDE }, inkHex });` (inkHex only affects newly added text).
- Stage: keep `<ShirtSvg hex={hex} side={api.side} …/>` and add `<div ref={api.hostRef} className="absolute inset-0"><canvas ref={api.canvasElRef} data-testid="studio-canvas" aria-label={`Design canvas, ${api.side}`} /></div>`; below the stage `<ObjectToolbar api={api} />`.
- `SideToggle` uses `api.side`, `api.setSide`, `api.counts`.
- Root attributes: `data-ready={api.ready ? "true" : "false"}` and `data-object-count={api.counts[api.side]}`.
- Tabs: Product (`ProductPanel`), Upload (`UploadPanel onUpload={async (f) => { setUploading(true); try { await api.addImage((await uploadAsset(f)).url); setTab("layers"); } catch (e) { toast.error((e as Error).message); } finally { setUploading(false); } }}`), Text (`TextPanel selected={api.selectedText} onAdd={api.addText} onChange={api.updateText}`), Layers (`LayersPanel`).
- Price: `sides = { front: api.counts.front > 0, back: api.counts.back > 0 }`.
- Footer: replace Task 5's disabled button with `<AddToCartBar price={<PriceSummary basePricePaise={chosen?.pricePaise ?? product.basePricePaise} fees={product.fees} sides={sides} />} rights={rights} onRights={setRights} onAdd={add} busy={busy} status={status} />` (new state: `rights`, `busy`, `status`, `uploading`; `const router = useRouter()`).
- Edit banner when `initialDesign` (`role="note"`, above the stage).
- `add()`:

```ts
async function add() {
  if (!chosen) { setSizeError(true); setTab("product"); setExpanded(true); return; }
  if (!sides.front && !sides.back) { toast.error("Add a design to the front or back first"); return; }
  if (!rights) { toast.error("Please confirm you own the rights to this artwork"); return; }
  setBusy(true);
  setStatus("Preparing print files…");
  try {
    const fabric = await loadFabric();
    const front = api.sideJson("front"), back = api.sideJson("back");
    const exports = {
      front: await exportSide(fabric, front, { families: STUDIO_FONT_FAMILIES, colorHex: hex, side: "front" }),
      back: await exportSide(fabric, back, { families: STUDIO_FONT_FAMILIES, colorHex: hex, side: "back" }),
    };
    setStatus("Uploading your design…");
    await submitDesign({ productId: product.id, variantId: chosen.variantId, quantity: 1, front, back, exports });
    toast.success("Added to your bag");
    router.refresh();
    useCartUI.getState().setOpen(true);
    setStatus(null);
  } catch (e) {
    setStatus(null);
    toast.error((e as Error).message);
  } finally {
    setBusy(false);
  }
}
```

(Before exporting, `api.sideJson` returns the last committed snapshot, which already includes the latest edit because every change commits.)

- [ ] **Step 7: Custom lines in the bag**

`src/components/storefront/cart-line.tsx`:
- The thumbnail link goes to `line.design?.editHref ?? /products/{slug}`; when `line.design`, overlay `<span data-testid="cart-custom-badge" className="absolute left-1 top-1 rounded-sm bg-brand px-1.5 py-0.5 text-[10px] font-medium uppercase text-brand-ink">Custom</span>` (the image already is the front preview).
- Under "colour / size" add `{line.design && <p className="text-xs text-text-muted">{line.design.label}</p>}` and `{line.design && <Link href={line.design.editHref} data-testid="cart-edit-design" className="inline-flex min-h-11 items-center text-xs underline underline-offset-4">Edit design</Link>}`.
- The quantity buttons of every cart line grow to `size-11` hit areas (`flex size-11 items-center justify-center`), keeping the pill visually compact with negative margins if needed.

- [ ] **Step 8: Verify and commit**

Full gate. Manual check on port 3001, desktop and Chrome device mode 390 × 844:
1. `/customize/blank-oversized-tee`, pick White / M. Text tab → "HELLO" in Anton → it appears centred in the dashed area; drag it past the edge: the part outside the area disappears, handles stay visible.
2. Change font, colour, size, bold, italic, alignment, letter spacing; undo/redo step back through each change; switch to Back and back again: each side keeps its own layers and history.
3. Upload a 1200 × 1600 PNG on the back: fits the area, the chip shows "Low resolution: may look soft (100 DPI)"; scale it up past the area: "May print blurry".
4. Layers tab: reorder and delete work; on mobile, pinch scales/rotates the selected layer, the sheet stays usable, every button is ≥ 44 px, no sideways scroll.
5. Add to cart without the rights box → toast; tick it → "Preparing print files…", then the drawer opens with a **Custom** thumbnail showing the shirt with HELLO and the price includes the back-print fee. `storage/uploads/designs/print/` holds two 3600 × 4800 PNGs (check one opens and is transparent outside the art).
6. **Edit design** from the drawer opens the studio with both sides loaded and the banner; adding creates a second line.
Stop the server.

```bash
git add package.json package-lock.json src/components/studio src/components/storefront/cart-line.tsx
git commit -m "feat(studio): add Fabric editor with text, uploads, layers, undo, export and add to cart

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

(Add `next.config.ts` to the `git add` only if Step 1 needed `serverExternalPackages`.)

---

### Task 7: Admin print queue, print-file downloads, order detail previews, nav badge, auto-Processing, fee and offer settings

**Files:**
- Create: `src/lib/print-queue.ts`, `src/server/services/print-queue.ts`, `src/app/admin/print-queue/page.tsx`, `src/app/admin/print-queue/actions.ts`, `src/app/admin/print-queue/files/[itemId]/[side]/route.ts`, `src/components/admin/print-queue/print-queue-list.tsx`, `src/components/admin/print-queue/print-item-card.tsx`, `src/components/admin/print-queue/print-item-actions.tsx`
- Modify: `src/lib/contact-links.ts`, `src/components/admin/admin-nav.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/orders/[id]/page.tsx`, `src/components/admin/orders/order-timeline.tsx`, `src/components/admin/settings-form.tsx`, `src/components/admin/offer-form.tsx`
- Test: `tests/unit/print-queue.test.ts`, `tests/unit/print-queue-lib.test.ts`

**Interfaces:**
- Consumes: Task 1 schema and fixtures (`createOrderItemRow`), `ORDER_EVENT_TYPES` with `PRINTED` (Task 1), `isCustomItem`, `printSidesOf`, `customPrintLabel` (Task 1), `StorageAdapter.get`, `fakePng` (Task 2), `uploadKeyFromUrl`, `addOrderEvent`, `Tx` (Phase 2 T5), `ORDER_STATUS_LABEL` (Phase 2 T1), `whatsappLink` (Phase 2 T9), `getAdminOrder`, `countToShip`, `AdminNav` (Phase 2 T9/T11), `formatDateTimeIst` (Phase 2 T7), `CustomPrintThumbs` (Task 4), `requireAdmin`, `requireAdminPage`, `actionError`, `toHttp`, `rupeesToPaise`, `paiseToRupees`, `BRAND`, `createUser`, `createOrderRow`.
- Produces:

```ts
// @/lib/print-queue (pure)
export interface PrintGroupable { colorName: string; size: string; quantity: number }
export interface PrintGroup<T> { key: string; colorName: string; size: string; units: number; items: T[] }
export function groupPrintQueue<T extends PrintGroupable>(items: T[]): PrintGroup<T>[];   // "Black / M", first-seen (oldest) order kept
export function ageLabel(paidAt: Date | null, now: Date): string;                         // "<1h" | "5h" | "3d" | "—"
// @/lib/contact-links (added)
export function printHoldWhatsappText(args: { number: string; name: string; brand: string }): string;
// @/server/services/print-queue
export const PRINT_QUEUE_STATUSES: readonly ["PAID", "PROCESSING"];
export const holdNoteSchema: ZodType<string>;                                            // 3..300 chars
export interface PrintQueueItem {
  itemId: string; orderId: string; orderNumber: string; orderStatus: OrderStatus; paidAt: Date | null;
  productName: string; colorName: string; size: string; sku: string; quantity: number;
  frontPreviewUrl: string | null; backPreviewUrl: string | null; hasFrontPrint: boolean; hasBackPrint: boolean;
  heldAt: Date | null; holdNote: string | null; customerName: string; customerPhone: string;
}
export function listPrintQueue(): Promise<PrintQueueItem[]>;             // unprinted custom items of PAID/PROCESSING orders, oldest paid first, ≤ 500
export function countPrintQueue(): Promise<number>;
export function markItemPrinted(itemId: string, actorId: string | null): Promise<{ orderMovedToProcessing: boolean }>;
export function holdItem(itemId: string, note: unknown, actorId: string | null): Promise<void>;
export function releaseHold(itemId: string, actorId: string | null): Promise<void>;
export function getPrintFile(itemId: string, side: DesignSide): Promise<{ bytes: Uint8Array; filename: string }>;   // "<ORD-n>-<sku>-<side>.png"
// src/app/admin/print-queue/actions.ts
export function markPrintedAction(itemId: string): Promise<ActionResult<{ orderMovedToProcessing: boolean }>>;
export function holdItemAction(itemId: string, note: string): Promise<ActionResult<null>>;
export function releaseHoldAction(itemId: string): Promise<ActionResult<null>>;
// route: GET /admin/print-queue/files/[itemId]/[front|back] → image/png attachment (admin only)
// components
export function AdminNav(props: { toShipCount: number; printQueueCount: number }): JSX.Element;
export function PrintQueueList(props: { items: PrintQueueItem[]; now: Date }): JSX.Element;
export function PrintItemCard(props: { item: PrintQueueItem; now: Date }): JSX.Element;              // data-testid="print-queue-item"
export interface PrintItemActionsProps { itemId: string; orderNumber: string; customerName: string; customerPhone: string; hasFront: boolean; hasBack: boolean; printedAt: Date | null; heldAt: Date | null; holdNote: string | null }
export function PrintItemActions(props: PrintItemActionsProps): JSX.Element;
```

Rules (spec §5): the queue lists every custom order item (has a front or back print URL) of a PAID or PROCESSING order that is not printed yet, oldest paid first; held items stay in the queue with their note. **Mark printed** sets `printedAt` (refused while held or already printed) and records a `PRINTED` event; when that was the last unprinted custom item of a PAID order, the order moves to PROCESSING in the same transaction with a `STATUS_CHANGED` event "Paid → Processing (all custom prints done)". **Hold** needs a note, flags the order `needsAttention` and records an `ATTENTION` event; **Release hold** clears it with a `NOTE` event (the attention flag is cleared from the order page as in Phase 2). Downloads stream from storage through an admin-only route with a useful file name.

- [ ] **Step 1: Failing tests**

Create `tests/unit/print-queue-lib.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ageLabel, groupPrintQueue } from "@/lib/print-queue";
import { printHoldWhatsappText } from "@/lib/contact-links";

describe("print queue helpers", () => {
  it("groups by colour and size in first-seen order and sums units", () => {
    const items = [
      { id: "a", colorName: "Black", size: "M", quantity: 1 },
      { id: "b", colorName: "White", size: "L", quantity: 2 },
      { id: "c", colorName: "Black", size: "M", quantity: 3 },
    ];
    expect(groupPrintQueue(items).map((g) => [g.key, g.units, g.items.map((i) => i.id)])).toEqual([
      ["Black / M", 4, ["a", "c"]],
      ["White / L", 2, ["b"]],
    ]);
  });

  it("describes how long ago an item was paid", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(ageLabel(null, now)).toBe("—");
    expect(ageLabel(new Date("2026-10-05T11:30:00Z"), now)).toBe("<1h");
    expect(ageLabel(new Date("2026-10-05T07:00:00Z"), now)).toBe("5h");
    expect(ageLabel(new Date("2026-10-02T11:00:00Z"), now)).toBe("3d");
  });

  it("writes a polite hold message", () => {
    expect(printHoldWhatsappText({ number: "ORD-1001", name: "Asha Rao", brand: "Thrift" })).toBe(
      "Hi Asha, this is Thrift about your custom tee in order ORD-1001. We need to check something about your artwork before printing.",
    );
  });
});
```

Create `tests/unit/print-queue.test.ts` (with the same `LocalDiskStorage` + `vi.mock("@/server/adapters/storage", …)` header as `tests/unit/designs.test.ts`):

```ts
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderItemRow, createOrderRow, createUser } from "../helpers/fixtures";
import { fakePng } from "../helpers/png";
import { countPrintQueue, getPrintFile, holdItem, listPrintQueue, markItemPrinted, releaseHold } from "@/server/services/print-queue";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

const DAY = 86_400_000;

describe("print queue service", () => {
  beforeEach(resetDb);

  it("lists unprinted custom items of paid and processing orders, oldest paid first", async () => {
    const u = await createUser();
    const older = await createOrderRow(u.id, { status: "PROCESSING", paidAt: new Date(Date.now() - 2 * DAY) });
    const newer = await createOrderRow(u.id, { status: "PAID", paidAt: new Date(Date.now() - DAY) });
    const pending = await createOrderRow(u.id, { status: "PENDING_PAYMENT", paidAt: null });
    const shipped = await createOrderRow(u.id, { status: "SHIPPED" });
    const a = await createOrderItemRow(older.id);
    const b = await createOrderItemRow(newer.id, { printFrontUrl: null, designFrontPreviewUrl: null, printBackUrl: "/api/uploads/designs/print/b.png", designBackPreviewUrl: "/api/uploads/designs/previews/b.png" });
    await createOrderItemRow(newer.id, { printFrontUrl: null, designFrontPreviewUrl: null }); // plain tee
    await createOrderItemRow(newer.id, { printedAt: new Date() });
    await createOrderItemRow(pending.id);
    await createOrderItemRow(shipped.id);
    const q = await listPrintQueue();
    expect(q.map((i) => i.itemId)).toEqual([a.id, b.id]);
    expect(q[1]).toMatchObject({ orderNumber: newer.number, orderStatus: "PAID", hasFrontPrint: false, hasBackPrint: true, backPreviewUrl: "/api/uploads/designs/previews/b.png", customerName: "Asha Rao" });
    expect(await countPrintQueue()).toBe(2);
  });

  it("moves a paid order to processing once every custom item is printed", async () => {
    const o = await createOrderRow((await createUser()).id, { status: "PAID" });
    const a = await createOrderItemRow(o.id);
    const b = await createOrderItemRow(o.id);
    await createOrderItemRow(o.id, { printFrontUrl: null, designFrontPreviewUrl: null }); // plain tee does not block
    expect(await markItemPrinted(a.id, null)).toEqual({ orderMovedToProcessing: false });
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PAID");
    expect(await markItemPrinted(b.id, null)).toEqual({ orderMovedToProcessing: true });
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { events: true } });
    expect(after.status).toBe("PROCESSING");
    expect(after.processingAt).not.toBeNull();
    expect(after.events.map((e) => e.type).sort()).toEqual(["PRINTED", "PRINTED", "STATUS_CHANGED"]);
    await expect(markItemPrinted(b.id, null)).rejects.toBeInstanceOf(ConflictError);
    expect(await countPrintQueue()).toBe(0);
  });

  it("leaves orders that are already processing where they are", async () => {
    const o = await createOrderRow((await createUser()).id, { status: "PROCESSING" });
    const a = await createOrderItemRow(o.id);
    expect(await markItemPrinted(a.id, null)).toEqual({ orderMovedToProcessing: false });
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PROCESSING");
  });

  it("holds and releases an item", async () => {
    const o = await createOrderRow((await createUser()).id, { status: "PAID" });
    const a = await createOrderItemRow(o.id);
    await expect(holdItem(a.id, " ", null)).rejects.toBeInstanceOf(ValidationError);
    await holdItem(a.id, "Artwork may be copyrighted", null);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ holdNote: "Artwork may be copyrighted" });
    const flagged = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { events: true } });
    expect(flagged.needsAttention).toBe(true);
    expect(flagged.events.find((e) => e.type === "ATTENTION")?.message).toContain("Artwork may be copyrighted");
    expect((await listPrintQueue())[0]).toMatchObject({ itemId: a.id, holdNote: "Artwork may be copyrighted" });
    await expect(markItemPrinted(a.id, null)).rejects.toBeInstanceOf(ConflictError);
    await releaseHold(a.id, null);
    await expect(releaseHold(a.id, null)).rejects.toBeInstanceOf(ConflictError);
    expect(await markItemPrinted(a.id, null)).toEqual({ orderMovedToProcessing: true });
  });

  it("refuses plain items and orders outside the queue", async () => {
    const u = await createUser();
    const plain = await createOrderItemRow((await createOrderRow(u.id)).id, { printFrontUrl: null, designFrontPreviewUrl: null });
    await expect(markItemPrinted(plain.id, null)).rejects.toBeInstanceOf(NotFoundError);
    const shipped = await createOrderItemRow((await createOrderRow(u.id, { status: "SHIPPED" })).id);
    await expect(markItemPrinted(shipped.id, null)).rejects.toBeInstanceOf(ConflictError);
  });

  it("streams print files with a helpful name", async () => {
    await storage.put("designs/print/x.png", fakePng(3600, 4800), "image/png");
    const o = await createOrderRow((await createUser()).id, { number: "ORD-2001" });
    const it = await createOrderItemRow(o.id, { printFrontUrl: "/api/uploads/designs/print/x.png", sku: "BLK-M" });
    const file = await getPrintFile(it.id, "front");
    expect(file.filename).toBe("ORD-2001-BLK-M-front.png");
    expect(file.bytes.byteLength).toBe(40);
    await expect(getPrintFile(it.id, "back")).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

(`createOrderRow` sets `shipName: "Asha Rao"` by default, and `paidAt` defaults to now for `PAID`.)

Run: `npm test -- tests/unit/print-queue-lib.test.ts tests/unit/print-queue.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Pure helpers**

Create `src/lib/print-queue.ts`:

```ts
export interface PrintGroupable { colorName: string; size: string; quantity: number }
export interface PrintGroup<T> { key: string; colorName: string; size: string; units: number; items: T[] }

export function groupPrintQueue<T extends PrintGroupable>(items: T[]): PrintGroup<T>[] {
  const groups = new Map<string, PrintGroup<T>>();
  for (const it of items) {
    const key = `${it.colorName} / ${it.size}`;
    const g = groups.get(key) ?? { key, colorName: it.colorName, size: it.size, units: 0, items: [] };
    g.units += it.quantity;
    g.items.push(it);
    groups.set(key, g);
  }
  return [...groups.values()];
}

const HOUR = 3_600_000;

export function ageLabel(paidAt: Date | null, now: Date): string {
  if (!paidAt) return "—";
  const ms = now.getTime() - paidAt.getTime();
  if (ms < HOUR) return "<1h";
  if (ms < 24 * HOUR) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / (24 * HOUR))}d`;
}
```

`src/lib/contact-links.ts` (append):

```ts
export function printHoldWhatsappText({ number, name, brand }: { number: string; name: string; brand: string }): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  return `Hi ${first}, this is ${brand} about your custom tee in order ${number}. We need to check something about your artwork before printing.`;
}
```

- [ ] **Step 3: Service**

Create `src/server/services/print-queue.ts`:

```ts
import type { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { getStorage } from "@/server/adapters/storage";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { uploadKeyFromUrl } from "@/server/uploads";
import { addOrderEvent } from "@/server/services/order-records";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import type { DesignSide } from "@/lib/studio/constants";

export const PRINT_QUEUE_STATUSES = ["PAID", "PROCESSING"] as const satisfies readonly OrderStatus[];
export const holdNoteSchema = z.string().trim().min(3, "Say why this item is on hold").max(300, "Keep the note under 300 characters");

const CUSTOM_ITEM: Prisma.OrderItemWhereInput = { OR: [{ printFrontUrl: { not: null } }, { printBackUrl: { not: null } }] };
const QUEUE_WHERE: Prisma.OrderItemWhereInput = { ...CUSTOM_ITEM, printedAt: null, order: { status: { in: [...PRINT_QUEUE_STATUSES] } } };

export interface PrintQueueItem {
  itemId: string; orderId: string; orderNumber: string; orderStatus: OrderStatus; paidAt: Date | null;
  productName: string; colorName: string; size: string; sku: string; quantity: number;
  frontPreviewUrl: string | null; backPreviewUrl: string | null; hasFrontPrint: boolean; hasBackPrint: boolean;
  heldAt: Date | null; holdNote: string | null; customerName: string; customerPhone: string;
}

export async function listPrintQueue(): Promise<PrintQueueItem[]> {
  const rows = await db.orderItem.findMany({
    where: QUEUE_WHERE,
    orderBy: [{ order: { paidAt: "asc" } }, { order: { createdAt: "asc" } }, { id: "asc" }],
    take: 500,
    include: { order: { select: { id: true, number: true, status: true, paidAt: true, shipName: true, shipPhone: true } } },
  });
  return rows.map((i) => ({
    itemId: i.id, orderId: i.order.id, orderNumber: i.order.number, orderStatus: i.order.status, paidAt: i.order.paidAt,
    productName: i.productName, colorName: i.colorName, size: i.size, sku: i.sku, quantity: i.quantity,
    frontPreviewUrl: i.designFrontPreviewUrl, backPreviewUrl: i.designBackPreviewUrl,
    hasFrontPrint: i.printFrontUrl !== null, hasBackPrint: i.printBackUrl !== null,
    heldAt: i.heldAt, holdNote: i.holdNote, customerName: i.order.shipName, customerPhone: i.order.shipPhone,
  }));
}

export async function countPrintQueue(): Promise<number> {
  return db.orderItem.count({ where: QUEUE_WHERE });
}

async function loadCustomItem(itemId: string) {
  const item = await db.orderItem.findFirst({ where: { id: itemId, ...CUSTOM_ITEM }, include: { order: { select: { id: true, status: true } } } });
  if (!item) throw new NotFoundError("Custom item");
  return item;
}

const itemLabel = (i: { productName: string; colorName: string; size: string; quantity: number }) => `${i.productName} (${i.colorName} / ${i.size}) × ${i.quantity}`;

export async function markItemPrinted(itemId: string, actorId: string | null): Promise<{ orderMovedToProcessing: boolean }> {
  const item = await loadCustomItem(itemId);
  if (!(PRINT_QUEUE_STATUSES as readonly OrderStatus[]).includes(item.order.status)) {
    throw new ConflictError(`A ${ORDER_STATUS_LABEL[item.order.status].toLowerCase()} order is not in the print queue`);
  }
  if (item.heldAt) throw new ConflictError("Release the hold before marking this item printed");
  const moved = await db.$transaction(async (tx) => {
    const r = await tx.orderItem.updateMany({ where: { id: itemId, printedAt: null, heldAt: null }, data: { printedAt: new Date() } });
    if (r.count !== 1) throw new ConflictError("This item just changed. Reload and try again.");
    await addOrderEvent(tx, item.orderId, "PRINTED", `Printed ${itemLabel(item)}`, actorId);
    const remaining = await tx.orderItem.count({ where: { orderId: item.orderId, printedAt: null, ...CUSTOM_ITEM } });
    if (remaining > 0) return false;
    const u = await tx.order.updateMany({ where: { id: item.orderId, status: "PAID" }, data: { status: "PROCESSING", processingAt: new Date() } });
    if (u.count !== 1) return false;
    await addOrderEvent(tx, item.orderId, "STATUS_CHANGED", `${ORDER_STATUS_LABEL.PAID} → ${ORDER_STATUS_LABEL.PROCESSING} (all custom prints done)`, actorId);
    return true;
  });
  return { orderMovedToProcessing: moved };
}

export async function holdItem(itemId: string, note: unknown, actorId: string | null): Promise<void> {
  const parsed = holdNoteSchema.safeParse(note);
  if (!parsed.success) throw new ValidationError({ note: parsed.error.issues.map((i) => i.message) });
  const item = await loadCustomItem(itemId);
  if (item.printedAt) throw new ConflictError("This item is already printed");
  await db.$transaction(async (tx) => {
    await tx.orderItem.update({ where: { id: itemId }, data: { heldAt: new Date(), holdNote: parsed.data } });
    await tx.order.update({ where: { id: item.orderId }, data: { needsAttention: true } });
    await addOrderEvent(tx, item.orderId, "ATTENTION", `Custom print on hold, ${itemLabel(item)}: ${parsed.data}`, actorId);
  });
}

export async function releaseHold(itemId: string, actorId: string | null): Promise<void> {
  const item = await loadCustomItem(itemId);
  await db.$transaction(async (tx) => {
    const r = await tx.orderItem.updateMany({ where: { id: itemId, heldAt: { not: null } }, data: { heldAt: null, holdNote: null } });
    if (r.count !== 1) throw new ConflictError("This item is not on hold");
    await addOrderEvent(tx, item.orderId, "NOTE", `Hold released on ${itemLabel(item)}`, actorId);
  });
}

export async function getPrintFile(itemId: string, side: DesignSide): Promise<{ bytes: Uint8Array; filename: string }> {
  const item = await db.orderItem.findUnique({ where: { id: itemId }, select: { sku: true, printFrontUrl: true, printBackUrl: true, order: { select: { number: true } } } });
  const url = item ? (side === "front" ? item.printFrontUrl : item.printBackUrl) : null;
  const key = url ? uploadKeyFromUrl(url) : null;
  const bytes = key ? await getStorage().get(key) : null;
  if (!item || !bytes) throw new NotFoundError("Print file");
  const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "-");
  return { bytes, filename: `${safe(item.order.number)}-${safe(item.sku)}-${side}.png` };
}
```

Run the service tests (GREEN).

- [ ] **Step 4: Actions and the download route**

Create `src/app/admin/print-queue/actions.ts` in the exact shape of the Phase 2 admin actions (`"use server"`; `try { const { userId } = await requireAdmin(); …; revalidatePath("/", "layout"); return { ok: true, data } } catch (err) { return actionError(err) }`): `markPrintedAction(itemId)` → `markItemPrinted(itemId, userId)`; `holdItemAction(itemId, note)` → `holdItem(itemId, note, userId)` then `data: null`; `releaseHoldAction(itemId)` → `releaseHold`.

Create `src/app/admin/print-queue/files/[itemId]/[side]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin-guard";
import { NotFoundError, toHttp } from "@/server/errors";
import { getPrintFile } from "@/server/services/print-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ itemId: string; side: string }> }): Promise<Response> {
  try {
    await requireAdmin();
    const { itemId, side } = await ctx.params;
    if (side !== "front" && side !== "back") throw new NotFoundError("Print file");
    const { bytes, filename } = await getPrintFile(itemId, side);
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const { status, body } = toHttp(err);
    return NextResponse.json(body, { status });
  }
}
```

(`/admin/*` is already ADMIN-only in middleware; `requireAdmin()` is the second guard.)

- [ ] **Step 5: Print queue UI**

Create `src/components/admin/print-queue/print-item-actions.tsx` (client), `PrintItemActions`:
- **Download front** / **Download back** links (`<a href={`/admin/print-queue/files/${itemId}/front`} download data-testid="print-download-front">`, same for back, only for sides that exist), styled as secondary buttons `min-h-11 inline-flex items-center`.
- **Download all** button when both sides exist: creates and clicks one temporary `<a download>` per side in sequence (300 ms apart) — no ZIP.
- When not printed and not held: **Mark printed** (primary, `h-11`, `data-testid="mark-printed"`) → `markPrintedAction`; toast "Marked printed" or, when `orderMovedToProcessing`, "Marked printed · order {orderNumber} moved to Processing"; `router.refresh()`.
- **Hold** (`variant="secondary"`, `h-11`, `data-testid="hold-item"`) → `Dialog` titled "Hold this print" with `<Label htmlFor="hold-note">Why? (the customer does not see this)</Label>` + `<textarea id="hold-note" rows={3} maxLength={300}>`, **Hold item** / **Cancel**; field errors via `FieldError`; success toast "On hold · order flagged".
- When held: an amber box with the note, **Release hold** (`h-11`) → `releaseHoldAction`, and a **Message on WhatsApp** link (`whatsappLink(customerPhone, printHoldWhatsappText({ number: orderNumber, name: customerName, brand: BRAND.name }))`, `target="_blank" rel="noopener noreferrer"`, `min-h-11`).
- When printed: a green "Printed {formatDateTimeIst(printedAt)}" line instead of the actions (used on the order page).

Create `src/components/admin/print-queue/print-item-card.tsx` (server-safe): `<li data-testid="print-queue-item" className="rounded-md border border-border p-3 sm:p-4">`:
- Header row: order number `Link` to `/admin/orders/{orderId}` (`min-h-11 inline-flex items-center font-medium`), age badge `ageLabel(paidAt, now)` (amber when ≥ 2 days), status text.
- `CustomPrintThumbs front={frontPreviewUrl} back={backPreviewUrl} size={120}` (two previews side by side; wraps at 360 px).
- Product name, **{colorName} / {size}** in bold, `× {quantity}` large, SKU in `font-mono text-xs`, `customPrintLabel({ front: hasFrontPrint, back: hasBackPrint })`.
- `<PrintItemActions …/>` with the item's fields (`printedAt: null`).

Create `src/components/admin/print-queue/print-queue-list.tsx` (client): props `{ items, now }`; a toggle (`role="group"`, two `min-h-11` buttons with `aria-pressed`): **Oldest first** (default, a single `<ul className="grid gap-3 lg:grid-cols-2">` of cards) and **Group by colour + size** (`groupPrintQueue(items)` → one `<section>` per group with an `h2` "{key} · {units} tee(s)" and its cards). The choice is kept in `localStorage` under `print-queue-view` (wrapped in try/catch; default when unavailable).

Create `src/app/admin/print-queue/page.tsx` (server): `await requireAdminPage()`; `const items = await listPrintQueue()`; header `h1` "Print queue" with "{n} item(s) to print · {units} tee(s)"; a one-line routine hint ("Download the print files, print, then Mark printed. Orders move to Processing when all their custom items are printed."); `<PrintQueueList items={items} now={new Date()} />`; empty state "Nothing to print. Nice." with a link back to Orders.

- [ ] **Step 6: Nav badge, order page, timeline, settings and offer forms**

`src/app/admin/layout.tsx`: `const [toShip, toPrint] = await Promise.all([countToShip(), countPrintQueue()]);` and `<AdminNav toShipCount={toShip} printQueueCount={toPrint} />`.

`src/components/admin/admin-nav.tsx`: accept `printQueueCount`; insert `{ href: "/admin/print-queue", label: "Print queue", icon: Printer }` right after Orders; when `printQueueCount > 0` render the same pill as the Orders badge with `data-testid="print-queue-badge"` and `sr-only` "To print: ".

`src/app/admin/orders/[id]/page.tsx`: in the items card, for each item where `isCustomItem(item)`: a "Custom" badge, `customPrintLabel(printSidesOf(item))`, `<CustomPrintThumbs front={item.designFrontPreviewUrl} back={item.designBackPreviewUrl} size={96} />`, and `<PrintItemActions itemId={item.id} orderNumber={order.number} customerName={order.ship.name} customerPhone={order.ship.phone} hasFront={item.printFrontUrl !== null} hasBack={item.printBackUrl !== null} printedAt={item.printedAt} heldAt={item.heldAt} holdNote={item.holdNote} />` (actions only while the order status is PAID or PROCESSING; otherwise just the download links and the printed line).

`src/components/admin/orders/order-timeline.tsx`: icon for `PRINTED` is `Printer`.

`src/components/admin/settings-form.tsx`: new fieldset **Custom prints** with **Front print fee (₹)** and **Back print fee (₹)** (`inputMode="decimal"`, `h-11`, prefilled with `paiseToRupees(settings.customFrontFeePaise)` / `…Back…`), sent as `customFrontFeePaise: rupeesToPaise(value)` / `customBackFeePaise` in `saveSettingsAction`'s input; helper text "Added to the tee price when that side has a design. 0 = free."

`src/components/admin/offer-form.tsx`: a checkbox **Include custom-printed tees** (`<label className="flex min-h-11 items-center gap-3">`, default unchecked, sends `includeCustom`), helper "Off: custom tees never count toward this offer."; the offers list shows "incl. custom" when `includeCustom`.

- [ ] **Step 7: Verify and commit**

Run the two test files and the Phase 2 `admin-orders`, `admin-promotions`, `settings` tests (GREEN), then the full gate. Manual check on port 3001 as admin after one mock-paid custom order (from Task 6's flow): the nav shows **Print queue 1**; the card shows both previews; **Download front** saves `ORD-…-…-front.png` (3600 × 4800); Hold with a note flags the order (amber banner on the order page) and the WhatsApp link opens `wa.me`; Release hold, then Mark printed → toast says the order moved to Processing, the badge disappears, the order timeline shows PRINTED and the status change; the packing slip lists "Custom print: front + back". At 360 px no sideways scroll on the queue. Settings: change the back fee to ₹99, the studio price reflects it. Stop the server.

```bash
git add src/lib/print-queue.ts src/lib/contact-links.ts src/server/services/print-queue.ts src/app/admin/print-queue src/components/admin/print-queue src/components/admin/admin-nav.tsx src/app/admin/layout.tsx "src/app/admin/orders/[id]/page.tsx" src/components/admin/orders/order-timeline.tsx src/components/admin/settings-form.tsx src/components/admin/offer-form.tsx tests/unit/print-queue.test.ts tests/unit/print-queue-lib.test.ts
git commit -m "feat(admin): add print queue with downloads, holds and auto-processing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 8: End-to-end tests (desktop + 390 × 844 mobile) and README

**Files:**
- Create: `tests/e2e/studio.spec.ts`, `tests/e2e/studio-mobile.spec.ts`
- Modify: `tests/e2e/helpers.ts`, `playwright.config.ts`, `README.md`

**Interfaces:**
- Consumes: `register`, `login`, `uniqueEmail`, `checkoutWithMockPayment`, `hasNoHorizontalScroll` (Phase 1 / Phase 2 T13 helpers); test ids from Task 5 (`customize-page`, `studio-product-card`, `studio-page` with `data-ready`/`data-object-count`, `studio-sheet`, `studio-tab-*`, `studio-size`, `studio-side-front`/`-back`, `studio-price`, `studio-add-to-cart`), Task 6 (`studio-canvas`, `text-input`, `add-text`, `upload-input`, `layer-item`, `rights-checkbox`, toolbar `aria-label`s, `cart-custom-badge`, `cart-edit-design`), Task 7 (`print-queue-item`, `print-download-front`, `mark-printed`, `print-queue-badge`), Phase 2 (`cart-drawer`, `cart-line`, `order-row`, `admin-order`, `order-status`, `admin-dashboard`); seeded admin (`ADMIN_EMAIL`, `ADMIN_PASSWORD` in `.env`) and the seeded customizable blanks.
- Produces (tests/e2e/helpers.ts):

```ts
export function openStudio(page: Page): Promise<void>;                     // /customize → first card → ready → first in-stock size
export function addTextToDesign(page: Page, text: string): Promise<void>;
export function uploadArtwork(page: Page): Promise<void>;                  // 1200 × 1600 PNG generated in the page
export function openAdminPage(browser: Browser): Promise<Page>;            // new context, admin login, /admin visible
```

- [ ] **Step 1: Playwright config**

In `playwright.config.ts`:
- Change the `desktop` project's `testIgnore` to `/(checkout|studio)-mobile/`.
- Add `{ name: "mobile-studio", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, testMatch: /studio-mobile/ }`.
- The existing `mobile` (`/home|product-cart/`), `reduced-motion` and `mobile-checkout` projects already exclude the new specs.

- [ ] **Step 2: Helpers**

Append to `tests/e2e/helpers.ts` (add `type Browser` to the Playwright import):

```ts
export async function openStudio(page: Page) {
  await page.goto("/customize");
  await expect(page.getByTestId("customize-page")).toBeVisible();
  await page.getByTestId("studio-product-card").first().click();
  await expect(page.getByTestId("studio-page")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await page.getByTestId("studio-tab-product").click();
  await page.locator('[data-testid="studio-size"]:not([disabled])').first().click();
}

export async function addTextToDesign(page: Page, text: string) {
  await page.getByTestId("studio-tab-text").click();
  await page.getByTestId("text-input").fill(text);
  await page.getByTestId("add-text").click();
  await expect(page.getByTestId("studio-page")).toHaveAttribute("data-object-count", /^[1-9]/);
}

export async function uploadArtwork(page: Page) {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 1600;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e11d48";
    ctx.fillRect(100, 100, 1000, 1400);
    const blob: Blob = await new Promise((resolve) => c.toBlob((b) => resolve(b!), "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.getByTestId("studio-tab-upload").click();
  await page.getByTestId("upload-input").setInputFiles({ name: "art.png", mimeType: "image/png", buffer: Buffer.from(bytes) });
  await expect(page.getByTestId("studio-page")).toHaveAttribute("data-object-count", /^[1-9]/, { timeout: 20_000 });
}

export async function openAdminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3001" });
  const page = await ctx.newPage();
  await login(page, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
  await page.goto("/admin");
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  return page;
}
```

- [ ] **Step 3: Desktop spec**

Create `tests/e2e/studio.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { addTextToDesign, checkoutWithMockPayment, openAdminPage, openStudio, register, uniqueEmail, uploadArtwork } from "./helpers";

test.describe("design studio and print queue", () => {
  test.skip(!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");

  test("customer designs front and back, pays, and the admin prints it", async ({ page, browser }) => {
    test.slow();
    await register(page, uniqueEmail("studio"), "Asha Rao");
    await openStudio(page);
    const blankPrice = await page.getByTestId("studio-price").innerText();

    await addTextToDesign(page, "HELLO");
    await page.getByTestId("studio-side-back").click();
    await expect(page.getByTestId("studio-page")).toHaveAttribute("data-object-count", "0");
    await uploadArtwork(page);
    await page.getByTestId("studio-tab-layers").click();
    await expect(page.getByTestId("layer-item")).toHaveCount(1);
    await expect(page.getByTestId("studio-price")).not.toHaveText(blankPrice); // back print fee added (seed default ₹149)

    await page.getByTestId("rights-checkbox").check();
    await page.getByTestId("studio-add-to-cart").click();
    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible({ timeout: 45_000 });
    const line = drawer.getByTestId("cart-line").filter({ has: page.getByTestId("cart-custom-badge") });
    await expect(line).toHaveCount(1);
    await expect(line.getByRole("img").first()).toHaveAttribute("src", /designs/);
    await expect(line.getByTestId("cart-edit-design")).toHaveAttribute("href", /\/customize\/[^?]+\?design=/);

    const number = await checkoutWithMockPayment(page);

    const admin = await openAdminPage(browser);
    await expect(admin.getByTestId("print-queue-badge")).toBeVisible();
    await admin.goto("/admin/print-queue");
    const card = admin.getByTestId("print-queue-item").filter({ hasText: number });
    await expect(card).toHaveCount(1);
    const href = await card.getByTestId("print-download-front").getAttribute("href");
    const file = await admin.request.get(href!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/png");
    await card.getByTestId("mark-printed").click();
    await expect(card).toHaveCount(0);

    await admin.goto(`/admin/orders?q=${encodeURIComponent(number)}`);
    await admin.getByTestId("order-row").filter({ hasText: number }).getByRole("link", { name: number }).click();
    await expect(admin.getByTestId("admin-order")).toBeVisible();
    await expect(admin.getByTestId("order-status").first()).toHaveText(/processing/i);
    await admin.context().close();
  });
});
```

- [ ] **Step 4: Mobile spec**

Create `tests/e2e/studio-mobile.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { addTextToDesign, hasNoHorizontalScroll, openStudio } from "./helpers";

test("studio at 390×844: bottom-sheet tools, 44 px targets, guest adds a custom tee", async ({ page }) => {
  test.slow();
  await openStudio(page);
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await expect(page.getByTestId("studio-sheet")).toBeVisible();
  await expect(page.getByTestId("studio-canvas")).toBeVisible();

  for (const id of ["studio-tab-product", "studio-tab-upload", "studio-tab-text", "studio-tab-layers", "studio-side-front", "studio-side-back", "studio-add-to-cart"]) {
    expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(44);
  }

  await addTextToDesign(page, "HELLO");
  for (const name of ["Undo", "Redo", "Duplicate", "Bring forward", "Send backward", "Centre", "Delete"]) {
    const box = await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name }).boundingBox();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
    expect(box!.width, name).toBeGreaterThanOrEqual(44);
  }
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  await page.getByTestId("rights-checkbox").check();
  await page.getByTestId("studio-add-to-cart").click();
  await expect(page.getByTestId("cart-drawer")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("cart-custom-badge")).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});
```

- [ ] **Step 5: README**

Add a section after the Phase 2 "Admin: daily order routine" section:

````markdown
## Design studio and print queue

- Customers design at `/customize` (any **active** product with **Customizable blank** ticked in the product editor; the seed marks the two blank tees). Front and back each have a 12 × 16 in print area. Uploads: PNG, JPG or WebP up to 10 MB. Text: Anton, Bebas Neue, Inter, Permanent Marker. Images below 150 DPI at their printed size show a warning (below 100 DPI: "may print blurry"); nothing is blocked.
- Price = tee price + **Front print fee** (if the front has a design) + **Back print fee** (if the back has one). Set both in **Admin → Settings → Custom prints** (defaults ₹0 and ₹149). Offers ignore custom tees unless the offer has **Include custom-printed tees** ticked; coupons always apply.
- On "Add to cart" the browser renders, per designed side, an 800 px preview (tee + design) and a transparent 3600 × 4800 px print PNG (300 DPI; phones that cannot allocate that canvas send 3072 × 4096, 256 DPI). Files live in storage under `designs/previews/`, `designs/print/` and `designs/assets/`.
- **Print queue** (`/admin/print-queue`, badge in the nav): every custom item of a Paid or Processing order that is not printed yet, oldest first, optionally grouped by colour + size. Download the print files, print, then **Mark printed**; when every custom item of a Paid order is printed the order moves to **Processing** automatically. **Hold** (with a note) flags the order for attention and gives you a WhatsApp link to the customer; release the hold to continue.
- Order pages, the packing slip ("Custom print: front + back"), the invoice and the confirmation email show the design previews.
- **S3:** when `STORAGE_DRIVER=s3`, add a CORS rule on the bucket allowing `GET` from the site origin, otherwise the browser cannot export designs that contain uploaded images.
- Cleanup: the `purge-designs` cron job (daily, e.g. 03:30 IST) deletes designs older than 30 days that are in no bag and no order, with their files:
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/purge-designs`
- The only new dependency is `fabric` (v6), loaded in the browser on the studio page only.
````

Also add `purge-designs` (daily) to the job list in the README's Cron section.

- [ ] **Step 6: Verify and commit**

Run the full gate, then `npm run test:e2e` (all projects). Both new specs must pass along with every Phase 1 and Phase 2 spec. Confirm nothing listens on port 3001 afterwards.

```bash
git add tests/e2e/studio.spec.ts tests/e2e/studio-mobile.spec.ts tests/e2e/helpers.ts playwright.config.ts README.md
git commit -m "test(studio): add desktop and mobile studio and print queue e2e, document the studio

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

## Spec decisions resolved in this plan

- **"Has objects" for fees** is "has a print file": the studio never uploads files for an empty side, so the server derives the fee from `frontPrintKey`/`backPrintKey` (and orders from `printFrontUrl`/`printBackUrl`) and never trusts a client price.
- **Print size fallback:** 3600 × 4800 (300 DPI) is always attempted; browsers that cannot allocate a 17-megapixel canvas (iOS Safari's 16.7 MP cap) send 3072 × 4096 (256 DPI). The server accepts exactly these two sizes, read from the PNG header.
- **Print-area clipping** uses `canvas.clipPath` (absolute rect) with `controlsAboveOverlay`, so handles remain usable outside the area while anything outside is neither shown nor printed.
- **Fonts** are stored in the JSON as a stable `data.fontId` and remapped to the build's `next/font` family on every load (next/font family names change between builds).
- **Pinch/rotate** is implemented with Pointer Events on top of Fabric (Fabric v6 has no built-in pinch gesture); one-finger drag/select is Fabric's own.
- **Design ownership for guests** uses the existing `cart_token` cookie; `POST /api/designs` mints and sets it when missing (`withGuestCookie`). On login, `mergeGuestCartIntoUser` hands every guest design to the user, including designs not in the bag.
- **Uniqueness:** `@@unique([cartId, designId])` in Prisma plus a raw-SQL partial unique index `(cartId, variantId) WHERE designId IS NULL`; migrations are applied with `migrate deploy` so `migrate dev` never drops the partial index, and a unit test guards it.
- **Stock** is checked across all lines of a variant (plain + custom) in the bag and at checkout reconciliation.
- **Deleting a product** cascades its designs; order items keep their preview/print URL snapshots (`OrderItem.design` is `SetNull`), so past orders stay printable.
- **Hold** is stored per item (`heldAt`, `holdNote`) in addition to the order's `needsAttention`, so the queue can show which item is held and why; releasing a hold does not clear the order's attention flag (done from the order page as in Phase 2).
- **Auto-Processing** happens inside the same transaction as the last "Mark printed" and only from PAID; a PROCESSING order stays put.
- **Downloads** go through an admin-only route that streams from storage (works for local disk and S3 alike) with names like `ORD-1001-SKU-front.png`; "Download all" triggers one download per side (no ZIP).
- **Paying an order** removes exactly the ordered lines (plain by variant, custom by design) so a custom tee added after placing the order stays in the bag.

## Carried-over deferrals relevant to this plan

- Uploaded assets that never end up in a saved design are not purged (there is no asset table); add one if storage growth matters.
- Curved text, templates, 3D preview, AI generation and embroidery stay out of scope (spec §1).
- Server-side re-rendering of print files is not done; the print PNG is exactly what the customer's browser produced.
- In-memory rate limits assume one app instance (as in Phase 1).
- Automated artwork moderation is out of scope; the owner holds items manually.

## Plan self-review

- **Spec coverage:** §1 scope → Tasks 5, 6, 7; §2 decisions: Fabric v6 (T6), SVG mockup + 12 × 16 in print area (T2, T5), objects/fonts/transforms/undo/clip (T6), DPI warning (T2, T6), rights checkbox (T3 server, T6 UI), save/export sizes and limits (T2, T3, T6), pricing (T1, T3, T4), ownership and merge (T3), cart uniqueness (T1, T3), order fields (T1, T4), moderation/hold (T7); §3 data model and purge job → T1, T3; §4 storefront (landing, studio, mobile sheet, Customize this, edit flow, cart thumbnails) → T5, T6; §5 admin (queue, downloads, mark printed, auto-Processing, hold, order detail and slip previews, nav badge, customizable toggle already present and seeded) → T4, T7; §6 API → T3; §7 testing → unit tests in T1–T4 and T7, Playwright desktop + 390 × 844 in T8.
- **Placeholders:** none; pure logic, services, jobs and tests have full code; UI tasks give files, props, state, handlers, test ids, accessibility and the key Fabric code.
- **Consistency check (every referenced symbol and where it is defined):** `Design` model, `CartItem.designId`, `cartId_designId`, `CartItem_cartId_variantId_plain_key`, `OrderItem.{designId, designFrontPreviewUrl, designBackPreviewUrl, printFrontUrl, printBackUrl, printedAt, heldAt, holdNote}`, `StoreSetting.{customFrontFeePaise, customBackFeePaise}`, `Offer.includeCustom` (T1) · `CustomFees`, `DesignSides`, `NO_CUSTOM_FEES`, `customFeesOf`, `designSides`, `printSidesOf`, `isCustomItem`, `customFeePaise`, `customUnitPricePaise`, `customPrintLabel` (T1) · `PricingLine.custom`, `PricingOffer.includeCustom`, `PRINTED` event type, `getCustomFees`, `OfferRow.includeCustom`, settings/offer schema fields, `createDesignRow`, `createOrderItemRow` (T1) · `CANVAS_WIDTH`, `CANVAS_HEIGHT`, `PRINT_AREA`, `PRINT_AREA_INCHES`, `UNITS_PER_INCH`, `PRINT_SIZES`, `PREVIEW_WIDTH`, `PREVIEW_HEIGHT`, `HISTORY_LIMIT`, `MAX_OBJECTS_PER_SIDE`, `MAX_SIDE_JSON_CHARS`, `MAX_TEXT_CHARS`, `MAX_DESIGN_ASSET_BYTES`, `MAX_PREVIEW_BYTES`, `MAX_PRINT_BYTES`, `MAX_DESIGN_UPLOAD_BYTES`, `DESIGN_ASSET_PREFIX`, `DPI_WARN`, `DPI_BLURRY`, `DesignSide`, `DESIGN_SIDES`, `StudioFontId`, `STUDIO_FONTS`, `isStudioFontId` (T2) · `effectiveDpi`, `objectDpi`, `dpiLevel`, `dpiMessage`, `DpiLevel`, `History`, `createHistory`, `pushHistory`, `undoHistory`, `redoHistory`, `canUndo`, `canRedo`, `SideJson`, `EMPTY_SIDE`, `toSideJson`, `fontIdOf`, `fontIdsIn`, `withFontFamilies`, `validateSideJson`, `SideJsonCheck`, `safeHex`, `shadeHex`, `isDarkHex`, `shirtSvgMarkup`, `Pt`, `pinchTransform`, `clampScale`, `pngDimensions`, `designAssetFileError`, `validateImage(bytes, max)`, `storeImage(file, prefix, opts)`, `StorageAdapter.get`, `fakePng` (T2) · `CartLineDesign`, `CartLine.design`, `addItem(…, { designId })`, `designOwnerWhere`, `guestCookieHeader`, `withGuestCookie`, `DesignSideUpload`, `CreateDesignInput`, `DesignView`, `StudioProductCard`, `StudioProduct`, `designFileUrl`, `listStudioProducts`, `getStudioProduct`, `uploadDesignAsset`, `createDesignAndAddToCart`, `getDesignForOwner`, `parseDesignForm`, design routes, `DESIGN_RETENTION_DAYS`, `runPurgeDesigns`, `JOBS["purge-designs"]` (T3) · `unitPriceOf(l, fees)`, `lineName`, `toPricingLines(rows, fees)`, `reconcileCartStock` (shared stock), `snapshot(l, fees)`, `afterPaid` (by design), `OrderItemView` design fields, `CheckoutLineView.{designId, customLabel}`, `absoluteUrl`, `CustomPrintThumbs` (T4) · `STUDIO_FONT_FAMILIES`, `STUDIO_FONT_CLASSNAMES`, `ShirtSvg`, `StudioInitialDesign`, `StudioProps`, `StudioLoader`, `Studio`, `StudioTab`, `StudioPanel`, `ProductPanel`, `PriceSummary`, `SideToggle` (T5) · `FabricModule`, `StudioObjectData`, `loadFabric`, `LayerInfo`, `SelectedText`, `StudioCanvasApi`, `useStudioCanvas`, `usePinch`, `SideExport`, `exportSide`, `submitDesign`, `uploadAsset`, `UploadPanel`, `TextPanel`, `LayersPanel`, `ObjectToolbar`, `DpiChip`, `AddToCartBar` (T6) · `PrintGroupable`, `PrintGroup`, `groupPrintQueue`, `ageLabel`, `printHoldWhatsappText`, `PRINT_QUEUE_STATUSES`, `holdNoteSchema`, `PrintQueueItem`, `listPrintQueue`, `countPrintQueue`, `markItemPrinted`, `holdItem`, `releaseHold`, `getPrintFile`, `markPrintedAction`, `holdItemAction`, `releaseHoldAction`, print-file route, `AdminNav({ toShipCount, printQueueCount })`, `PrintQueueList`, `PrintItemCard`, `PrintItemActions`, `PrintItemActionsProps` (T7) · `openStudio`, `addTextToDesign`, `uploadArtwork`, `openAdminPage` (T8). Phase 1 and Phase 2 names used are listed under "Existing interfaces". Every symbol is defined in the task listed or earlier than its first use.
