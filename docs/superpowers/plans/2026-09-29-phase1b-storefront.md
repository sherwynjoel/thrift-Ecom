# Phase 1B: Storefront UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the customer-facing storefront on top of the Plan 1A foundation: the dark streetwear design system, motion utilities, animated home page, collection browsing with filters and sort, product pages with color-aware galleries and size selection, a persistent cart drawer, search, static pages, and the auth and account pages, all verified by Playwright end-to-end tests.

**Architecture:** Server Components render pages by calling the Plan 1A services directly. Mutations (cart, auth, profile) go through Server Actions that resolve the cart or session on the server, so the browser never talks to `/api/v1` for state that must persist. Client Components are small islands: filter rail, sort select, purchase panel, cart drawer, motion wrappers. Motion is opt-in through wrapper components that degrade under `prefers-reduced-motion`.

**Tech Stack:** Next.js 15 App Router (React 19, Server Actions), Tailwind CSS v4 with CSS-variable tokens, shadcn/ui primitives (Radix), `next/font` (Bebas Neue, Space Grotesk), GSAP 3 + `@gsap/react`, Lenis, `motion` (Framer Motion 12), `react-markdown`, `zustand`, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-phase1-storefront-foundation-design.md` (sections 4 and 8 are the authority for this plan). Foundation code this plan consumes is on branch `main` after Plan 1A merged.

## Global Constraints

- Node 22 and npm 11; Git Bash; the folder is OneDrive-synced so installs are slow (wait, do not retry unless a command errors).
- Money is always an integer number of paise; render with `formatPaise` from `@/lib/money` only.
- Brand name and free-shipping threshold come only from `BRAND` in `src/config/brand.ts`; nav and footer links only from `src/config/site.ts`.
- Pages and Server Actions call services in `src/server/services/*`; nothing under `src/app` or `src/components` imports `@/server/db`.
- Client Components (`"use client"`) never import from `@/server/*` except `src/server/safe-next.ts`-style pure helpers listed per task; server-only modules are imported by Server Components and actions only.
- Cart mutations from the browser use Server Actions (which set the guest cookie), never `fetch("/api/v1/cart...")`.
- Every login path redirects through `/auth/after-login?next=<path>` so the guest cart merges.
- Sizes are the fixed list `SIZES` from `src/lib/sizes.ts`; size chips render in that order.
- Design tokens (exact values) live in `src/app/globals.css`: `--bg #0A0A0A`, `--surface #141414`, `--surface-raised #1C1C1C`, `--border #2A2A2A`, `--text #F5F5F0`, `--text-muted #9A9A93`, `--accent #D4FF3F`, `--accent-ink #0A0A0A`, `--danger #FF4D4D`. Display font Bebas Neue, body Space Grotesk.
- Every motion effect checks `prefers-reduced-motion` and degrades to a fade or nothing.
- Every task ends with `npm run lint && npm run typecheck && npm test && npm run build` green; tasks that add Playwright specs also run `npm run test:e2e`.
- Commit messages end with the two trailer lines, in this order:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB`

---

## Foundation interfaces this plan consumes (from Plan 1A, verbatim)

```ts
// @/server/services/catalog
listCollections(opts?: { featuredOnly?: boolean }): Promise<CollectionSummary[]>
getCollectionBySlug(slug): Promise<CollectionSummary>            // throws NotFoundError
listProducts(args?: { collectionSlug?; filters?: ProductFilters; sort?: ProductSort; page?; pageSize? }): Promise<Page<ProductCard>>
getProductBySlug(slug): Promise<ProductDetail>                    // throws NotFoundError; images carry colorName
getRelatedProducts(productId, limit?): Promise<ProductCard[]>
getFacets(collectionSlug?): Promise<Facets>
searchProducts(q, page?, pageSize?): Promise<Page<ProductCard>>
ProductCard { id; slug; name; fit; pricePaise; compareAtPricePaise; images: {url; alt}[]; colors: {name; hex}[]; lowStock; soldOut; isCustomizable; createdAt }
ProductDetail = Omit<ProductCard,"images"> & { images: {url; alt; colorName: string|null}[]; description; fabric; variants: {id; sku; size; colorName; colorHex; pricePaise; stock}[]; collections: {slug; name}[] }
Page<T> { items; total; page; pageSize; hasMore }   CollectionSummary { id; slug; name; description; heroImageUrl; isFeatured; productCount }
Facets { sizes: string[]; colors: {name; hex}[]; fits: Fit[]; minPricePaise; maxPricePaise }
// @/lib/catalog-types: ProductSort, PRODUCT_SORTS, ProductFilters      // safe for client components
// @/lib/validation/catalog: parseProductQuery(params): { filters; sort; page }  // safe for client components
// @/server/services/cart
type CartRef = { userId } | { guestToken };  MAX_QTY_PER_LINE = 10;  EMPTY_CART
getCart(ref): Promise<CartView>; addItem(ref, variantId, qty); updateItem(ref, itemId, qty); removeItem(ref, itemId)
CartView { id; items: CartLine[]; subtotalPaise; itemCount }
CartLine { id; variantId; quantity; lineTotalPaise; product: {slug; name; imageUrl}; variant: {size; colorName; colorHex; pricePaise; stock} }
// @/server/cart-cookie: readGuestToken(); ensureGuestToken() (actions/route handlers only); clearGuestToken()
// @/server/auth: auth(), signIn(), signOut()      // Auth.js v5; session.user has id and role
// @/server/services/auth: registerUser({name,email,password}); createPasswordResetToken(email); resetPassword(token, pw); updateProfile(userId,{name}); changePassword(userId, current, next); PublicUser
// @/lib/validation/auth: registerSchema, loginSchema, resetRequestSchema, resetPasswordSchema, updateProfileSchema, changePasswordSchema
// @/server/errors: DomainError (code, message, status, details), ValidationError (details = field errors), NotFoundError
// @/server/safe-next: safeNext(raw, origin): string
// @/server/adapters/email: getEmail().send({ to, subject, html, text? })
// @/lib/money: formatPaise(paise), discountPercent(price, compareAt)
// @/lib/sizes: SIZES, isSize
// @/config/brand: BRAND { name, tagline, supportEmail, freeShippingThresholdPaise, social }
// @/config/site: SITE_NAV, FOOTER_LINKS
```

## File structure

| Path | Responsibility |
|---|---|
| `src/app/globals.css`, `src/app/layout.tsx`, `src/app/fonts.ts` | Tokens, Tailwind theme, root html/body, fonts, metadata from `BRAND` |
| `src/components/ui/*` | shadcn primitives (button, input, label, select, sheet, dialog, tabs, accordion, badge, skeleton, sonner) |
| `src/components/motion/*` | `LenisProvider`, `Reveal`, `Marquee`, `Parallax`, `PinnedStrip`, `MagneticButton`, `useReducedMotionSafe` |
| `src/server/cart-ref.ts`, `src/server/action-result.ts` | Resolve the current cart ref from session or cookie; shared Server Action result type and error mapping |
| `src/app/(storefront)/layout.tsx`, `src/components/storefront/header.tsx`, `footer.tsx`, `cart-ui.tsx`, `cart-drawer.tsx`, `cart-panel.tsx`, `cart-line.tsx` | Storefront shell, header with bag count, footer, cart drawer plumbing |
| `src/app/(storefront)/cart/actions.ts` | Server Actions: add, update, remove cart lines |
| `src/components/storefront/product-card.tsx`, `price.tsx`, `color-dots.tsx` | Product card and price display |
| `src/app/(storefront)/collections/page.tsx`, `collections/[slug]/page.tsx`, `src/components/storefront/filter-rail.tsx`, `sort-select.tsx`, `product-grid.tsx`, `load-more.tsx` | Collection index and browsing with URL-driven filters, sort, and load more |
| `src/app/(storefront)/products/[slug]/page.tsx`, `src/components/storefront/gallery.tsx`, `purchase-panel.tsx`, `size-guide.tsx`, `product-accordions.tsx`, `related-products.tsx`, `src/lib/markdown.tsx` | Product detail page |
| `src/app/(storefront)/page.tsx`, `src/components/storefront/home/*` | Home page sections |
| `src/app/(storefront)/cart/page.tsx`, `checkout/page.tsx` | Full cart page, Phase 2 placeholder |
| `src/app/(storefront)/search/page.tsx`, `pages/[slug]/page.tsx`, `customize/page.tsx`, `content/pages/*.md`, `src/server/content.ts` | Search, static markdown pages, customize teaser |
| `src/app/(auth)/layout.tsx`, `login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `src/app/(auth)/actions.ts`, `src/server/services/auth.ts` (add `requestPasswordReset`) | Auth pages and actions |
| `src/app/(storefront)/account/page.tsx`, `account/actions.ts`, `src/components/storefront/account/*` | Account page |
| `src/app/(storefront)/not-found.tsx`, `error.tsx`, `loading.tsx` | Route-level states |
| `playwright.config.ts`, `tests/e2e/*.spec.ts` | End-to-end tests |
| `tests/unit/cart-ref.test.ts`, `tests/unit/action-result.test.ts`, `tests/unit/request-password-reset.test.ts` | Unit tests for new server helpers |

---

### Task 1: Design system — fonts, tokens, Tailwind theme, shadcn primitives, root layout

**Files:**
- Create: `src/app/fonts.ts`, `components.json` (generated), `src/components/ui/*` (generated), `src/lib/utils.ts` (generated `cn`)
- Modify: `src/app/globals.css` (replace), `src/app/layout.tsx` (replace), `src/app/page.tsx` (replace with a placeholder that Task 6 overwrites), `package.json`
- Test: `tests/unit/tokens.test.ts`

**Interfaces:**
- Produces: Tailwind classes `bg-bg`, `bg-surface`, `bg-surface-raised`, `border-border`, `text-text`, `text-text-muted`, `bg-brand`, `text-brand`, `text-brand-ink`, `text-danger`, `font-display`, `font-sans`; shadcn semantic classes (`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, …) mapped onto the same palette; `displayFont`/`bodyFont` from `src/app/fonts.ts`; `cn()` from `@/lib/utils`; `<Toaster />` mounted in the root layout.

- [ ] **Step 1: Write the failing token test**

Create `tests/unit/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

const TOKENS: Record<string, string> = {
  "--bg": "#0A0A0A",
  "--surface": "#141414",
  "--surface-raised": "#1C1C1C",
  "--border": "#2A2A2A",
  "--text": "#F5F5F0",
  "--text-muted": "#9A9A93",
  "--accent": "#D4FF3F",
  "--accent-ink": "#0A0A0A",
  "--danger": "#FF4D4D",
};

describe("design tokens", () => {
  it("defines every brand token with the exact spec value", () => {
    for (const [name, value] of Object.entries(TOKENS)) {
      expect(css, name).toMatch(new RegExp(`${name}:\\s*${value};`, "i"));
    }
  });

  it("maps the shadcn semantic colors and fonts onto the tokens", () => {
    expect(css).toMatch(/--color-background:\s*var\(--bg\)/);
    expect(css).toMatch(/--color-primary:\s*var\(--accent\)/);
    expect(css).toMatch(/--color-brand:\s*var\(--accent\)/);
    expect(css).toMatch(/--font-display:\s*var\(--font-bebas\)/);
    expect(css).toMatch(/--font-sans:\s*var\(--font-grotesk\)/);
  });

  it("honours reduced motion globally", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
```

Run: `npm test -- tests/unit/tokens.test.ts`
Expected: FAIL (the scaffold `globals.css` has none of these).

- [ ] **Step 2: Initialise shadcn/ui and add the primitives**

```bash
npx --yes shadcn@latest init -d
npx --yes shadcn@latest add button input label select sheet dialog tabs accordion badge skeleton separator sonner
```

`-d` accepts the defaults (style `new-york`, base color `neutral`, CSS variables on). It creates `components.json`, `src/lib/utils.ts`, rewrites `src/app/globals.css`, and may add `tw-animate-css` and `lucide-react` to `package.json`. Confirm `ls src/components/ui` lists `button.tsx input.tsx label.tsx select.tsx sheet.tsx dialog.tsx tabs.tsx accordion.tsx badge.tsx skeleton.tsx separator.tsx sonner.tsx`. If `shadcn init` asks a question despite `-d`, answer: TypeScript yes, style New York, base color Neutral, CSS variables yes, `src/` directory yes, alias `@/components`.

- [ ] **Step 3: Fonts**

Create `src/app/fonts.ts`:

```ts
import { Bebas_Neue, Space_Grotesk } from "next/font/google";

export const displayFont = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas", display: "swap" });
export const bodyFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });
```

- [ ] **Step 4: Replace `src/app/globals.css` entirely**

```css
@import "tailwindcss";
@import "tw-animate-css";

/* ---- Brand tokens (spec section 4) ---- */
:root {
  --bg: #0A0A0A;
  --surface: #141414;
  --surface-raised: #1C1C1C;
  --border: #2A2A2A;
  --text: #F5F5F0;
  --text-muted: #9A9A93;
  --accent: #D4FF3F;
  --accent-ink: #0A0A0A;
  --danger: #FF4D4D;
  --radius: 2px;
  --marquee-duration: 30s;
}

/* ---- Tailwind theme: brand utilities + shadcn semantics on the same palette ---- */
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-brand: var(--accent);
  --color-brand-ink: var(--accent-ink);
  --color-danger: var(--danger);

  --color-background: var(--bg);
  --color-foreground: var(--text);
  --color-card: var(--surface);
  --color-card-foreground: var(--text);
  --color-popover: var(--surface-raised);
  --color-popover-foreground: var(--text);
  --color-primary: var(--accent);
  --color-primary-foreground: var(--accent-ink);
  --color-secondary: var(--surface-raised);
  --color-secondary-foreground: var(--text);
  --color-muted: var(--surface);
  --color-muted-foreground: var(--text-muted);
  --color-accent: var(--surface-raised);
  --color-accent-foreground: var(--text);
  --color-destructive: var(--danger);
  --color-destructive-foreground: var(--text);
  --color-border: var(--border);
  --color-input: var(--border);
  --color-ring: var(--accent);

  --radius-sm: 2px;
  --radius-md: 2px;
  --radius-lg: 4px;
  --radius-xl: 8px;

  --font-display: var(--font-bebas), Impact, "Arial Narrow", sans-serif;
  --font-sans: var(--font-grotesk), system-ui, sans-serif;

  --animate-marquee: marquee var(--marquee-duration) linear infinite;
}

@keyframes marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

/* ---- Base ---- */
@layer base {
  * { @apply border-border; }
  html { color-scheme: dark; scroll-behavior: auto; }
  body { @apply bg-bg text-text font-sans antialiased; }
  h1, h2, h3, .display { @apply font-display uppercase tracking-tight; }
  ::selection { background: var(--accent); color: var(--accent-ink); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: var(--surface-raised); border: 2px solid var(--bg); border-radius: 8px; }
}

/* ---- Utilities ---- */
@utility container-x {
  @apply mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10;
}

@utility text-balance {
  text-wrap: balance;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

If `tw-animate-css` was not installed by shadcn (check `package.json`), run `npm i tw-animate-css`. If the `@utility container-x` block fails to compile under the installed Tailwind, replace it with a plain class `.container-x { … }` inside `@layer utilities` and note it in the report.

- [ ] **Step 5: Root layout and placeholder home**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/config/brand";
import { bodyFont, displayFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: BRAND.tagline,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster theme="dark" position="bottom-center" />
      </body>
    </html>
  );
}
```

Replace `src/app/page.tsx` (temporary; Task 6 moves the home page into the storefront group):

```tsx
import { BRAND } from "@/config/brand";

export default function Home() {
  return (
    <main className="container-x flex min-h-dvh flex-col items-start justify-center gap-6 py-24">
      <h1 className="text-[16vw] leading-[0.85] sm:text-[12vw]">{BRAND.name}</h1>
      <p className="max-w-md text-lg text-text-muted">{BRAND.tagline}</p>
      <span className="rounded-full bg-brand px-4 py-2 font-display text-lg text-brand-ink">Storefront under construction</span>
    </main>
  );
}
```

Delete `public/next.svg`, `public/vercel.svg`, `public/file.svg`, `public/globe.svg`, `public/window.svg` (scaffold leftovers).

- [ ] **Step 6: Verify**

Run: `npm test -- tests/unit/tokens.test.ts && npm run lint && npm run typecheck && npm run build`
Expected: token tests pass; build succeeds. Start `npm run dev`, open `http://localhost:3000`, and confirm: near-black background, cream text, the brand name in Bebas Neue, the lime pill. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): add design tokens, fonts, Tailwind theme, and shadcn primitives

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 2: Motion utilities — Lenis, GSAP reveals, marquee, parallax, pinned strip, magnetic button

**Files:**
- Create: `src/components/motion/use-reduced-motion.ts`, `src/components/motion/gsap.ts`, `src/components/motion/lenis-provider.tsx`, `src/components/motion/reveal.tsx`, `src/components/motion/marquee.tsx`, `src/components/motion/parallax.tsx`, `src/components/motion/pinned-strip.tsx`, `src/components/motion/magnetic-button.tsx`, `src/components/motion/index.ts`
- Modify: `package.json`
- Test: verified by typecheck and build here; behaviour is exercised by the Playwright home test in Task 10 under both normal and `reduce` motion emulation.

**Interfaces:**
- Produces (all `"use client"`, exported from `@/components/motion`):
  - `useReducedMotionSafe(): boolean`
  - `<LenisProvider>{children}</LenisProvider>` — smooth scroll + ScrollTrigger sync; passthrough under reduced motion
  - `<Reveal as?="div" delay?=0 y?=24 once?=true className?>{children}</Reveal>`
  - `<Marquee speed?=30 pauseOnHover?=true className?>{children}</Marquee>` — `speed` is seconds per loop
  - `<Parallax amount?=40 className?>{children}</Parallax>` — pixels of travel over the scroll
  - `<PinnedStrip className? trackClassName?>{children}</PinnedStrip>` — horizontal pinned scroll on desktop pointers, native horizontal scroll otherwise
  - `<MagneticButton strength?=0.3 className? {...buttonProps}>{children}</MagneticButton>`

- [ ] **Step 1: Install**

```bash
npm i gsap @gsap/react lenis motion
```

- [ ] **Step 2: Reduced-motion hook and shared GSAP registration**

Create `src/components/motion/use-reduced-motion.ts`:

```ts
"use client";

import { useReducedMotion } from "motion/react";

/** true when the OS asks for reduced motion; false during SSR so markup matches. */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false;
}
```

Create `src/components/motion/gsap.ts`:

```ts
"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export { gsap, ScrollTrigger };
```

- [ ] **Step 3: Lenis provider**

Create `src/components/motion/lenis-provider.tsx`:

```tsx
"use client";

import { ReactLenis, useLenis } from "lenis/react";
import { useEffect } from "react";
import { ScrollTrigger, gsap } from "./gsap";
import { useReducedMotionSafe } from "./use-reduced-motion";

function ScrollTriggerSync() {
  const lenis = useLenis(() => ScrollTrigger.update());
  useEffect(() => {
    if (!lenis) return;
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => gsap.ticker.remove(tick);
  }, [lenis]);
  return null;
}

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotionSafe();
  if (reduced) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.1, smoothWheel: true, autoRaf: false }}>
      <ScrollTriggerSync />
      {children}
    </ReactLenis>
  );
}
```

If the installed `lenis` version does not accept `autoRaf` in `options`, remove that key and delete the `gsap.ticker` lines (Lenis then drives its own rAF); keep `useLenis(() => ScrollTrigger.update())`.

- [ ] **Step 4: Reveal, Parallax, Marquee**

Create `src/components/motion/reveal.tsx`:

```tsx
"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "./gsap";
import { useReducedMotionSafe } from "./use-reduced-motion";
import { cn } from "@/lib/utils";

interface RevealProps {
  as?: ElementType;
  delay?: number;
  y?: number;
  once?: boolean;
  className?: string;
  children: ReactNode;
}

export function Reveal({ as: Tag = "div", delay = 0, y = 24, once = true, className, children }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotionSafe();

  useGSAP(
    () => {
      if (!ref.current) return;
      if (reduced) {
        gsap.set(ref.current, { opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" });
        return;
      }
      gsap.fromTo(
        ref.current,
        { opacity: 0, y, clipPath: "inset(0 0 100% 0)" },
        {
          opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)", duration: 0.9, delay, ease: "power3.out",
          scrollTrigger: { trigger: ref.current, start: "top 85%", once },
        },
      );
    },
    { dependencies: [reduced], scope: ref },
  );

  return (
    <Tag ref={ref} className={cn("will-change-transform", className)} style={{ opacity: reduced ? 1 : 0 }}>
      {children}
    </Tag>
  );
}
```

Create `src/components/motion/parallax.tsx`:

```tsx
"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "./gsap";
import { useReducedMotionSafe } from "./use-reduced-motion";
import { cn } from "@/lib/utils";

export function Parallax({ amount = 40, className, children }: { amount?: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionSafe();

  useGSAP(
    () => {
      if (!ref.current || reduced) return;
      gsap.fromTo(
        ref.current,
        { y: -amount },
        { y: amount, ease: "none", scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom top", scrub: true } },
      );
    },
    { dependencies: [reduced, amount], scope: ref },
  );

  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}
```

Create `src/components/motion/marquee.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { useReducedMotionSafe } from "./use-reduced-motion";
import { cn } from "@/lib/utils";

interface MarqueeProps {
  speed?: number;
  pauseOnHover?: boolean;
  className?: string;
  children: ReactNode;
}

export function Marquee({ speed = 30, pauseOnHover = true, className, children }: MarqueeProps) {
  const reduced = useReducedMotionSafe();
  if (reduced) {
    return (
      <div className={cn("overflow-x-auto whitespace-nowrap", className)} aria-live="off">
        <div className="inline-flex items-center gap-8 px-4">{children}</div>
      </div>
    );
  }
  return (
    <div className={cn("group overflow-hidden whitespace-nowrap", className)} style={{ "--marquee-duration": `${speed}s` } as React.CSSProperties}>
      <div className={cn("inline-flex w-max animate-marquee items-center", pauseOnHover && "group-hover:[animation-play-state:paused]")}>
        <div className="inline-flex items-center gap-8 px-4">{children}</div>
        <div className="inline-flex items-center gap-8 px-4" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Pinned strip and magnetic button**

Create `src/components/motion/pinned-strip.tsx`:

```tsx
"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger, gsap } from "./gsap";
import { useReducedMotionSafe } from "./use-reduced-motion";
import { cn } from "@/lib/utils";

/** Pins the section and scrolls its track horizontally while the user scrolls vertically (fine pointers, >= 1024px). */
export function PinnedStrip({ className, trackClassName, children }: { className?: string; trackClassName?: string; children: ReactNode }) {
  const section = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionSafe();

  useGSAP(
    () => {
      if (!section.current || !track.current || reduced) return;
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px) and (pointer: fine)", () => {
        const distance = () => track.current!.scrollWidth - section.current!.clientWidth;
        const tween = gsap.to(track.current, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: section.current,
            start: "top top",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            anticipatePin: 1,
          },
        });
        return () => {
          tween.scrollTrigger?.kill();
          tween.kill();
        };
      });
      ScrollTrigger.refresh();
      return () => mm.revert();
    },
    { dependencies: [reduced], scope: section },
  );

  return (
    <div ref={section} className={cn("overflow-hidden", className)}>
      <div
        ref={track}
        className={cn("flex w-max gap-6 max-lg:w-full max-lg:snap-x max-lg:snap-mandatory max-lg:overflow-x-auto max-lg:pb-4", trackClassName)}
      >
        {children}
      </div>
    </div>
  );
}
```

Create `src/components/motion/magnetic-button.tsx`:

```tsx
"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import type { ComponentProps, PointerEvent } from "react";
import { useReducedMotionSafe } from "./use-reduced-motion";
import { cn } from "@/lib/utils";

type Props = ComponentProps<"button"> & { strength?: number };

export function MagneticButton({ strength = 0.3, className, children, ...rest }: Props) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 });
  const sy = useSpring(y, { stiffness: 300, damping: 20 });
  const reduced = useReducedMotionSafe();

  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      {...(rest as ComponentProps<typeof motion.button>)}
      style={{ x: sx, y: sy }}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={cn("inline-flex items-center justify-center rounded-full bg-brand px-8 py-4 font-display text-xl tracking-wide text-brand-ink transition-colors hover:bg-[#e6ff7a]", className)}
    >
      {children}
    </motion.button>
  );
}
```

Create `src/components/motion/index.ts`:

```ts
export { LenisProvider } from "./lenis-provider";
export { Reveal } from "./reveal";
export { Marquee } from "./marquee";
export { Parallax } from "./parallax";
export { PinnedStrip } from "./pinned-strip";
export { MagneticButton } from "./magnetic-button";
export { useReducedMotionSafe } from "./use-reduced-motion";
```

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: green. If `motion/react` types reject the `{...rest}` spread onto `motion.button`, keep the cast shown; if `@gsap/react` reports a peer-dependency warning about React 19, it is informational.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(motion): add Lenis provider, GSAP reveal, marquee, parallax, pinned strip, magnetic button

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 3: Storefront shell — cart ref, action results, layout, header, footer, cart drawer, cart actions

**Files:**
- Create: `src/server/action-result.ts`, `src/server/cart-ref.ts`, `src/app/(storefront)/layout.tsx`, `src/app/(storefront)/page.tsx` (moved from `src/app/page.tsx`), `src/app/(storefront)/cart/actions.ts`, `src/components/storefront/header.tsx`, `src/components/storefront/mobile-nav.tsx`, `src/components/storefront/footer.tsx`, `src/components/storefront/newsletter-form.tsx`, `src/components/storefront/cart-ui.ts`, `src/components/storefront/cart-drawer.tsx`, `src/components/storefront/cart-trigger.tsx`, `src/components/storefront/cart-panel.tsx`, `src/components/storefront/cart-line.tsx`, `src/components/storefront/free-shipping-bar.tsx`
- Delete: `src/app/page.tsx`
- Modify: `package.json` (zustand)
- Test: `tests/unit/action-result.test.ts`, `tests/unit/cart-ref.test.ts`

**Interfaces:**
- Produces:

```ts
// @/server/action-result (server-safe, no Next imports)
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };
export function actionError(err: unknown): ActionResult<never>;
export function zodFieldErrors(error: ZodError): Record<string, string[]>;
// @/server/cart-ref (server only)
export function resolveCartRef(opts: { create: true }): Promise<CartRef>;
export function resolveCartRef(opts: { create: false }): Promise<CartRef | null>;
export function getCurrentCart(): Promise<CartView>;
// @/app/(storefront)/cart/actions ("use server")
export function addToCartAction(input: { variantId: string; quantity: number }): Promise<ActionResult<CartView>>;
export function updateCartItemAction(itemId: string, quantity: number): Promise<ActionResult<CartView>>;
export function removeCartItemAction(itemId: string): Promise<ActionResult<CartView>>;
// @/components/storefront/cart-ui ("use client")
export const useCartUI: () => { open: boolean; setOpen: (open: boolean) => void };
// @/components/storefront/cart-panel  <CartPanel cart={CartView} variant="drawer" | "page" />
// @/components/storefront/free-shipping-bar  <FreeShippingBar subtotalPaise={number} />
```

- [ ] **Step 1: Failing tests for the two server helpers**

Create `tests/unit/action-result.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { actionError, zodFieldErrors } from "@/server/action-result";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";

describe("action-result", () => {
  it("maps domain errors to messages and validation errors to field errors", () => {
    expect(actionError(new NotFoundError("Variant"))).toEqual({ ok: false, message: "Variant not found" });
    expect(actionError(new OutOfStockError(2))).toEqual({ ok: false, message: "Only 2 left in stock" });
    expect(actionError(new ValidationError({ email: ["Invalid email"] }))).toEqual({
      ok: false, message: "Invalid input", fieldErrors: { email: ["Invalid email"] },
    });
  });

  it("hides unknown errors behind a generic message", () => {
    const r = actionError(new Error("db exploded"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toContain("exploded");
  });

  it("flattens zod issues per field", () => {
    const parsed = z.object({ name: z.string().min(2, "Too short"), age: z.number() }).safeParse({ name: "a", age: "x" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(zodFieldErrors(parsed.error)).toEqual({ name: ["Too short"], age: [expect.any(String)] });
  });
});
```

Create `tests/unit/cart-ref.test.ts` (mocks the request-scoped modules so the branching logic is testable):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const readGuestToken = vi.fn();
const ensureGuestToken = vi.fn();

vi.mock("@/server/auth", () => ({ auth: () => authMock() }));
vi.mock("@/server/cart-cookie", () => ({ readGuestToken: () => readGuestToken(), ensureGuestToken: () => ensureGuestToken(), clearGuestToken: vi.fn(), CART_COOKIE: "cart_token" }));

import { resolveCartRef } from "@/server/cart-ref";

describe("resolveCartRef", () => {
  beforeEach(() => {
    authMock.mockReset();
    readGuestToken.mockReset();
    ensureGuestToken.mockReset();
  });

  it("prefers the logged-in user", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "CUSTOMER" } });
    expect(await resolveCartRef({ create: false })).toEqual({ userId: "u1" });
    expect(ensureGuestToken).not.toHaveBeenCalled();
  });

  it("reads the guest cookie without creating one when create is false", async () => {
    authMock.mockResolvedValue(null);
    readGuestToken.mockResolvedValue("g1");
    expect(await resolveCartRef({ create: false })).toEqual({ guestToken: "g1" });
    readGuestToken.mockResolvedValue(null);
    expect(await resolveCartRef({ create: false })).toBeNull();
    expect(ensureGuestToken).not.toHaveBeenCalled();
  });

  it("mints a guest token when create is true", async () => {
    authMock.mockResolvedValue(null);
    ensureGuestToken.mockResolvedValue("fresh");
    expect(await resolveCartRef({ create: true })).toEqual({ guestToken: "fresh" });
  });
});
```

Run: `npm test -- tests/unit/action-result.test.ts tests/unit/cart-ref.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 2: Implement the helpers**

Create `src/server/action-result.ts`:

```ts
import type { ZodError } from "zod";
import { DomainError, ValidationError } from "@/server/errors";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function actionError(err: unknown): ActionResult<never> {
  if (err instanceof ValidationError) {
    return { ok: false, message: err.message, fieldErrors: (err.details as Record<string, string[]>) ?? {} };
  }
  if (err instanceof DomainError) return { ok: false, message: err.message };
  console.error("[action]", err);
  return { ok: false, message: "Something went wrong. Please try again." };
}
```

Create `src/server/cart-ref.ts`:

```ts
import { auth } from "@/server/auth";
import { ensureGuestToken, readGuestToken } from "@/server/cart-cookie";
import { EMPTY_CART, getCart, type CartRef, type CartView } from "@/server/services/cart";

export function resolveCartRef(opts: { create: true }): Promise<CartRef>;
export function resolveCartRef(opts: { create: false }): Promise<CartRef | null>;
export async function resolveCartRef(opts: { create: boolean }): Promise<CartRef | null> {
  const session = await auth();
  if (session?.user?.id) return { userId: session.user.id };
  const token = opts.create ? await ensureGuestToken() : await readGuestToken();
  return token ? { guestToken: token } : null;
}

/** Cart for the current request without creating a guest cookie (safe during render). */
export async function getCurrentCart(): Promise<CartView> {
  const ref = await resolveCartRef({ create: false });
  return ref ? getCart(ref) : EMPTY_CART;
}
```

Run: `npm test -- tests/unit/action-result.test.ts tests/unit/cart-ref.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Cart Server Actions and client UI store**

```bash
npm i zustand
```

Create `src/app/(storefront)/cart/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, type ActionResult } from "@/server/action-result";
import { resolveCartRef } from "@/server/cart-ref";
import { addItem, MAX_QTY_PER_LINE, removeItem, updateItem, type CartView } from "@/server/services/cart";
import { ValidationError } from "@/server/errors";

const addSchema = z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE) });

export async function addToCartAction(input: { variantId: string; quantity: number }): Promise<ActionResult<CartView>> {
  try {
    const parsed = addSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError({ quantity: ["Choose a quantity between 1 and 10"] });
    const ref = await resolveCartRef({ create: true });
    const cart = await addItem(ref, parsed.data.variantId, parsed.data.quantity);
    revalidatePath("/", "layout");
    return { ok: true, data: cart };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateCartItemAction(itemId: string, quantity: number): Promise<ActionResult<CartView>> {
  try {
    const ref = await resolveCartRef({ create: true });
    const cart = await updateItem(ref, itemId, quantity);
    revalidatePath("/", "layout");
    return { ok: true, data: cart };
  } catch (err) {
    return actionError(err);
  }
}

export async function removeCartItemAction(itemId: string): Promise<ActionResult<CartView>> {
  try {
    const ref = await resolveCartRef({ create: true });
    const cart = await removeItem(ref, itemId);
    revalidatePath("/", "layout");
    return { ok: true, data: cart };
  } catch (err) {
    return actionError(err);
  }
}
```

Create `src/components/storefront/cart-ui.ts`:

```ts
"use client";

import { create } from "zustand";

interface CartUIState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useCartUI = create<CartUIState>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
```

- [ ] **Step 4: Cart drawer, trigger, panel, line, free-shipping bar**

Create `src/components/storefront/free-shipping-bar.tsx`:

```tsx
import { BRAND } from "@/config/brand";
import { formatPaise } from "@/lib/money";

export function FreeShippingBar({ subtotalPaise }: { subtotalPaise: number }) {
  const threshold = BRAND.freeShippingThresholdPaise;
  const remaining = Math.max(0, threshold - subtotalPaise);
  const pct = Math.min(100, Math.round((subtotalPaise / threshold) * 100));
  return (
    <div className="space-y-2" data-testid="free-shipping-bar">
      <p className="text-sm text-text-muted">
        {remaining === 0 ? (
          <span className="text-brand">You get free delivery on this order.</span>
        ) : (
          <>Add {formatPaise(remaining)} more for free delivery.</>
        )}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

Create `src/components/storefront/cart-line.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Minus, Plus, X } from "lucide-react";
import { removeCartItemAction, updateCartItemAction } from "@/app/(storefront)/cart/actions";
import { formatPaise } from "@/lib/money";
import type { CartLine as Line } from "@/server/services/cart";
import { MAX_QTY_PER_LINE } from "@/server/services/cart";

export function CartLine({ line }: { line: Line }) {
  const [pending, start] = useTransition();
  const max = Math.min(MAX_QTY_PER_LINE, line.variant.stock);

  const setQty = (q: number) =>
    start(async () => {
      const r = await updateCartItemAction(line.id, q);
      if (!r.ok) toast.error(r.message);
    });
  const remove = () =>
    start(async () => {
      const r = await removeCartItemAction(line.id);
      if (!r.ok) toast.error(r.message);
    });

  return (
    <li className="flex gap-4 py-4" data-testid="cart-line" aria-busy={pending}>
      <Link href={`/products/${line.product.slug}`} className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-sm bg-surface">
        {line.product.imageUrl && <Image src={line.product.imageUrl} alt={line.product.name} fill sizes="80px" className="object-cover" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/products/${line.product.slug}`} className="line-clamp-2 text-sm font-medium">{line.product.name}</Link>
          <button type="button" onClick={remove} aria-label={`Remove ${line.product.name}`} className="text-text-muted hover:text-text">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-xs text-text-muted">{line.variant.colorName} / {line.variant.size}</p>
        <div className="mt-auto flex items-center justify-between">
          <div className="inline-flex items-center rounded-full border border-border">
            <button type="button" onClick={() => setQty(line.quantity - 1)} disabled={pending} aria-label="Decrease quantity" className="px-2 py-1 disabled:opacity-40"><Minus className="size-3" /></button>
            <span className="min-w-6 text-center text-sm" data-testid="cart-line-qty">{line.quantity}</span>
            <button type="button" onClick={() => setQty(line.quantity + 1)} disabled={pending || line.quantity >= max} aria-label="Increase quantity" className="px-2 py-1 disabled:opacity-40"><Plus className="size-3" /></button>
          </div>
          <span className="font-display text-lg">{formatPaise(line.lineTotalPaise)}</span>
        </div>
      </div>
    </li>
  );
}
```

`import { MAX_QTY_PER_LINE } from "@/server/services/cart"` from a client component is allowed here because that module has no side effects beyond Prisma imports at module scope: **it does not**, it imports `@/server/db`. So instead add `export const MAX_QTY_PER_LINE = 10;` to `src/lib/catalog-types.ts` and have `src/server/services/cart.ts` import and re-export it from there (`import { MAX_QTY_PER_LINE } from "@/lib/catalog-types"; export { MAX_QTY_PER_LINE };`). The client component then imports `MAX_QTY_PER_LINE` from `@/lib/catalog-types`, and `type { CartLine }` (type-only imports are erased and safe). Apply that in this step.

Create `src/components/storefront/cart-panel.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import type { CartView } from "@/server/services/cart";
import { CartLine } from "./cart-line";
import { FreeShippingBar } from "./free-shipping-bar";

export function CartPanel({ cart, variant }: { cart: CartView; variant: "drawer" | "page" }) {
  if (cart.items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center" data-testid="cart-empty">
        <p className="font-display text-3xl">Your bag is empty</p>
        <p className="text-sm text-text-muted">Fresh drops are one click away.</p>
        <Button asChild><Link href="/collections/new-drops">Shop new drops</Link></Button>
      </div>
    );
  }
  return (
    <div className={variant === "page" ? "grid gap-10 lg:grid-cols-[1fr_360px]" : "flex flex-1 flex-col"}>
      <ul className="divide-y divide-border" data-testid="cart-lines">
        {cart.items.map((line) => <CartLine key={line.id} line={line} />)}
      </ul>
      <div className={variant === "page" ? "h-fit rounded-md border border-border bg-surface p-6" : "mt-auto border-t border-border pt-4"}>
        <FreeShippingBar subtotalPaise={cart.subtotalPaise} />
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-text-muted">Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})</span>
          <span className="font-display text-2xl" data-testid="cart-subtotal">{formatPaise(cart.subtotalPaise)}</span>
        </div>
        <p className="mt-1 text-xs text-text-muted">Taxes included. Shipping calculated at checkout.</p>
        <Button asChild size="lg" className="mt-4 w-full font-display text-lg tracking-wide">
          <Link href="/checkout">Checkout</Link>
        </Button>
        {variant === "drawer" && (
          <Link href="/cart" className="mt-3 block text-center text-sm text-text-muted underline-offset-4 hover:underline">View full bag</Link>
        )}
      </div>
    </div>
  );
}
```

Create `src/components/storefront/cart-drawer.tsx`:

```tsx
"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCartUI } from "./cart-ui";

export function CartDrawer({ itemCount, children }: { itemCount: number; children: React.ReactNode }) {
  const { open, setOpen } = useCartUI();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col bg-bg sm:max-w-md" data-testid="cart-drawer">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl uppercase tracking-tight">Your bag ({itemCount})</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col overflow-y-auto px-1">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
```

Create `src/components/storefront/cart-trigger.tsx`:

```tsx
"use client";

import { ShoppingBag } from "lucide-react";
import { useCartUI } from "./cart-ui";

export function CartTrigger({ count }: { count: number }) {
  const setOpen = useCartUI((s) => s.setOpen);
  return (
    <button type="button" onClick={() => setOpen(true)} className="relative p-2" aria-label={`Open bag, ${count} items`} data-testid="cart-trigger">
      <ShoppingBag className="size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-brand-ink" data-testid="cart-count">{count}</span>
      )}
    </button>
  );
}
```

- [ ] **Step 5: Header, mobile nav, footer, newsletter form**

Create `src/components/storefront/mobile-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SITE_NAV } from "@/config/site";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="p-2 lg:hidden" aria-label="Open menu"><Menu className="size-5" /></SheetTrigger>
      <SheetContent side="left" className="bg-bg">
        <SheetTitle className="font-display text-2xl uppercase">Menu</SheetTitle>
        <nav className="mt-8 flex flex-col gap-4">
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="font-display text-3xl uppercase tracking-tight">{item.label}</Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
```

Create `src/components/storefront/header.tsx`:

```tsx
import Link from "next/link";
import { Search, User } from "lucide-react";
import { BRAND } from "@/config/brand";
import { SITE_NAV } from "@/config/site";
import { CartTrigger } from "./cart-trigger";
import { MobileNav } from "./mobile-nav";

export function Header({ cartCount, isLoggedIn }: { cartCount: number; isLoggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur" data-testid="site-header">
      <div className="container-x flex h-16 items-center gap-4">
        <MobileNav />
        <Link href="/" className="font-display text-3xl uppercase tracking-tight" aria-label={`${BRAND.name} home`}>{BRAND.name}</Link>
        <nav className="ml-8 hidden items-center gap-6 lg:flex">
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm uppercase tracking-wide text-text-muted transition-colors hover:text-text">{item.label}</Link>
          ))}
        </nav>
        <form action="/search" className="ml-auto hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 md:flex" role="search">
          <Search className="size-4 text-text-muted" />
          <input name="q" placeholder="Search tees" className="w-40 bg-transparent text-sm outline-none placeholder:text-text-muted" aria-label="Search products" />
        </form>
        <Link href="/search" className="ml-auto p-2 md:hidden" aria-label="Search"><Search className="size-5" /></Link>
        <Link href={isLoggedIn ? "/account" : "/login"} className="p-2" aria-label={isLoggedIn ? "Account" : "Log in"} data-testid="account-link"><User className="size-5" /></Link>
        <CartTrigger count={cartCount} />
      </div>
    </header>
  );
}
```

Create `src/components/storefront/newsletter-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        toast.success("You're on the list.");
        setEmail("");
      }}
    >
      <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for drops and offers" aria-label="Email" className="bg-surface" />
      <Button type="submit" variant="secondary">Join</Button>
    </form>
  );
}
```

Create `src/components/storefront/footer.tsx`:

```tsx
import Link from "next/link";
import { BRAND } from "@/config/brand";
import { FOOTER_LINKS } from "@/config/site";
import { NewsletterForm } from "./newsletter-form";

const GROUPS: { title: string; links: readonly { label: string; href: string }[] }[] = [
  { title: "Shop", links: FOOTER_LINKS.shop },
  { title: "Help", links: FOOTER_LINKS.help },
  { title: "Company", links: FOOTER_LINKS.company },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-surface" data-testid="site-footer">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <p className="font-display text-4xl uppercase tracking-tight">{BRAND.name}</p>
          <p className="max-w-xs text-sm text-text-muted">{BRAND.tagline}</p>
          <NewsletterForm />
          <div className="flex gap-4 text-sm text-text-muted">
            <a href={BRAND.social.instagram} target="_blank" rel="noreferrer" className="hover:text-text">Instagram</a>
            <a href={BRAND.social.youtube} target="_blank" rel="noreferrer" className="hover:text-text">YouTube</a>
          </div>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-4 font-display text-xl uppercase">{g.title}</p>
            <ul className="space-y-2 text-sm text-text-muted">
              {g.links.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:text-text">{l.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-text-muted">
        © {new Date().getFullYear()} {BRAND.name}. Made in India.
      </div>
    </footer>
  );
}
```

- [ ] **Step 6: Storefront layout and moved home placeholder**

Create `src/app/(storefront)/layout.tsx`:

```tsx
import { LenisProvider } from "@/components/motion";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartPanel } from "@/components/storefront/cart-panel";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { auth } from "@/server/auth";
import { getCurrentCart } from "@/server/cart-ref";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const [session, cart] = await Promise.all([auth(), getCurrentCart()]);
  return (
    <LenisProvider>
      <Header cartCount={cart.itemCount} isLoggedIn={Boolean(session?.user?.id)} />
      <main className="min-h-[70dvh]">{children}</main>
      <Footer />
      <CartDrawer itemCount={cart.itemCount}>
        <CartPanel cart={cart} variant="drawer" />
      </CartDrawer>
    </LenisProvider>
  );
}
```

Move `src/app/page.tsx` to `src/app/(storefront)/page.tsx` (`git mv`), and change its outer `<main …>` to a `<section …>` (the layout now owns `<main>`).

- [ ] **Step 7: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: green; the route table shows `/` under the storefront group. Start `npm run dev`, open `/`, confirm the header, footer, and that clicking the bag icon opens an empty drawer. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(storefront): add shell layout, header, footer, cart drawer, and cart actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 4: Product cards and collection browsing — filters, sort, load more, collections index

**Files:**
- Create: `src/lib/query-string.ts`, `src/components/storefront/price.tsx`, `src/components/storefront/color-dots.tsx`, `src/components/storefront/product-card.tsx`, `src/components/storefront/product-grid.tsx`, `src/components/storefront/filter-rail.tsx`, `src/components/storefront/sort-select.tsx`, `src/components/storefront/load-more.tsx`, `src/app/(storefront)/collections/page.tsx`, `src/app/(storefront)/collections/[slug]/page.tsx`, `src/app/(storefront)/collections/[slug]/loading.tsx`
- Modify: `next.config.ts` (allow SVG images)
- Test: `tests/unit/query-string.test.ts`

**Interfaces:**
- Produces:

```ts
// @/lib/query-string (client-safe, pure)
export function toggleListParam(params: URLSearchParams, key: string, value: string): URLSearchParams;  // add/remove one value in a comma list, drops "page"
export function setParam(params: URLSearchParams, key: string, value: string | null): URLSearchParams; // set or delete, drops "page"
export function clearFilterParams(params: URLSearchParams): URLSearchParams;                             // keeps only "sort"
// components
<Price pricePaise compareAtPricePaise? size?="md"|"lg" />
<ColorDots colors={{name;hex}[]} />
<ProductCard product={ProductCard} priority? />
<ProductGrid products={ProductCard[]} emptyMessage? />
<FilterRail facets={Facets} />              // "use client"; reads/writes the URL
<SortSelect />                              // "use client"
<LoadMore endpoint={string} initialPage={number} hasMore={boolean} />   // endpoint already carries the query string; appends &page=N
```

- [ ] **Step 1: Failing query-string tests**

Create `tests/unit/query-string.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clearFilterParams, setParam, toggleListParam } from "@/lib/query-string";

describe("query-string", () => {
  it("toggles a value inside a comma list and resets paging", () => {
    let p = new URLSearchParams("size=S&page=3");
    p = toggleListParam(p, "size", "M");
    expect(p.get("size")).toBe("S,M");
    expect(p.has("page")).toBe(false);
    p = toggleListParam(p, "size", "S");
    expect(p.get("size")).toBe("M");
    p = toggleListParam(p, "size", "M");
    expect(p.has("size")).toBe(false);
  });

  it("sets or deletes a scalar and resets paging", () => {
    let p = new URLSearchParams("sort=newest&page=2");
    p = setParam(p, "minPrice", "50000");
    expect(p.get("minPrice")).toBe("50000");
    expect(p.has("page")).toBe(false);
    p = setParam(p, "minPrice", null);
    expect(p.has("minPrice")).toBe(false);
  });

  it("clears filters but keeps sort", () => {
    const p = clearFilterParams(new URLSearchParams("size=S&color=Black&sort=price-asc&page=4"));
    expect([...p.keys()]).toEqual(["sort"]);
  });
});
```

Run: `npm test -- tests/unit/query-string.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 2: Implement the pure helper**

Create `src/lib/query-string.ts`:

```ts
function clone(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  next.delete("page");
  return next;
}

export function toggleListParam(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = clone(params);
  const current = (next.get(key) ?? "").split(",").filter(Boolean);
  const list = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  if (list.length) next.set(key, list.join(","));
  else next.delete(key);
  return next;
}

export function setParam(params: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = clone(params);
  if (value === null || value === "") next.delete(key);
  else next.set(key, value);
  return next;
}

export function clearFilterParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  const sort = params.get("sort");
  if (sort) next.set("sort", sort);
  return next;
}
```

Run the test again — Expected: PASS.

- [ ] **Step 3: Allow SVG product images in `next/image`**

`next.config.ts`:

```ts
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: process.env.S3_PUBLIC_BASE_URL
      ? [{ protocol: "https", hostname: new URL(process.env.S3_PUBLIC_BASE_URL).hostname }]
      : [],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Price, color dots, product card, grid**

Create `src/components/storefront/price.tsx`:

```tsx
import { discountPercent, formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export function Price({ pricePaise, compareAtPricePaise, size = "md" }: { pricePaise: number; compareAtPricePaise?: number | null; size?: "md" | "lg" }) {
  const off = discountPercent(pricePaise, compareAtPricePaise);
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2", size === "lg" ? "text-3xl" : "text-lg")} data-testid="price">
      <span className="font-display">{formatPaise(pricePaise)}</span>
      {off !== null && compareAtPricePaise && (
        <>
          <s className="text-sm text-text-muted">{formatPaise(compareAtPricePaise)}</s>
          <span className="text-sm font-medium text-brand">{off}% off</span>
        </>
      )}
    </p>
  );
}
```

Create `src/components/storefront/color-dots.tsx`:

```tsx
export function ColorDots({ colors }: { colors: { name: string; hex: string }[] }) {
  if (!colors.length) return null;
  return (
    <ul className="flex items-center gap-1.5" aria-label="Available colors">
      {colors.slice(0, 5).map((c) => (
        <li key={c.name} title={c.name} className="size-3 rounded-full border border-border" style={{ backgroundColor: c.hex }} />
      ))}
      {colors.length > 5 && <li className="text-xs text-text-muted">+{colors.length - 5}</li>}
    </ul>
  );
}
```

Create `src/components/storefront/product-card.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ProductCard as Card } from "@/server/services/catalog";
import { ColorDots } from "./color-dots";
import { Price } from "./price";

const FIT_LABEL: Record<Card["fit"], string> = { OVERSIZED: "Oversized", REGULAR: "Regular", RELAXED: "Relaxed" };

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const [front, back] = product.images;
  return (
    <article className="group" data-testid="product-card">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-surface">
          {front && <Image src={front.url} alt={front.alt} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />}
          {back && <Image src={back.url} alt="" fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" aria-hidden="true" />}
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            <Badge variant="secondary" className="uppercase">{FIT_LABEL[product.fit]}</Badge>
            {product.soldOut && <Badge variant="destructive" className="uppercase">Sold out</Badge>}
            {!product.soldOut && product.lowStock && <Badge className="uppercase">Low stock</Badge>}
            {product.isCustomizable && <Badge variant="outline" className="uppercase">Customizable</Badge>}
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <h3 className="line-clamp-2 font-sans text-sm font-medium normal-case tracking-normal">{product.name}</h3>
          <Price pricePaise={product.pricePaise} compareAtPricePaise={product.compareAtPricePaise} />
          <ColorDots colors={product.colors} />
        </div>
      </Link>
    </article>
  );
}
```

Create `src/components/storefront/product-grid.tsx`:

```tsx
import type { ProductCard as Card } from "@/server/services/catalog";
import { ProductCard } from "./product-card";

export function ProductGrid({ products, emptyMessage = "Nothing here yet." }: { products: Card[]; emptyMessage?: string }) {
  if (!products.length) {
    return <p className="py-20 text-center text-text-muted" data-testid="empty-grid">{emptyMessage}</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4" data-testid="product-grid">
      {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
    </div>
  );
}
```

- [ ] **Step 5: Filter rail, sort select, load more (client)**

Create `src/components/storefront/sort-select.tsx`:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRODUCT_SORTS, type ProductSort } from "@/lib/catalog-types";
import { setParam } from "@/lib/query-string";

const LABELS: Record<ProductSort, string> = { featured: "Featured", newest: "Newest", "price-asc": "Price: low to high", "price-desc": "Price: high to low" };

export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get("sort") as ProductSort | null) ?? "featured";
  return (
    <Select value={current} onValueChange={(v) => router.replace(`${pathname}?${setParam(params, "sort", v === "featured" ? null : v)}`, { scroll: false })}>
      <SelectTrigger className="w-48 bg-surface" aria-label="Sort by" data-testid="sort-select"><SelectValue /></SelectTrigger>
      <SelectContent>
        {PRODUCT_SORTS.map((s) => <SelectItem key={s} value={s}>{LABELS[s]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
```

Create `src/components/storefront/filter-rail.tsx`:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Facets } from "@/server/services/catalog";
import { clearFilterParams, setParam, toggleListParam } from "@/lib/query-string";
import { cn } from "@/lib/utils";

const FIT_LABEL: Record<string, string> = { OVERSIZED: "Oversized", REGULAR: "Regular", RELAXED: "Relaxed" };

function useQueryNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (next: URLSearchParams) => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  return { params, go };
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2 border-b border-border py-4">
      <legend className="font-display text-lg uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function Filters({ facets }: { facets: Facets }) {
  const { params, go } = useQueryNav();
  const has = (key: string, v: string) => (params.get(key) ?? "").split(",").includes(v);
  const [min, setMin] = useState(params.get("minPrice") ? String(Number(params.get("minPrice")) / 100) : "");
  const [max, setMax] = useState(params.get("maxPrice") ? String(Number(params.get("maxPrice")) / 100) : "");
  const applyPrice = () => {
    let next = setParam(params, "minPrice", min ? String(Math.round(Number(min) * 100)) : null);
    next = setParam(next, "maxPrice", max ? String(Math.round(Number(max) * 100)) : null);
    go(next);
  };
  return (
    <div data-testid="filter-rail">
      <Group title="Size">
        <div className="flex flex-wrap gap-2">
          {facets.sizes.map((s) => (
            <button key={s} type="button" onClick={() => go(toggleListParam(params, "size", s))} aria-pressed={has("size", s)} className={cn("min-w-10 rounded-full border px-3 py-1 text-sm", has("size", s) ? "border-brand bg-brand text-brand-ink" : "border-border hover:border-text")}>{s}</button>
          ))}
        </div>
      </Group>
      <Group title="Color">
        <div className="flex flex-wrap gap-2">
          {facets.colors.map((c) => (
            <button key={c.name} type="button" onClick={() => go(toggleListParam(params, "color", c.name))} aria-pressed={has("color", c.name)} aria-label={c.name} title={c.name} className={cn("size-7 rounded-full border-2", has("color", c.name) ? "border-brand" : "border-border")} style={{ backgroundColor: c.hex }} />
          ))}
        </div>
      </Group>
      <Group title="Fit">
        <div className="flex flex-col gap-2 text-sm">
          {facets.fits.map((f) => (
            <label key={f} className="flex items-center gap-2">
              <input type="checkbox" checked={has("fit", f)} onChange={() => go(toggleListParam(params, "fit", f))} className="accent-brand" />
              {FIT_LABEL[f] ?? f}
            </label>
          ))}
        </div>
      </Group>
      <Group title="Price">
        <div className="flex items-center gap-2 text-sm">
          <input type="number" inputMode="numeric" min={0} placeholder={String(Math.floor(facets.minPricePaise / 100))} value={min} onChange={(e) => setMin(e.target.value)} className="w-20 rounded-sm border border-border bg-surface px-2 py-1" aria-label="Minimum price" />
          <span className="text-text-muted">to</span>
          <input type="number" inputMode="numeric" min={0} placeholder={String(Math.ceil(facets.maxPricePaise / 100))} value={max} onChange={(e) => setMax(e.target.value)} className="w-20 rounded-sm border border-border bg-surface px-2 py-1" aria-label="Maximum price" />
          <Button type="button" size="sm" variant="secondary" onClick={applyPrice}>Go</Button>
        </div>
      </Group>
      <button type="button" onClick={() => go(clearFilterParams(params))} className="mt-4 text-sm text-text-muted underline-offset-4 hover:underline" data-testid="clear-filters">Clear all</button>
    </div>
  );
}

export function FilterRail({ facets }: { facets: Facets }) {
  return (
    <>
      <aside className="hidden w-60 shrink-0 lg:block"><Filters facets={facets} /></aside>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="secondary" className="lg:hidden" data-testid="open-filters"><SlidersHorizontal className="mr-2 size-4" />Filters</Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto bg-bg">
          <SheetTitle className="font-display text-2xl uppercase">Filters</SheetTitle>
          <Filters facets={facets} />
        </SheetContent>
      </Sheet>
    </>
  );
}
```

Create `src/components/storefront/load-more.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProductCard as Card } from "@/server/services/catalog";
import { ProductCard } from "./product-card";

type PageJson = { data: { items: Card[]; hasMore: boolean } } | { error: { message: string } };

export function LoadMore({ endpoint, initialPage, hasMore }: { endpoint: string; initialPage: number; hasMore: boolean }) {
  const [items, setItems] = useState<Card[]>([]);
  const [page, setPage] = useState(initialPage);
  const [more, setMore] = useState(hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const sep = endpoint.includes("?") ? "&" : "?";
      const res = await fetch(`${endpoint}${sep}page=${page + 1}`);
      const json = (await res.json()) as PageJson;
      if ("error" in json) throw new Error(json.error.message);
      setItems((prev) => [...prev, ...json.data.items]);
      setMore(json.data.hasMore);
      setPage((p) => p + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 space-y-8">
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
      {error && <p className="text-center text-sm text-danger">{error}</p>}
      {more && (
        <div className="text-center">
          <Button variant="secondary" size="lg" onClick={load} disabled={loading} data-testid="load-more">{loading ? "Loading…" : "Load more"}</Button>
        </div>
      )}
    </div>
  );
}
```

`ProductCard` is imported by this client component: it is a plain component with only type imports from the service module, so it is client-safe. If the build complains that `@/server/services/catalog` is pulled into the client bundle, change the two `import type { ProductCard as Card } from "@/server/services/catalog"` lines (in `product-card.tsx`, `product-grid.tsx`, `load-more.tsx`) to import the type from a new `src/lib/catalog-view-types.ts` that re-exports `export type { ProductCard, ProductDetail, Facets, CollectionSummary, Page } from "@/server/services/catalog";` — type-only re-exports are erased at build time.

- [ ] **Step 6: Collection pages**

Create `src/app/(storefront)/collections/[slug]/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container-x py-10">
      <Skeleton className="mb-8 h-14 w-64" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}
      </div>
    </div>
  );
}
```

Create `src/app/(storefront)/collections/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FilterRail } from "@/components/storefront/filter-rail";
import { LoadMore } from "@/components/storefront/load-more";
import { ProductGrid } from "@/components/storefront/product-grid";
import { SortSelect } from "@/components/storefront/sort-select";
import { NotFoundError } from "@/server/errors";
import { getCollectionBySlug, getFacets, listProducts } from "@/server/services/catalog";
import { parseProductQuery } from "@/lib/validation/catalog";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(slug: string) {
  try {
    return await getCollectionBySlug(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const collection = await load(slug);
  return { title: collection.name, description: collection.description || undefined };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const collection = await load(slug);
  const { filters, sort, page } = parseProductQuery(sp);
  const [products, facets] = await Promise.all([listProducts({ collectionSlug: slug, filters, sort, page }), getFacets(slug)]);
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "page") query.set(k, v);
  const endpoint = `/api/v1/collections/${slug}/products${query.size ? `?${query}` : ""}`;

  return (
    <div className="container-x py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl md:text-7xl">{collection.name}</h1>
          <p className="mt-2 max-w-xl text-text-muted">{collection.description}</p>
          <p className="mt-1 text-sm text-text-muted" data-testid="result-count">{products.total} products</p>
        </div>
        <SortSelect />
      </header>
      <div className="flex gap-10">
        <FilterRail facets={facets} />
        <section className="min-w-0 flex-1">
          <ProductGrid products={products.items} emptyMessage="No tees match those filters." />
          <LoadMore key={endpoint} endpoint={endpoint} initialPage={products.page} hasMore={products.hasMore} />
        </section>
      </div>
    </div>
  );
}
```

Create `src/app/(storefront)/collections/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listCollections } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsIndex() {
  const collections = await listCollections();
  return (
    <div className="container-x py-10">
      <h1 className="mb-8 text-5xl md:text-7xl">Collections</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((c) => (
          <Link key={c.id} href={`/collections/${c.slug}`} className="group relative aspect-[4/3] overflow-hidden rounded-sm bg-surface" data-testid="collection-card">
            {c.heroImageUrl && <Image src={c.heroImageUrl} alt="" fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover opacity-70 transition-transform duration-700 group-hover:scale-105" />}
            <div className="absolute inset-0 flex flex-col justify-end p-6">
              <span className="font-display text-4xl uppercase">{c.name}</span>
              <span className="text-sm text-text-muted">{c.productCount} products</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`. Then `npm run dev` and check `/collections/new-drops`: grid renders seed products, clicking a size chip updates the URL (`?size=M`) and the grid, the sort select changes order, "Load more" appears only when more than 24 products exist (the seed has 16 in total, so check `/collections/oversized-tees` shows no button), and `/collections` lists five collections. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(storefront): add product cards and collection browsing with filters, sort, and load more

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 5: Product detail page — color-aware gallery, size selection, add to cart, accordions, related products

**Files:**
- Create: `src/server/content.ts`, `src/lib/markdown.tsx`, `content/pages/shipping.md`, `content/pages/returns.md`, `src/components/storefront/gallery.tsx`, `src/components/storefront/size-guide.tsx`, `src/components/storefront/product-purchase.tsx`, `src/components/storefront/product-accordions.tsx`, `src/components/storefront/related-products.tsx`, `src/app/(storefront)/products/[slug]/page.tsx`, `src/app/(storefront)/products/[slug]/loading.tsx`
- Modify: `package.json` (react-markdown)
- Test: `tests/unit/content.test.ts`, `tests/unit/variant-matrix.test.ts`

**Interfaces:**
- Produces:

```ts
// @/server/content (server only; reads content/pages/*.md)
export function readPage(slug: string): Promise<{ title: string; body: string } | null>;   // null when the file is missing or slug is not [a-z0-9-]
// @/lib/variant-matrix (client-safe, pure)
export function colorsOf(variants: V[]): { name: string; hex: string }[];                   // first-seen order
export function sizesFor(variants: V[], colorName: string): { size: string; stock: number; variantId: string; pricePaise: number }[]; // ordered by SIZES
export function defaultColor(variants: V[]): string | null;                                 // first color with any stock, else first color
// components
<Markdown source={string} />
<Gallery images={{url; alt; colorName}[]} activeColor={string|null} productName={string} />
<SizeGuide fit={Fit} />
<ProductPurchase product={ProductDetail} />          // "use client"; owns color/size/qty state, gallery, sticky bar
<ProductAccordions product={ProductDetail} shipping={string} returns={string} />
<RelatedProducts products={ProductCard[]} />
```

- [ ] **Step 1: Failing tests for content reader and variant matrix**

Create `tests/unit/content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readPage } from "@/server/content";

describe("readPage", () => {
  it("reads a markdown page and splits the title", async () => {
    const page = await readPage("shipping");
    expect(page?.title).toBe("Shipping");
    expect(page?.body).toContain("prepaid");
  });

  it("returns null for missing or unsafe slugs", async () => {
    expect(await readPage("does-not-exist")).toBeNull();
    expect(await readPage("../package")).toBeNull();
  });
});
```

Create `tests/unit/variant-matrix.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { colorsOf, defaultColor, sizesFor } from "@/lib/variant-matrix";

const v = (size: string, colorName: string, stock: number, pricePaise = 59900) => ({ id: `${colorName}-${size}`, sku: "", size, colorName, colorHex: "#000", stock, pricePaise });

describe("variant-matrix", () => {
  const variants = [v("L", "Black", 0), v("S", "Black", 2), v("M", "White", 5), v("XL", "White", 0)];

  it("lists colors in first-seen order", () => {
    expect(colorsOf(variants).map((c) => c.name)).toEqual(["Black", "White"]);
  });

  it("orders sizes by the canonical size list for one color", () => {
    expect(sizesFor(variants, "Black").map((s) => s.size)).toEqual(["S", "L"]);
    expect(sizesFor(variants, "White").map((s) => s.stock)).toEqual([5, 0]);
  });

  it("defaults to the first color that has stock", () => {
    expect(defaultColor(variants)).toBe("Black");
    expect(defaultColor([v("M", "Red", 0), v("M", "Blue", 1)])).toBe("Blue");
    expect(defaultColor([v("M", "Red", 0)])).toBe("Red");
    expect(defaultColor([])).toBeNull();
  });
});
```

Run: `npm test -- tests/unit/content.test.ts tests/unit/variant-matrix.test.ts` — Expected: FAIL, modules and content missing.

- [ ] **Step 2: Content reader, markdown, page files**

```bash
npm i react-markdown
```

Create `content/pages/shipping.md`:

```markdown
# Shipping

We ship everywhere in India. Orders are prepaid and we start printing within 1 to 2 working days.

- **Metros:** 2 to 4 days after dispatch
- **Rest of India:** 4 to 7 days after dispatch
- **Free delivery** on orders over ₹999. Under that, a flat ₹79 delivery fee applies at checkout.

You will get a tracking link by email as soon as the courier picks up your parcel.
```

Create `content/pages/returns.md`:

```markdown
# Returns & Exchange

Changed your mind? You have **7 days** from delivery to request a size exchange or a return.

- Items must be unworn, unwashed, and in original packaging.
- Custom-printed tees are made for you and cannot be returned, unless there is a print defect.
- Refunds go back to the original payment method within 5 to 7 working days after we receive the item.

Write to us from your account page and we will arrange the pickup.
```

Create `src/server/content.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(process.cwd(), "content", "pages");

export async function readPage(slug: string): Promise<{ title: string; body: string } | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    const raw = await readFile(join(ROOT, `${slug}.md`), "utf8");
    const lines = raw.split(/\r?\n/);
    const titleIdx = lines.findIndex((l) => l.startsWith("# "));
    const title = titleIdx >= 0 ? lines[titleIdx].slice(2).trim() : slug;
    const body = lines.filter((_, i) => i !== titleIdx).join("\n").trim();
    return { title, body };
  } catch {
    return null;
  }
}
```

Create `src/lib/markdown.tsx`:

```tsx
import ReactMarkdown from "react-markdown";

export function Markdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      components={{
        h2: ({ children }) => <h2 className="mt-6 text-2xl">{children}</h2>,
        h3: ({ children }) => <h3 className="mt-4 text-xl">{children}</h3>,
        p: ({ children }) => <p className="my-3 leading-relaxed text-text-muted">{children}</p>,
        ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 text-text-muted">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5 text-text-muted">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
        a: ({ href, children }) => <a href={href} className="text-brand underline-offset-4 hover:underline">{children}</a>,
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
```

- [ ] **Step 3: Variant matrix helper**

Create `src/lib/variant-matrix.ts`:

```ts
import { SIZES } from "@/lib/sizes";

export interface VariantLike {
  id: string;
  size: string;
  colorName: string;
  colorHex: string;
  stock: number;
  pricePaise: number;
}

const order = new Map<string, number>(SIZES.map((s, i) => [s, i]));

export function colorsOf(variants: VariantLike[]): { name: string; hex: string }[] {
  const seen = new Map<string, string>();
  for (const v of variants) if (!seen.has(v.colorName)) seen.set(v.colorName, v.colorHex);
  return [...seen].map(([name, hex]) => ({ name, hex }));
}

export function sizesFor(variants: VariantLike[], colorName: string) {
  return variants
    .filter((v) => v.colorName === colorName)
    .sort((a, b) => (order.get(a.size) ?? 99) - (order.get(b.size) ?? 99))
    .map((v) => ({ size: v.size, stock: v.stock, variantId: v.id, pricePaise: v.pricePaise }));
}

export function defaultColor(variants: VariantLike[]): string | null {
  const colors = colorsOf(variants);
  if (!colors.length) return null;
  const withStock = colors.find((c) => variants.some((v) => v.colorName === c.name && v.stock > 0));
  return (withStock ?? colors[0]).name;
}
```

Run the two test files again — Expected: PASS (5 tests).

- [ ] **Step 4: Gallery and size guide**

Create `src/components/storefront/gallery.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Img = { url: string; alt: string; colorName: string | null };

export function Gallery({ images, activeColor, productName }: { images: Img[]; activeColor: string | null; productName: string }) {
  const forColor = images.filter((i) => i.colorName === activeColor || i.colorName === null);
  const shown = forColor.length ? forColor : images;
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  useEffect(() => setIndex(0), [activeColor]);
  const main = shown[Math.min(index, shown.length - 1)];
  if (!main) return <div className="aspect-[4/5] rounded-sm bg-surface" />;

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row" data-testid="gallery">
      <ul className="flex gap-2 overflow-x-auto lg:w-20 lg:flex-col lg:overflow-visible">
        {shown.map((img, i) => (
          <li key={img.url}>
            <button type="button" onClick={() => setIndex(i)} aria-label={`Show image ${i + 1}`} aria-current={i === index} className={cn("relative aspect-[4/5] w-16 overflow-hidden rounded-sm border lg:w-full", i === index ? "border-brand" : "border-border")}>
              <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setZoom(true)} className="relative aspect-[4/5] flex-1 overflow-hidden rounded-sm bg-surface" aria-label="Zoom image">
        <Image src={main.url} alt={main.alt || productName} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </button>
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-4xl bg-bg p-2">
          <DialogTitle className="sr-only">{productName}</DialogTitle>
          <div className="relative aspect-[4/5] w-full">
            <Image src={main.url} alt={main.alt || productName} fill sizes="90vw" className="object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Create `src/components/storefront/size-guide.tsx`:

```tsx
"use client";

import type { Fit } from "@prisma/client";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const CHART: Record<Fit, { size: string; chest: number; length: number }[]> = {
  OVERSIZED: [{ size: "S", chest: 44, length: 28 }, { size: "M", chest: 46, length: 29 }, { size: "L", chest: 48, length: 30 }, { size: "XL", chest: 50, length: 31 }, { size: "XXL", chest: 52, length: 32 }],
  REGULAR: [{ size: "S", chest: 38, length: 27 }, { size: "M", chest: 40, length: 28 }, { size: "L", chest: 42, length: 29 }, { size: "XL", chest: 44, length: 30 }, { size: "XXL", chest: 46, length: 31 }],
  RELAXED: [{ size: "S", chest: 41, length: 27.5 }, { size: "M", chest: 43, length: 28.5 }, { size: "L", chest: 45, length: 29.5 }, { size: "XL", chest: 47, length: 30.5 }, { size: "XXL", chest: 49, length: 31.5 }],
};

export function SizeGuide({ fit }: { fit: Fit }) {
  return (
    <Dialog>
      <DialogTrigger className="text-sm text-text-muted underline-offset-4 hover:underline" data-testid="size-guide">Size guide</DialogTrigger>
      <DialogContent className="bg-bg">
        <DialogTitle className="font-display text-2xl uppercase">Size guide (inches)</DialogTitle>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-text-muted"><th className="py-2">Size</th><th>Chest</th><th>Length</th></tr></thead>
          <tbody>
            {CHART[fit].map((r) => (
              <tr key={r.size} className="border-t border-border"><td className="py-2 font-medium">{r.size}</td><td>{r.chest}</td><td>{r.length}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-text-muted">Garment measurements, laid flat. Between sizes? Size up for a roomier fit.</p>
      </DialogContent>
    </Dialog>
  );
}
```

`import type { Fit } from "@prisma/client"` is a type-only import and is safe in a client component.

- [ ] **Step 5: Purchase panel (client)**

Create `src/components/storefront/product-purchase.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { motion, useAnimate } from "motion/react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { addToCartAction } from "@/app/(storefront)/cart/actions";
import { Button } from "@/components/ui/button";
import { MAX_QTY_PER_LINE } from "@/lib/catalog-types";
import { colorsOf, defaultColor, sizesFor } from "@/lib/variant-matrix";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ProductDetail } from "@/server/services/catalog";
import { useCartUI } from "./cart-ui";
import { Gallery } from "./gallery";
import { Price } from "./price";
import { SizeGuide } from "./size-guide";

const FIT_LABEL: Record<ProductDetail["fit"], string> = { OVERSIZED: "Oversized fit", REGULAR: "Regular fit", RELAXED: "Relaxed fit" };

export function ProductPurchase({ product }: { product: ProductDetail }) {
  const colors = colorsOf(product.variants);
  const [color, setColor] = useState<string | null>(defaultColor(product.variants));
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [pending, start] = useTransition();
  const [scope, animate] = useAnimate();
  const setOpen = useCartUI((s) => s.setOpen);

  const sizes = color ? sizesFor(product.variants, color) : [];
  const chosen = sizes.find((s) => s.size === size) ?? null;
  const pricePaise = chosen?.pricePaise ?? product.pricePaise;
  const maxQty = chosen ? Math.min(MAX_QTY_PER_LINE, chosen.stock) : MAX_QTY_PER_LINE;

  const submit = () => {
    if (!chosen) {
      setSizeError(true);
      animate(scope.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.4 });
      return;
    }
    start(async () => {
      const r = await addToCartAction({ variantId: chosen.variantId, quantity: qty });
      if (r.ok) {
        toast.success("Added to your bag");
        setOpen(true);
      } else {
        toast.error(r.message);
      }
    });
  };

  const pickColor = (name: string) => {
    setColor(name);
    setSize(null);
    setQty(1);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
      <Gallery images={product.images} activeColor={color} productName={product.name} />
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-muted">{FIT_LABEL[product.fit]} · {product.fabric}</p>
          <h1 className="mt-2 text-4xl md:text-5xl">{product.name}</h1>
          <div className="mt-3"><Price pricePaise={pricePaise} compareAtPricePaise={product.compareAtPricePaise} size="lg" /></div>
          <p className="text-xs text-text-muted">Inclusive of all taxes</p>
        </div>

        {colors.length > 0 && (
          <div>
            <p className="mb-2 text-sm">Color: <span className="text-text-muted">{color}</span></p>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button key={c.name} type="button" onClick={() => pickColor(c.name)} aria-label={c.name} aria-pressed={c.name === color} title={c.name} className={cn("size-8 rounded-full border-2", c.name === color ? "border-brand" : "border-border")} style={{ backgroundColor: c.hex }} data-testid="color-swatch" />
              ))}
            </div>
          </div>
        )}

        <div ref={scope}>
          <div className="mb-2 flex items-center justify-between">
            <p className={cn("text-sm", sizeError && "text-danger")}>{sizeError ? "Pick a size to continue" : "Select size"}</p>
            <SizeGuide fit={product.fit} />
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
            {sizes.map((s) => (
              <button key={s.size} type="button" role="radio" aria-checked={s.size === size} disabled={s.stock === 0} onClick={() => { setSize(s.size); setSizeError(false); setQty(1); }} className={cn("relative min-w-12 rounded-full border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40", s.size === size ? "border-brand bg-brand text-brand-ink" : "border-border hover:border-text")} data-testid="size-chip">
                {s.size}
                {s.stock > 0 && s.stock < 5 && <span className="absolute -bottom-4 left-0 right-0 text-center text-[10px] text-danger">{s.stock} left</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <div className="inline-flex items-center rounded-full border border-border">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="px-3 py-2"><Minus className="size-4" /></button>
            <span className="min-w-8 text-center" data-testid="qty">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="Increase quantity" className="px-3 py-2"><Plus className="size-4" /></button>
          </div>
          <Button size="lg" onClick={submit} disabled={pending || product.soldOut} className="flex-1 font-display text-lg tracking-wide" data-testid="add-to-cart">
            {product.soldOut ? "Sold out" : pending ? "Adding…" : "Add to bag"}
          </Button>
        </div>

        <ul className="grid grid-cols-3 gap-2 text-center text-xs text-text-muted">
          <li className="rounded-sm border border-border p-2">Free delivery over ₹999</li>
          <li className="rounded-sm border border-border p-2">7-day exchange</li>
          <li className="rounded-sm border border-border p-2">Printed in India</li>
        </ul>
      </div>

      <motion.div initial={{ y: 80 }} animate={{ y: 0 }} className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur lg:hidden" data-testid="sticky-bar">
        <span className="font-display text-xl">{formatPaise(pricePaise)}</span>
        <Button onClick={submit} disabled={pending || product.soldOut} className="font-display text-base tracking-wide">{product.soldOut ? "Sold out" : "Add to bag"}</Button>
      </motion.div>
    </div>
  );
}
```

The free-delivery text uses the literal ₹999 only as copy; the real threshold logic lives in `FreeShippingBar`. If `BRAND.freeShippingThresholdPaise` changes, replace the literal with `formatPaise(BRAND.freeShippingThresholdPaise)` (import `BRAND` from `@/config/brand`, which is client-safe) — do that now rather than leaving the literal.

- [ ] **Step 6: Accordions, related products, page**

Create `src/components/storefront/product-accordions.tsx`:

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Markdown } from "@/lib/markdown";
import type { ProductDetail } from "@/server/services/catalog";

export function ProductAccordions({ product, shipping, returns }: { product: ProductDetail; shipping: string; returns: string }) {
  return (
    <Accordion type="multiple" defaultValue={["description"]} className="mt-12 max-w-3xl" data-testid="product-accordions">
      <AccordionItem value="description"><AccordionTrigger className="font-display text-xl uppercase">Description</AccordionTrigger><AccordionContent><Markdown source={product.description || "No description yet."} /></AccordionContent></AccordionItem>
      <AccordionItem value="care"><AccordionTrigger className="font-display text-xl uppercase">Fabric &amp; care</AccordionTrigger><AccordionContent><Markdown source={`- ${product.fabric}\n- Machine wash cold, inside out\n- Do not bleach or tumble dry\n- Iron on reverse, never on the print`} /></AccordionContent></AccordionItem>
      <AccordionItem value="shipping"><AccordionTrigger className="font-display text-xl uppercase">Shipping</AccordionTrigger><AccordionContent><Markdown source={shipping} /></AccordionContent></AccordionItem>
      <AccordionItem value="returns"><AccordionTrigger className="font-display text-xl uppercase">Returns &amp; exchange</AccordionTrigger><AccordionContent><Markdown source={returns} /></AccordionContent></AccordionItem>
    </Accordion>
  );
}
```

Create `src/components/storefront/related-products.tsx`:

```tsx
import type { ProductCard as Card } from "@/server/services/catalog";
import { ProductCard } from "./product-card";

export function RelatedProducts({ products }: { products: Card[] }) {
  if (!products.length) return null;
  return (
    <section className="mt-20" data-testid="related-products">
      <h2 className="mb-6 text-4xl">You may also like</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
```

Create `src/app/(storefront)/products/[slug]/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container-x grid gap-10 py-10 lg:grid-cols-2">
      <Skeleton className="aspect-[4/5]" />
      <div className="space-y-4"><Skeleton className="h-12 w-3/4" /><Skeleton className="h-8 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-12 w-full" /></div>
    </div>
  );
}
```

Create `src/app/(storefront)/products/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductAccordions } from "@/components/storefront/product-accordions";
import { ProductPurchase } from "@/components/storefront/product-purchase";
import { RelatedProducts } from "@/components/storefront/related-products";
import { BRAND } from "@/config/brand";
import { readPage } from "@/server/content";
import { NotFoundError } from "@/server/errors";
import { getProductBySlug, getRelatedProducts } from "@/server/services/catalog";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  try {
    return await getProductBySlug(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await load(slug);
  return {
    title: product.name,
    description: product.description.slice(0, 160) || `${product.name} by ${BRAND.name}`,
    openGraph: { images: product.images[0] ? [{ url: product.images[0].url }] : [] },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await load(slug);
  const [related, shipping, returns] = await Promise.all([getRelatedProducts(product.id, 4), readPage("shipping"), readPage("returns")]);
  const crumb = product.collections[0];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.images.map((i) => i.url),
    description: product.description,
    brand: { "@type": "Brand", name: BRAND.name },
    offers: { "@type": "Offer", priceCurrency: "INR", price: (product.pricePaise / 100).toFixed(2), availability: product.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" },
  };

  return (
    <div className="container-x py-8 pb-28 lg:pb-10">
      <nav className="mb-6 text-xs text-text-muted" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-text">Home</Link>
        {crumb && <> / <Link href={`/collections/${crumb.slug}`} className="hover:text-text">{crumb.name}</Link></>}
        {" / "}<span className="text-text">{product.name}</span>
      </nav>
      <ProductPurchase product={product} />
      <ProductAccordions product={product} shipping={shipping?.body ?? ""} returns={returns?.body ?? ""} />
      <RelatedProducts products={related} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`. Then `npm run dev`, open `/products/static-noise-oversized-tee`: switching the color swatch changes the gallery images (front/back for that color), clicking "Add to bag" without a size shakes the size row and shows the red message, picking a size then adding opens the drawer with the line and updates the header count; a product with a 0-stock variant shows that chip disabled. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(storefront): add product detail page with color-aware gallery, size selection, and add to bag

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 6: Home page — hero, ticker, featured collections, pinned drops strip, customize teaser, brand story

**Files:**
- Create: `src/components/storefront/home/hero.tsx`, `ticker.tsx`, `featured-collections.tsx`, `new-drops.tsx`, `customize-teaser.tsx`, `brand-story.tsx`, `section-heading.tsx`
- Modify: `src/app/(storefront)/page.tsx` (replace the placeholder)

**Interfaces:**
- Consumes: `listCollections({ featuredOnly: true })`, `listProducts({ collectionSlug, pageSize })`, motion components, `ProductCard`, `BRAND`.
- Produces: the composed home page; `SectionHeading` (`<SectionHeading eyebrow? title href? cta? />`) reused by later tasks.

- [ ] **Step 1: Section heading, ticker, hero**

Create `src/components/storefront/home/section-heading.tsx`:

```tsx
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SectionHeading({ eyebrow, title, href, cta = "View all" }: { eyebrow?: string; title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs uppercase tracking-[0.3em] text-text-muted">{eyebrow}</p>}
        <h2 className="text-5xl md:text-7xl">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="hidden items-center gap-1 text-sm uppercase tracking-wide text-text-muted hover:text-text sm:inline-flex">{cta}<ArrowUpRight className="size-4" /></Link>
      )}
    </div>
  );
}
```

Create `src/components/storefront/home/ticker.tsx`:

```tsx
import { Marquee } from "@/components/motion";
import { BRAND } from "@/config/brand";
import { formatPaise } from "@/lib/money";

const ITEMS = [`Free delivery over ${formatPaise(BRAND.freeShippingThresholdPaise)}`, "240 GSM heavyweight cotton", "New drops every week", "Print your own design", "7-day exchange"];

export function Ticker() {
  return (
    <div className="border-y border-border bg-brand text-brand-ink" data-testid="ticker">
      <Marquee speed={28} className="py-2 font-display text-2xl uppercase tracking-wide">
        {ITEMS.map((t) => (
          <span key={t} className="inline-flex items-center gap-8">{t}<span aria-hidden="true">✦</span></span>
        ))}
      </Marquee>
    </div>
  );
}
```

Create `src/components/storefront/home/hero.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { MagneticButton, Parallax, useReducedMotionSafe } from "@/components/motion";
import { BRAND } from "@/config/brand";

const HEADLINE = ["Wear", "what", "you", "mean."];

export function Hero() {
  const router = useRouter();
  const reduced = useReducedMotionSafe();
  return (
    <section className="relative overflow-hidden border-b border-border" data-testid="hero">
      <div className="container-x grid min-h-[80dvh] items-center gap-8 py-16 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.3em] text-text-muted">{BRAND.name} · New season</p>
          <h1 className="text-[18vw] leading-[0.82] sm:text-[12vw] lg:text-[9vw]" aria-label={HEADLINE.join(" ")}>
            {HEADLINE.map((word, i) => (
              <span key={word} className="inline-block overflow-hidden pr-[0.15em]">
                <motion.span
                  className="inline-block"
                  initial={reduced ? false : { y: "110%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>
          <p className="mt-6 max-w-md text-lg text-text-muted">Heavyweight tees, loud prints, and a design tool for the ones you make yourself.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <MagneticButton onClick={() => router.push("/collections/new-drops")} data-testid="hero-cta">Shop new drops</MagneticButton>
            <button type="button" onClick={() => router.push("/customize")} className="rounded-full border border-border px-8 py-4 font-display text-xl tracking-wide hover:border-text">Design your own</button>
          </div>
        </div>
        <Parallax amount={30} className="relative mx-auto aspect-[4/5] w-full max-w-md">
          <Image src="/seed/tee-lime-front.svg" alt="" fill priority sizes="(min-width: 1024px) 40vw, 90vw" className="object-cover rounded-sm" />
        </Parallax>
      </div>
      <div className="pointer-events-none absolute -bottom-24 -left-24 size-[420px] rounded-full bg-brand/10 blur-3xl" aria-hidden="true" />
    </section>
  );
}
```

- [ ] **Step 2: Featured collections, new drops strip, customize teaser, brand story**

Create `src/components/storefront/home/featured-collections.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { Parallax, Reveal } from "@/components/motion";
import { listCollections, listProducts } from "@/server/services/catalog";
import { SectionHeading } from "./section-heading";

export async function FeaturedCollections() {
  const collections = (await listCollections({ featuredOnly: true })).slice(0, 3);
  const covers = await Promise.all(
    collections.map(async (c) => c.heroImageUrl ?? (await listProducts({ collectionSlug: c.slug, pageSize: 1 })).items[0]?.images[0]?.url ?? null),
  );
  if (!collections.length) return null;
  return (
    <section className="container-x py-20" data-testid="featured-collections">
      <SectionHeading eyebrow="Collections" title="Pick a lane" href="/collections" />
      <div className="grid gap-4 md:grid-cols-3">
        {collections.map((c, i) => (
          <Reveal key={c.id} delay={i * 0.1}>
            <Link href={`/collections/${c.slug}`} className="group relative block aspect-[3/4] overflow-hidden rounded-sm bg-surface">
              {covers[i] && (
                <Parallax amount={24} className="absolute inset-[-12%]">
                  <Image src={covers[i]!} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover opacity-80 transition-transform duration-700 group-hover:scale-105" />
                </Parallax>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="font-display text-4xl uppercase leading-none">{c.name}</p>
                <p className="text-sm text-text-muted">{c.productCount} styles</p>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

Create `src/components/storefront/home/new-drops.tsx`:

```tsx
import { PinnedStrip } from "@/components/motion";
import { ProductCard } from "@/components/storefront/product-card";
import { listProducts } from "@/server/services/catalog";
import { SectionHeading } from "./section-heading";

export async function NewDrops() {
  const { items } = await listProducts({ collectionSlug: "new-drops", sort: "newest", pageSize: 8 });
  if (!items.length) return null;
  return (
    <section className="border-y border-border bg-surface py-20" data-testid="new-drops">
      <div className="container-x"><SectionHeading eyebrow="Just landed" title="New drops" href="/collections/new-drops" /></div>
      <PinnedStrip className="container-x" trackClassName="items-stretch">
        {items.map((p) => (
          <div key={p.id} className="w-[70vw] shrink-0 snap-start sm:w-[40vw] lg:w-[22vw]">
            <ProductCard product={p} />
          </div>
        ))}
      </PinnedStrip>
    </section>
  );
}
```

Create `src/components/storefront/home/customize-teaser.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";

export function CustomizeTeaser() {
  return (
    <section className="container-x grid items-center gap-10 py-20 lg:grid-cols-2" data-testid="customize-teaser">
      <Reveal>
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-surface">
          <Image src="/seed/tee-white-front.svg" alt="Blank white tee ready for your design" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          <div className="absolute left-1/2 top-[36%] w-[30%] -translate-x-1/2 rounded-sm border-2 border-dashed border-brand/70 bg-brand/10 p-3 text-center font-display text-lg uppercase text-brand">Your design here</div>
        </div>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="text-xs uppercase tracking-[0.3em] text-text-muted">Made to order</p>
        <h2 className="mt-2 text-5xl md:text-7xl">Print your own</h2>
        <p className="mt-4 max-w-md text-lg text-text-muted">Upload artwork or type a line, drop it on a blank tee, see it live, and we print and ship it. Front, back, any color we stock.</p>
        <Button asChild size="lg" className="mt-8 font-display text-lg tracking-wide"><Link href="/customize">Start designing</Link></Button>
      </Reveal>
    </section>
  );
}
```

Create `src/components/storefront/home/brand-story.tsx`:

```tsx
import Image from "next/image";
import { Parallax, Reveal } from "@/components/motion";
import { BRAND } from "@/config/brand";

export function BrandStory() {
  return (
    <section className="container-x grid items-center gap-10 border-t border-border py-20 lg:grid-cols-[1fr_1.2fr]" data-testid="brand-story">
      <Parallax amount={40} className="relative aspect-square overflow-hidden rounded-sm bg-surface">
        <Image src="/seed/tee-black-back.svg" alt="" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
      </Parallax>
      <Reveal>
        <h2 className="text-5xl md:text-7xl">{BRAND.name} is loud on purpose</h2>
        <p className="mt-6 max-w-lg text-lg text-text-muted">We cut heavyweight cotton in a boxy fit, print in small runs, and keep the prices where a college kid can reach them. Every design is made in India and every order is packed by hand.</p>
        <p className="mt-4 max-w-lg text-lg text-text-muted">If a tee gets you a compliment, you owe us a photo.</p>
      </Reveal>
    </section>
  );
}
```

- [ ] **Step 3: Compose the home page**

Replace `src/app/(storefront)/page.tsx`:

```tsx
import type { Metadata } from "next";
import { BrandStory } from "@/components/storefront/home/brand-story";
import { CustomizeTeaser } from "@/components/storefront/home/customize-teaser";
import { FeaturedCollections } from "@/components/storefront/home/featured-collections";
import { Hero } from "@/components/storefront/home/hero";
import { NewDrops } from "@/components/storefront/home/new-drops";
import { Ticker } from "@/components/storefront/home/ticker";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: `${BRAND.name} — ${BRAND.tagline}` };

export default function HomePage() {
  return (
    <>
      <Hero />
      <Ticker />
      <FeaturedCollections />
      <NewDrops />
      <CustomizeTeaser />
      <BrandStory />
    </>
  );
}
```

`metadata.title` set as a plain string here overrides the layout template on purpose, so the home tab reads "BRAND — tagline" rather than "BRAND | BRAND".

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`. Then `npm run dev`, open `/` at desktop width: headline words rise in on load, the lime ticker crawls and pauses on hover, collection cards reveal on scroll, the New drops section pins and scrolls sideways while you scroll down, the teaser and story reveal. Emulate reduced motion in DevTools (Rendering → Emulate CSS prefers-reduced-motion) and reload: everything is visible immediately, the ticker is a static scrollable row, and the drops strip is a normal horizontal scroller. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(storefront): build animated home page with hero, ticker, featured collections, and pinned drops

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 7: Cart page, checkout placeholder, search, static pages, customize teaser, route states

**Files:**
- Create: `src/app/(storefront)/cart/page.tsx`, `src/app/(storefront)/checkout/page.tsx`, `src/app/(storefront)/search/page.tsx`, `src/app/(storefront)/pages/[slug]/page.tsx`, `src/app/(storefront)/customize/page.tsx`, `src/components/storefront/notify-me.tsx`, `src/app/(storefront)/not-found.tsx`, `src/app/(storefront)/error.tsx`, `content/pages/about.md`, `content/pages/contact.md`, `content/pages/privacy.md`, `content/pages/terms.md`
- Test: covered by Playwright in Task 10 (`search.spec.ts`, `static.spec.ts`)

**Interfaces:**
- Consumes: `getCurrentCart`, `CartPanel`, `searchProducts`, `readPage`, `Markdown`, `ProductGrid`, `LoadMore`, `SITE_NAV`/`FOOTER_LINKS` hrefs (every footer link must resolve after this task).

- [ ] **Step 1: Cart page and checkout placeholder**

Create `src/app/(storefront)/cart/page.tsx`:

```tsx
import type { Metadata } from "next";
import { CartPanel } from "@/components/storefront/cart-panel";
import { getCurrentCart } from "@/server/cart-ref";

export const metadata: Metadata = { title: "Your bag" };

export default async function CartPage() {
  const cart = await getCurrentCart();
  return (
    <div className="container-x py-10">
      <h1 className="mb-8 text-5xl md:text-7xl">Your bag</h1>
      <CartPanel cart={cart} variant="page" />
    </div>
  );
}
```

Create `src/app/(storefront)/checkout/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { getCurrentCart } from "@/server/cart-ref";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const cart = await getCurrentCart();
  return (
    <div className="container-x grid gap-10 py-10 lg:grid-cols-[1fr_360px]">
      <section>
        <h1 className="text-5xl md:text-7xl">Checkout</h1>
        <div className="mt-8 rounded-md border border-dashed border-border bg-surface p-8" data-testid="checkout-placeholder">
          <p className="font-display text-3xl">Payments arrive in the next release</p>
          <p className="mt-2 max-w-md text-text-muted">Address entry, Razorpay, and order confirmation are being wired up. Your bag is saved and will be here when checkout opens.</p>
          <Button asChild variant="secondary" className="mt-6"><Link href="/collections/new-drops">Keep shopping</Link></Button>
        </div>
      </section>
      <aside className="h-fit rounded-md border border-border bg-surface p-6">
        <p className="font-display text-2xl uppercase">Summary</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-text-muted">Items</dt><dd>{cart.itemCount}</dd></div>
          <div className="flex justify-between"><dt className="text-text-muted">Subtotal</dt><dd className="font-display text-xl">{formatPaise(cart.subtotalPaise)}</dd></div>
        </dl>
        <Link href="/cart" className="mt-4 block text-sm text-text-muted underline-offset-4 hover:underline">Edit bag</Link>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Search page**

Create `src/app/(storefront)/search/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { LoadMore } from "@/components/storefront/load-more";
import { ProductGrid } from "@/components/storefront/product-grid";
import { searchProducts } from "@/server/services/catalog";

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Search: ${q}` : "Search" };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", page } = await searchParams;
  const term = q.trim();
  const results = term ? await searchProducts(term, Math.max(1, Number(page) || 1)) : null;
  return (
    <div className="container-x py-10">
      <form action="/search" role="search" className="mb-8 flex max-w-xl items-center gap-2 rounded-full border border-border bg-surface px-4 py-2">
        <Search className="size-5 text-text-muted" />
        <input name="q" defaultValue={term} placeholder="Search tees" autoFocus className="flex-1 bg-transparent outline-none placeholder:text-text-muted" aria-label="Search products" data-testid="search-input" />
      </form>
      {results ? (
        <>
          <h1 className="mb-2 text-4xl md:text-6xl">Results for “{term}”</h1>
          <p className="mb-8 text-sm text-text-muted" data-testid="result-count">{results.total} products</p>
          <ProductGrid products={results.items} emptyMessage="No tees match that search. Try a color, a fit, or a word from the print." />
          <LoadMore key={term} endpoint={`/api/v1/search?q=${encodeURIComponent(term)}`} initialPage={results.page} hasMore={results.hasMore} />
        </>
      ) : (
        <p className="text-text-muted">Type something to search the catalog.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Static markdown pages and content**

Create `content/pages/about.md`:

```markdown
# About

We started with one screen-printing table and a stack of blank tees. Today we cut heavyweight cotton in a boxy fit, print in small runs, and ship all over India from one studio.

Every design here is made in-house. If it is not something we would wear, it does not go on the site.
```

Create `content/pages/contact.md`:

```markdown
# Contact

Questions about an order, a print, or a bulk run for your college fest? Write to us and a human replies within one working day.

- Email: support@example.com
- Hours: Monday to Saturday, 10am to 7pm IST
```

Create `content/pages/privacy.md`:

```markdown
# Privacy

We collect only what we need to fulfil your order: your name, email, delivery address, and phone number. Payments are processed by our payment partner and we never see your card details.

We use cookies to keep your bag and your login working. We do not sell your data.

To delete your account and data, email us from the address on your account.
```

Create `content/pages/terms.md`:

```markdown
# Terms

By placing an order you agree to these terms.

- Prices include GST. Delivery fees, if any, are shown at checkout.
- Custom-printed items are made to order and are not returnable unless defective.
- We may cancel and refund an order if an item goes out of stock or a print file breaks our content rules.
- Uploading a design confirms you have the right to print it.
```

Create `src/app/(storefront)/pages/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/lib/markdown";
import { readPage } from "@/server/content";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await readPage(slug);
  return { title: page?.title ?? "Not found" };
}

export default async function StaticPage({ params }: Props) {
  const { slug } = await params;
  const page = await readPage(slug);
  if (!page) notFound();
  return (
    <article className="container-x max-w-3xl py-10" data-testid="static-page">
      <h1 className="mb-6 text-5xl md:text-7xl">{page.title}</h1>
      <Markdown source={page.body} />
    </article>
  );
}
```

- [ ] **Step 4: Customize teaser page**

Create `src/components/storefront/notify-me.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NotifyMe() {
  const [email, setEmail] = useState("");
  return (
    <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); toast.success("We'll email you when the designer opens."); setEmail(""); }}>
      <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" aria-label="Email" className="bg-surface" />
      <Button type="submit">Notify me</Button>
    </form>
  );
}
```

Create `src/app/(storefront)/customize/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/motion";
import { NotifyMe } from "@/components/storefront/notify-me";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Design your own" };

const STEPS = [
  { n: "01", title: "Pick a blank", body: "Oversized or regular, any color we stock." },
  { n: "02", title: "Drop your design", body: "Upload artwork or type a line. Move it, scale it, front and back." },
  { n: "03", title: "We print and ship", body: "Printed to order in India and at your door in days." },
];

export default function CustomizePage() {
  return (
    <div className="container-x py-10" data-testid="customize-page">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <p className="text-xs uppercase tracking-[0.3em] text-text-muted">Coming soon</p>
          <h1 className="mt-2 text-6xl md:text-8xl">Design your own</h1>
          <p className="mt-4 max-w-md text-lg text-text-muted">The design tool is on its way. Leave your email and be first in when it opens, or grab a blank now and we will print your file on request.</p>
          <div className="mt-8 space-y-4">
            <NotifyMe />
            <Button asChild variant="secondary"><Link href="/collections/plain-tees">Shop blank tees</Link></Button>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-surface">
            <Image src="/seed/tee-beige-front.svg" alt="" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
        </Reveal>
      </div>
      <ol className="mt-20 grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.1}>
            <li className="rounded-md border border-border bg-surface p-6">
              <span className="font-display text-4xl text-brand">{s.n}</span>
              <p className="mt-2 font-display text-2xl uppercase">{s.title}</p>
              <p className="mt-1 text-text-muted">{s.body}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 5: Not-found and error states for the storefront group**

Create `src/app/(storefront)/not-found.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-x flex min-h-[60dvh] flex-col items-start justify-center gap-4" data-testid="not-found">
      <p className="font-display text-[20vw] leading-none text-surface-raised sm:text-[10rem]">404</p>
      <h1 className="text-4xl">That page walked off</h1>
      <p className="text-text-muted">The link is dead or the tee sold out for good.</p>
      <Button asChild><Link href="/">Back home</Link></Button>
    </div>
  );
}
```

Create `src/app/(storefront)/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function StorefrontError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="container-x flex min-h-[60dvh] flex-col items-start justify-center gap-4">
      <h1 className="text-4xl">Something broke</h1>
      <p className="text-text-muted">We logged it. Try again, and if it keeps happening, tell us.{error.digest ? ` Ref ${error.digest}.` : ""}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`. Then `npm run dev` and check: `/cart` shows the bag page, `/checkout` shows the placeholder with the summary, `/search?q=tee` lists results and `/search?q=zzzz` shows the empty state, every link in the footer resolves (`/collections`, `/pages/shipping`, `/pages/returns`, `/pages/contact`, `/pages/about`, `/pages/privacy`, `/pages/terms`, `/customize`), and `/pages/nope` renders the 404. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(storefront): add cart page, checkout placeholder, search, static pages, and customize teaser

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 8: Auth pages — login, register, forgot and reset password, with the guest cart merge redirect

**Files:**
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/actions.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx`, `src/components/auth/auth-card.tsx`, `src/components/auth/login-form.tsx`, `src/components/auth/register-form.tsx`, `src/components/auth/forgot-form.tsx`, `src/components/auth/reset-form.tsx`, `src/components/auth/field-error.tsx`, `src/components/auth/google-button.tsx`
- Modify: `src/server/services/auth.ts` (add `requestPasswordReset`)
- Test: `tests/unit/request-password-reset.test.ts`

**Interfaces:**
- Produces:

```ts
// @/server/services/auth (added)
export function requestPasswordReset(email: string): Promise<void>;   // sends the email when the user exists; always resolves
// @/app/(auth)/actions ("use server") — all use useActionState's (prevState, formData) shape
export type AuthFormState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };
export function loginAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState>;      // redirects on success
export function registerAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState>;   // redirects on success
export function googleAction(formData: FormData): Promise<void>;                                     // redirects to Google
export function forgotPasswordAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState>;
export function resetPasswordAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState>; // redirects to /login?reset=1
```

Redirect rule: every successful sign-in uses `redirectTo: "/auth/after-login?next=" + encodeURIComponent(nextPath)` where `nextPath = safeNext(rawNext, siteOrigin)`, and `siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"`.

- [ ] **Step 1: Failing test for `requestPasswordReset`**

Create `tests/unit/request-password-reset.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleEmail } from "@/server/adapters/email/console";

const outbox = new ConsoleEmail();
vi.mock("@/server/adapters/email", () => ({ getEmail: () => outbox }));

import { db } from "@/server/db";
import { registerUser, requestPasswordReset } from "@/server/services/auth";
import { resetDb } from "../helpers/db";

describe("requestPasswordReset", () => {
  beforeEach(async () => {
    await resetDb();
    outbox.sent.length = 0;
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  });

  it("emails a reset link containing a stored token", async () => {
    await registerUser({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" });
    await requestPasswordReset("Asha@Example.com");
    expect(outbox.sent).toHaveLength(1);
    const msg = outbox.sent[0];
    expect(msg.to).toBe("asha@example.com");
    const token = msg.html.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();
    expect(await db.verificationToken.findUnique({ where: { token: token! } })).not.toBeNull();
  });

  it("stays silent for unknown emails", async () => {
    await requestPasswordReset("nobody@example.com");
    expect(outbox.sent).toHaveLength(0);
  });
});
```

Run: `npm test -- tests/unit/request-password-reset.test.ts` — Expected: FAIL (`requestPasswordReset` is not exported).

- [ ] **Step 2: Add the service function**

Append to `src/server/services/auth.ts` (add the two imports at the top):

```ts
import { getEmail } from "@/server/adapters/email";
import { BRAND } from "@/config/brand";

export async function requestPasswordReset(email: string): Promise<void> {
  const issued = await createPasswordResetToken(email);
  if (!issued) return;
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${origin}/reset-password?token=${issued.token}`;
  await getEmail().send({
    to: issued.user.email,
    subject: `Reset your ${BRAND.name} password`,
    text: `Reset your password: ${link}\nThis link works once and expires in one hour.`,
    html: `<p>Hi ${issued.user.name ?? "there"},</p><p><a href="${link}">Reset your password</a></p><p>This link works once and expires in one hour. If you did not ask for this, ignore this email.</p>`,
  });
}
```

Run the test again — Expected: PASS.

- [ ] **Step 3: Server Actions**

Create `src/app/(auth)/actions.ts`:

```ts
"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { zodFieldErrors } from "@/server/action-result";
import { signIn } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { safeNext } from "@/server/safe-next";
import { registerUser, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { loginSchema, registerSchema, resetPasswordSchema, resetRequestSchema } from "@/lib/validation/auth";

export type AuthFormState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function afterLogin(rawNext: FormDataEntryValue | null): string {
  const next = safeNext(typeof rawNext === "string" ? rawNext : null, ORIGIN);
  return `/auth/after-login?next=${encodeURIComponent(next)}`;
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: afterLogin(formData.get("next")) });
  } catch (err) {
    if (err instanceof AuthError) return { error: "Incorrect email or password" };
    throw err; // NEXT_REDIRECT
  }
  return { ok: true };
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await registerUser(parsed.data);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: afterLogin(formData.get("next")) });
  } catch (err) {
    if (err instanceof AuthError) return { error: "Account created, but sign-in failed. Please log in." };
    throw err;
  }
  return { ok: true };
}

export async function googleAction(formData: FormData): Promise<void> {
  await signIn("google", { redirectTo: afterLogin(formData.get("next")) });
}

export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  await requestPasswordReset(parsed.data.email);
  return { ok: true };
}

export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({ token: formData.get("token"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await resetPassword(parsed.data.token, parsed.data.password);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  redirect("/login?reset=1");
}
```

`signIn` from Auth.js throws a `NEXT_REDIRECT` error on success inside Server Actions; rethrowing anything that is not an `AuthError` lets Next perform the redirect.

- [ ] **Step 4: Shared auth components**

Create `src/components/auth/field-error.tsx`:

```tsx
export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-xs text-danger" role="alert">{errors[0]}</p>;
}
```

Create `src/components/auth/auth-card.tsx`:

```tsx
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-md border border-border bg-surface p-8" data-testid="auth-card">
      <h1 className="text-4xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
```

Create `src/components/auth/google-button.tsx`:

```tsx
import { googleAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function GoogleButton({ next }: { next: string }) {
  return (
    <form action={googleAction}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="secondary" className="w-full" data-testid="google-button">Continue with Google</Button>
    </form>
  );
}
```

Create `src/components/auth/login-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./field-error";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4" data-testid="login-form">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1 bg-bg" />
        <FieldError errors={state.fieldErrors?.email} />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs text-text-muted hover:text-text">Forgot?</Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="mt-1 bg-bg" />
        <FieldError errors={state.fieldErrors?.password} />
      </div>
      {state.error && <p className="text-sm text-danger" role="alert" data-testid="form-error">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full font-display text-lg tracking-wide">{pending ? "Logging in…" : "Log in"}</Button>
      <p className="text-center text-sm text-text-muted">New here? <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-text underline-offset-4 hover:underline">Create an account</Link></p>
    </form>
  );
}
```

Create `src/components/auth/register-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./field-error";

export function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(registerAction, {});
  return (
    <form action={action} className="space-y-4" data-testid="register-form">
      <input type="hidden" name="next" value={next} />
      <div><Label htmlFor="name">Name</Label><Input id="name" name="name" autoComplete="name" required className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.name} /></div>
      <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.email} /></div>
      <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.password} /></div>
      {state.error && <p className="text-sm text-danger" role="alert" data-testid="form-error">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full font-display text-lg tracking-wide">{pending ? "Creating…" : "Create account"}</Button>
      <p className="text-center text-sm text-text-muted">Already have one? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-text underline-offset-4 hover:underline">Log in</Link></p>
    </form>
  );
}
```

Create `src/components/auth/forgot-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./field-error";

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(forgotPasswordAction, {});
  if (state.ok) return <p className="text-sm text-text-muted" data-testid="forgot-sent">If that email has an account, a reset link is on its way. It works once and expires in an hour.</p>;
  return (
    <form action={action} className="space-y-4">
      <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.email} /></div>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Send reset link"}</Button>
    </form>
  );
}
```

Create `src/components/auth/reset-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { resetPasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./field-error";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.password} /></div>
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Set new password"}</Button>
    </form>
  );
}
```

- [ ] **Step 5: Pages and layout**

Create `src/app/(auth)/layout.tsx`:

```tsx
import Link from "next/link";
import { BRAND } from "@/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <Link href="/" className="font-display text-4xl uppercase tracking-tight">{BRAND.name}</Link>
      {children}
    </div>
  );
}
```

Create `src/app/(auth)/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { auth } from "@/server/auth";
import { googleEnabled } from "@/server/auth.config";
import { safeNext } from "@/server/safe-next";

export const metadata: Metadata = { title: "Log in" };

type Props = { searchParams: Promise<{ next?: string; callbackUrl?: string; reset?: string }> };

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(sp.next ?? sp.callbackUrl ?? null, ORIGIN);
  const session = await auth();
  const needsAdmin = Boolean(session?.user) && next.startsWith("/admin") && session?.user.role !== "ADMIN";
  return (
    <AuthCard title="Log in" subtitle={needsAdmin ? "You need an admin account for that page." : sp.reset ? "Password updated. Log in with the new one." : "Welcome back."}>
      <LoginForm next={next} />
      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-text-muted"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
          <GoogleButton next={next} />
        </>
      )}
    </AuthCard>
  );
}
```

Auth.js's middleware redirect sends users to `/login?callbackUrl=<absolute url>`; `safeNext` turns that into a same-origin path, so both `next` and `callbackUrl` work.

Create `src/app/(auth)/register/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { RegisterForm } from "@/components/auth/register-form";
import { googleEnabled } from "@/server/auth.config";
import { safeNext } from "@/server/safe-next";

export const metadata: Metadata = { title: "Create account" };

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: raw } = await searchParams;
  const next = safeNext(raw ?? null, ORIGIN);
  return (
    <AuthCard title="Create account" subtitle="Save your bag, track orders, reuse your designs.">
      <RegisterForm next={next} />
      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-text-muted"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
          <GoogleButton next={next} />
        </>
      )}
    </AuthCard>
  );
}
```

Create `src/app/(auth)/forgot-password/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot password" subtitle="We'll email you a one-time reset link.">
      <ForgotForm />
    </AuthCard>
  );
}
```

Create `src/app/(auth)/reset-password/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/reset-form";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthCard title="Reset password" subtitle="This link is missing its token.">
        <Link href="/forgot-password" className="text-sm underline-offset-4 hover:underline">Request a new link</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Reset password" subtitle="Choose a new password.">
      <ResetForm token={token} />
    </AuthCard>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`. Then `npm run dev`: register a new account at `/register` → you land on `/` logged in (header user icon links to `/account`); visit `/account` and `/admin` as that customer → `/admin` bounces to `/login` with the admin notice; log out is not built yet (Task 9), so open a private window to test `/login` with a wrong password (error) and the seeded admin (`ADMIN_EMAIL` from `.env`) → `/admin` returns a Next 404 for now (the page arrives in Plan 1C), which proves the middleware let an admin through. Add an item to the bag as a guest, then log in: the bag survives (guest cart merge). Request a reset at `/forgot-password` and read the link from the dev server console (console email adapter); open it and set a new password. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): add login, register, forgot and reset password pages with guest cart merge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 9: Account page — profile, password, orders placeholder, sign out

**Files:**
- Create: `src/app/(storefront)/account/page.tsx`, `src/app/(storefront)/account/actions.ts`, `src/components/storefront/account/profile-form.tsx`, `src/components/storefront/account/password-form.tsx`, `src/components/storefront/account/sign-out-button.tsx`
- Test: Playwright `auth.spec.ts` in Task 10 covers sign out and the profile update

**Interfaces:**
- Produces (`"use server"` in `account/actions.ts`):

```ts
export type AccountFormState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };
export function updateProfileAction(prev: AccountFormState, formData: FormData): Promise<AccountFormState>;
export function changePasswordAction(prev: AccountFormState, formData: FormData): Promise<AccountFormState>;
export function signOutAction(): Promise<void>;   // signOut({ redirectTo: "/" })
```

- [ ] **Step 1: Actions**

Create `src/app/(storefront)/account/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/server/action-result";
import { auth, signOut } from "@/server/auth";
import { DomainError, UnauthorizedError } from "@/server/errors";
import { changePassword, updateProfile } from "@/server/services/auth";
import { changePasswordSchema, updateProfileSchema } from "@/lib/validation/auth";

export type AccountFormState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}

export async function updateProfileAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const parsed = updateProfileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await updateProfile(await requireUserId(), parsed.data);
    revalidatePath("/account");
    return { ok: true };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
}

export async function changePasswordAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const parsed = changePasswordSchema.safeParse({ current: formData.get("current"), next: formData.get("next") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await changePassword(await requireUserId(), parsed.data.current, parsed.data.next);
    return { ok: true };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
```

- [ ] **Step 2: Client forms and sign-out button**

Create `src/components/storefront/account/profile-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { updateProfileAction, type AccountFormState } from "@/app/(storefront)/account/actions";
import { FieldError } from "@/components/auth/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="max-w-md space-y-4" data-testid="profile-form">
      <div><Label htmlFor="name">Name</Label><Input id="name" name="name" defaultValue={name} required className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.name} /></div>
      <div><Label htmlFor="email">Email</Label><Input id="email" value={email} readOnly disabled className="mt-1 bg-bg text-text-muted" /></div>
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand" data-testid="profile-saved">Saved.</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
    </form>
  );
}
```

Create `src/components/storefront/account/password-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { changePasswordAction, type AccountFormState } from "@/app/(storefront)/account/actions";
import { FieldError } from "@/components/auth/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(changePasswordAction, {});
  if (!hasPassword) return <p className="text-sm text-text-muted">You signed up with Google, so there is no password to change here.</p>;
  return (
    <form action={action} className="max-w-md space-y-4" data-testid="password-form">
      <div><Label htmlFor="current">Current password</Label><Input id="current" name="current" type="password" autoComplete="current-password" required className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.current} /></div>
      <div><Label htmlFor="next">New password</Label><Input id="next" name="next" type="password" autoComplete="new-password" required minLength={8} className="mt-1 bg-bg" /><FieldError errors={state.fieldErrors?.next} /></div>
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand">Password updated.</p>}
      <Button type="submit" disabled={pending}>{pending ? "Updating…" : "Update password"}</Button>
    </form>
  );
}
```

Create `src/components/storefront/account/sign-out-button.tsx`:

```tsx
import { signOutAction } from "@/app/(storefront)/account/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="secondary" data-testid="sign-out">Sign out</Button>
    </form>
  );
}
```

- [ ] **Step 3: Page**

`hasPassword` needs to know whether the user has a password hash; `PublicUser` does not expose it. Add to `src/server/services/auth.ts`:

```ts
export async function userHasPassword(id: string): Promise<boolean> {
  const row = await db.user.findUnique({ where: { id }, select: { passwordHash: true } });
  return Boolean(row?.passwordHash);
}
```

Create `src/app/(storefront)/account/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/storefront/account/password-form";
import { ProfileForm } from "@/components/storefront/account/profile-form";
import { SignOutButton } from "@/components/storefront/account/sign-out-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/server/auth";
import { getUserById, userHasPassword } from "@/server/services/auth";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=%2Faccount");
  const [user, hasPassword] = await Promise.all([getUserById(session.user.id), userHasPassword(session.user.id)]);
  if (!user) redirect("/login?next=%2Faccount");
  return (
    <div className="container-x py-10" data-testid="account-page">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl md:text-7xl">Hey, {user.name?.split(" ")[0] ?? "there"}</h1>
          <p className="text-text-muted">{user.email}</p>
        </div>
        <SignOutButton />
      </div>
      <Tabs defaultValue="orders">
        <TabsList className="bg-surface">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="pt-6">
          <div className="rounded-md border border-dashed border-border bg-surface p-8" data-testid="orders-empty">
            <p className="font-display text-2xl">No orders yet</p>
            <p className="mt-1 text-text-muted">Once checkout opens, your orders and tracking links will live here.</p>
            <Link href="/collections/new-drops" className="mt-4 inline-block text-sm underline-offset-4 hover:underline">Browse new drops</Link>
          </div>
        </TabsContent>
        <TabsContent value="profile" className="pt-6"><ProfileForm name={user.name ?? ""} email={user.email} /></TabsContent>
        <TabsContent value="security" className="pt-6"><PasswordForm hasPassword={hasPassword} /></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck && npm test && npm run build`. `npm run dev`: log in, open `/account`, change the name (shows "Saved." and the heading updates after refresh), change the password with a wrong current password (error) then the right one, sign out (lands on `/`, the header icon now points to `/login`). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(account): add account page with profile, password, orders placeholder, and sign out

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 10: Playwright end-to-end suite

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/helpers.ts`, `tests/e2e/home.spec.ts`, `tests/e2e/collection.spec.ts`, `tests/e2e/product-cart.spec.ts`, `tests/e2e/auth.spec.ts`, `tests/e2e/search-static.spec.ts`
- Modify: `package.json` (scripts, dev dependency), `tsconfig.json` (exclude `tests/e2e` from `typecheck` only if Playwright globals clash with Vitest's), `README.md` (e2e section)

**Interfaces:**
- Produces: `npm run test:e2e` (headless Chromium against the dev server on port 3000 with the seeded dev database) and `npm run test:e2e:ui`.

Precondition (document in README): Docker Postgres up, `npm run db:migrate && npm run db:seed` done, no other server on port 3000.

- [ ] **Step 1: Install and configure**

```bash
npm i -D @playwright/test
npx playwright install chromium
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 180_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /home|product-cart/ },
    { name: "reduced-motion", use: { ...devices["Desktop Chrome"], reducedMotion: "reduce" }, testMatch: /home/ },
  ],
});
```

Add scripts to `package.json`:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

Vitest must not pick up the e2e specs: `vitest.config.ts` already restricts `include` to `tests/unit/**` and `src/**`, so nothing changes there. If `npm run typecheck` complains about conflicting `expect` globals between Vitest and Playwright, add `"exclude": ["node_modules", "tests/e2e"]` to `tsconfig.json` and run `npx tsc --noEmit -p tsconfig.e2e.json` with a tiny `tsconfig.e2e.json` that extends the root and includes only `tests/e2e` and `playwright.config.ts`; wire it into `typecheck` as `tsc --noEmit && tsc --noEmit -p tsconfig.e2e.json`. Report which path was needed.

Create `tests/e2e/helpers.ts`:

```ts
import { expect, type Page } from "@playwright/test";

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const PASSWORD = "e2e-password-123";

export async function register(page: Page, email: string, name = "E2E Tester") {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByTestId("account-link")).toHaveAttribute("href", "/account");
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
}

export async function addFirstProductToBag(page: Page) {
  await page.goto("/collections/oversized-tees");
  await page.getByTestId("product-card").first().getByRole("link").first().click();
  await expect(page.getByTestId("add-to-cart")).toBeVisible();
  const chip = page.getByTestId("size-chip").filter({ hasNot: page.locator("[disabled]") }).first();
  await chip.click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-drawer")).toBeVisible();
}
```

- [ ] **Step 2: Specs**

Create `tests/e2e/home.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("home renders hero, ticker, collections, and drops", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/wear/i);
  await expect(page.getByTestId("ticker")).toBeVisible();
  await expect(page.getByTestId("featured-collections").getByRole("link")).toHaveCount(3);
  await page.getByTestId("new-drops").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("new-drops").getByTestId("product-card").first()).toBeVisible();
  await expect(page.getByTestId("customize-teaser")).toBeVisible();
  await expect(page.getByTestId("site-footer")).toBeVisible();
});

test("hero CTA goes to new drops", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("hero-cta").click();
  await expect(page).toHaveURL(/\/collections\/new-drops/);
});
```

Create `tests/e2e/collection.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("filters and sort update the url and the grid", async ({ page }) => {
  await page.goto("/collections/oversized-tees");
  await expect(page.getByTestId("product-grid")).toBeVisible();
  const before = await page.getByTestId("result-count").textContent();

  await page.getByTestId("filter-rail").getByRole("button", { name: "M", exact: true }).first().click();
  await expect(page).toHaveURL(/size=M/);
  await expect(page.getByTestId("result-count")).toBeVisible();

  await page.getByTestId("sort-select").click();
  await page.getByRole("option", { name: /low to high/i }).click();
  await expect(page).toHaveURL(/sort=price-asc/);
  const prices = await page.getByTestId("price").locator("span").first().allTextContents();
  const nums = prices.map((p) => Number(p.replace(/[^\d]/g, "")));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));

  await page.getByTestId("clear-filters").first().click();
  await expect(page).not.toHaveURL(/size=/);
  expect(before).toBeTruthy();
});

test("collections index lists every collection", async ({ page }) => {
  await page.goto("/collections");
  await expect(page.getByTestId("collection-card")).toHaveCount(5);
});
```

Create `tests/e2e/product-cart.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { addFirstProductToBag } from "./helpers";

test("size is required, then adding opens the drawer and persists across reload", async ({ page }) => {
  await page.goto("/collections/oversized-tees");
  await page.getByTestId("product-card").first().getByRole("link").first().click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByText(/pick a size/i)).toBeVisible();
  await expect(page.getByTestId("cart-drawer")).toBeHidden();

  const chip = page.getByTestId("size-chip").filter({ hasNot: page.locator("[disabled]") }).first();
  await chip.click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-drawer")).toBeVisible();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-count")).toHaveText("1");

  await page.reload();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await page.getByRole("button", { name: /increase quantity/i }).click();
  await expect(page.getByTestId("cart-line-qty")).toHaveText("2");
  await page.getByRole("button", { name: /^remove/i }).click();
  await expect(page.getByTestId("cart-empty")).toBeVisible();
});

test("color swatch switches the gallery", async ({ page }) => {
  await page.goto("/products/static-noise-oversized-tee");
  const first = await page.getByTestId("gallery").locator("img").first().getAttribute("src");
  await page.getByTestId("color-swatch").nth(1).click();
  await expect.poll(async () => page.getByTestId("gallery").locator("img").first().getAttribute("src")).not.toBe(first);
});

test("checkout placeholder shows the bag summary", async ({ page }) => {
  await addFirstProductToBag(page);
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-placeholder")).toBeVisible();
});
```

Create `tests/e2e/auth.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { addFirstProductToBag, login, register, uniqueEmail } from "./helpers";

test("register, sign out, log in, wrong password", async ({ page }) => {
  const email = uniqueEmail();
  await register(page, email);
  await page.goto("/account");
  await expect(page.getByTestId("account-page")).toBeVisible();
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("account-link")).toHaveAttribute("href", "/login");

  await login(page, email, "wrong-password");
  await expect(page.getByTestId("form-error")).toBeVisible();

  await login(page, email);
  await expect(page.getByTestId("account-link")).toHaveAttribute("href", "/account");
});

test("guest bag survives login", async ({ page }) => {
  await addFirstProductToBag(page);
  await page.keyboard.press("Escape");
  const email = uniqueEmail("merge");
  await register(page, email);
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});

test("profile name update", async ({ page }) => {
  await register(page, uniqueEmail("profile"));
  await page.goto("/account");
  await page.getByRole("tab", { name: /profile/i }).click();
  await page.getByLabel("Name").fill("Renamed Tester");
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByTestId("profile-saved")).toBeVisible();
});

test("customer cannot open admin", async ({ page }) => {
  await register(page, uniqueEmail("cust"));
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/admin account/i)).toBeVisible();
});
```

Create `tests/e2e/search-static.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("search finds and misses", async ({ page }) => {
  await page.goto("/search?q=tee");
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  await page.goto("/search?q=zzzz-nothing");
  await expect(page.getByTestId("empty-grid")).toBeVisible();
});

test("static pages and 404", async ({ page }) => {
  for (const slug of ["shipping", "returns", "about", "contact", "privacy", "terms"]) {
    await page.goto(`/pages/${slug}`);
    await expect(page.getByTestId("static-page").getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/customize");
  await expect(page.getByTestId("customize-page")).toBeVisible();
  const res = await page.goto("/pages/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toBeVisible();
});
```

- [ ] **Step 3: README**

Add a section to `README.md`:

```markdown
## End-to-end tests

`npm run test:e2e` runs Playwright against the dev server and the seeded dev database. Before the first run: `docker compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npx playwright install chromium`. Use `npm run test:e2e:ui` to watch them.
```

- [ ] **Step 4: Run everything**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`
Expected: all Vitest tests pass; Playwright reports every spec passing across the `desktop`, `mobile`, and `reduced-motion` projects. If a spec fails only because of the seed data's shape (for example the `oversized-tees` collection has no product with a free size), fix the selector to pick another product rather than weakening the assertion, and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(e2e): add Playwright suite for home, browsing, cart, auth, search, and static pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

## Carried-over deferrals from Plan 1A (for this plan's ledger)

These stay open unless a task above touches the file; the final review of this plan re-triages them.

- auth.ts: map Prisma P2002 on register to ConflictError (concurrent duplicate registration returns 500 today)
- auth.ts: second concurrent use of a reset token surfaces 500 instead of 401
- validation/catalog.ts: one invalid query field drops all filters silently (spec wants 400 on the API; storefront prefers stripping only the bad key)
- auth.config.ts: add a signIn callback rejecting Google profiles with `email_verified !== true`
- api-token.ts: 30-day bearer tokens have no revocation on password change (Phase 2)
- api.ts: `parseJson` `ZodType<T>` hides input/output variance; `auth()` fallback catch swallows every error
- schema.prisma: no DB CHECK constraints for stock >= 0, quantity 1..10, cart xor(userId, guestToken) (Phase 2 migration)
- site.ts links now resolve after Task 7 of this plan (verify in the final review)
- root layout boilerplate replaced in Task 1 of this plan (verify)
- money.ts: `formatPaise` rounds away paise; Phase 2 totals may need a `showPaise` option; regex can simplify to `/\s/g`
- run-seed.ts: SVG writes on every run could fail on a read-only FS
- searchProducts: no pageSize clamp; color de-dup duplicated in toCard/getFacets; getFacets distinct without orderBy
- run-seed.ts: variant sortOrder 1-based; collection upsert overwrites hand-edited metadata
- adapters: eager AWS SDK imports; `_contentType` unused param; uploads route traversal untested
- api tests: quantity-omitted default path untested; `next lint` deprecation; npm audit needs breaking bumps

## Plan self-review

- **Spec coverage (section 4 and 8):** home sections (Task 6), collection filters/sort/URL state/load more (Task 4), product page gallery/swatches/size/stock hints/size guide/sticky bar/accordions/related (Task 5), cart drawer + page + free-shipping bar + checkout placeholder (Tasks 3, 7), search (Task 7), auth pages incl. forgot/reset and return-to-page (Task 8), account (Task 9), static pages (Task 7), design system and motion with reduced-motion (Tasks 1, 2), Playwright flows (Task 10). Admin UI, Docker deploy, and CI are Plans 1C and 1D.
- **Placeholders:** none; each step has code or a command with expected output.
- **Type consistency:** `ActionResult`/`actionError`/`zodFieldErrors` (Task 3) reused by Tasks 8-9; `useCartUI` (Task 3) used by Task 5; `ProductCard`/`ProductGrid`/`LoadMore` (Task 4) used by Tasks 5-7; `readPage`/`Markdown` (Task 5) used by Task 7; `safeNext` signature `(raw, origin)` used consistently; `MAX_QTY_PER_LINE` moves to `@/lib/catalog-types` in Task 3 and is imported from there by client code afterwards.
