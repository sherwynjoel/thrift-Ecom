# Phase 1C: Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the shop owner an admin panel at `/admin` to manage products (details, variant matrix with stock and price overrides, collections, images with alt text, color tags and ordering), collections (details, hero image, product order), and see a dashboard of catalog health, all behind an admin-only guard, with changes appearing on the storefront immediately.

**Architecture:** Admin pages are Server Components under `src/app/admin` (outside the storefront route group, so no Lenis or storefront chrome). Every admin page and Server Action calls `requireAdmin()`, which re-reads the user's role from the database (defence in depth on top of the middleware). Business logic lives in three new services (`admin-products`, `admin-collections`, `admin-dashboard`) that are the only admin code touching Prisma. Client components (product editor, variant matrix, image manager, collection editor) hold form state and call Server Actions with plain objects; actions validate with shared Zod schemas, call services, and `revalidatePath("/", "layout")` so the storefront reflects edits.

**Tech Stack:** Next.js 15 App Router, React 19 Server Actions and `useTransition`, Prisma 6, Zod 3, shadcn/ui on Base UI (render prop, no `asChild`), Vitest against the real test database, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-phase1-storefront-foundation-design.md` section 5 (Admin panel) is binding; sections 3 (data model) and 7 (error handling) apply.

## Global Constraints

- Node 22, npm 11, Git Bash on Windows; the repo is OneDrive-synced (slow installs; wait, retry once only on a real error). C: drive is low on space; on ENOSPC stop and report BLOCKED.
- Money is integer paise in the database and services. Admin inputs are typed in rupees and converted only at the UI boundary with `rupeesToPaise`/`paiseToRupees` from `@/lib/money`.
- Only services in `src/server/services/*` import `@/server/db`. Admin pages and actions call services. Client components import only types (`import type`) from `@/server/*`.
- Every admin page and every admin Server Action calls `requireAdmin()` from `@/server/admin-guard` before doing anything else.
- After any admin mutation call `revalidatePath("/", "layout")` so storefront pages rebuild.
- Sizes come only from `SIZES` in `@/lib/sizes`; fits are `OVERSIZED | REGULAR | RELAXED`; statuses `DRAFT | ACTIVE | ARCHIVED`.
- shadcn primitives are the Base UI variant: compose with `render={<Link href="…" />}` plus `nativeButton={false}`, never `asChild`. Available primitives: accordion, badge, button, dialog, input, label, select, separator, sheet, skeleton, sonner, tabs. Use native `<textarea>`, `<input type="checkbox">`, `<input type="color">`, `<table>` styled with Tailwind tokens where no primitive exists.
- Uploads accept only PNG, JPEG, WebP up to 5 MB (existing `storeImage`); max 10 files per upload request and 20 images per product.
- Never run anything on port 3000 (the owner's preview server). Manual checks use `npx next dev -p 3001` with `NEXT_PUBLIC_SITE_URL=http://localhost:3001` set only in that shell; stop it afterwards and confirm nothing listens on 3001. E2E runs through `npm run test:e2e` (already on port 3001). Revert `tsconfig.json`/`next-env.d.ts` churn from `next dev`/`next build` before committing.
- Every task ends with `npm run lint && npm run typecheck && npm test && npm run build` green (Task 7 also `npm run test:e2e`).
- Commit messages end with exactly these two lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB`

---

## Existing interfaces this plan consumes

```ts
// @/server/db: db (PrismaClient)
// @/server/auth: auth() → session with user.id, user.role
// @/server/services/auth: getUserById(id): Promise<PublicUser | null>   // PublicUser.role: "CUSTOMER" | "ADMIN"
// @/server/errors: DomainError, NotFoundError(what), ConflictError(msg), ForbiddenError(msg?), UnauthorizedError(msg?), ValidationError(fieldErrors)
// @/server/action-result: ActionResult<T>, actionError(err), zodFieldErrors(zodError)
// @/server/uploads: storeImage(file: File, prefix): Promise<{ url, key }>, MAX_UPLOAD_BYTES, validateImage
// @/server/adapters/storage: getStorage(): { put, getPublicUrl(key), delete(key) }, LOCAL_UPLOAD_ROOT
// @/server/services/catalog: Page<T> { items, total, page, pageSize, hasMore }
// @/lib/slug: slugify(text), uniqueSlug(base, exists: (slug) => Promise<boolean>)
// @/lib/sizes: SIZES (readonly tuple "XS".."3XL"), isSize
// @/lib/money: formatPaise(paise)
// tests/helpers/db: resetDb(); tests/helpers/fixtures: createCollection(over), createProduct(over) (returns product with variants and images), linkProductToCollection(collectionId, productId, sortOrder)
// middleware already blocks /admin for non-admins (redirects to /login?callbackUrl=…)
```

## File structure

| Path | Responsibility |
|---|---|
| `src/server/admin-guard.ts` | `requireAdmin()` — session + DB role check |
| `src/lib/validation/admin.ts` | Zod schemas: product input, variant input, collection input, image update |
| `src/lib/money.ts` (modify) | add `rupeesToPaise`, `paiseToRupees` |
| `src/lib/variant-rows.ts` | pure helper building the variant matrix rows from sizes × colors plus existing rows |
| `src/server/services/admin-products.ts` | list/get/create/update/delete products, variant sync, collection membership |
| `src/server/services/admin-images.ts` | add/update/reorder/delete product images; storage cleanup |
| `src/server/services/admin-collections.ts` | list/get/create/update/delete collections, hero image, product order, options |
| `src/server/services/admin-dashboard.ts` | catalog counts and low-stock list |
| `src/app/api/uploads/[...path]/route.ts` (modify) | hardened headers |
| `src/app/admin/layout.tsx`, `src/components/admin/admin-nav.tsx` | admin shell |
| `src/app/admin/page.tsx` | dashboard |
| `src/app/admin/products/page.tsx`, `src/components/admin/products-table.tsx` | product list |
| `src/app/admin/products/new/page.tsx`, `src/app/admin/products/[id]/page.tsx`, `src/app/admin/products/actions.ts`, `src/components/admin/product-editor.tsx`, `src/components/admin/variant-matrix.tsx`, `src/components/admin/delete-product-button.tsx` | product editor |
| `src/components/admin/image-manager.tsx`, `src/app/admin/products/image-actions.ts` | images |
| `src/app/admin/collections/**`, `src/components/admin/collection-editor.tsx`, `src/components/admin/collection-products.tsx` | collections |
| `tests/unit/*` new tests, `tests/e2e/admin.spec.ts`, `tests/fixtures/pixel.png` | tests |

---

### Task 1: Admin guard, validation schemas, money conversion, variant-row builder

**Files:**
- Create: `src/server/admin-guard.ts`, `src/lib/validation/admin.ts`, `src/lib/variant-rows.ts`
- Modify: `src/lib/money.ts`
- Test: `tests/unit/admin-guard.test.ts`, `tests/unit/admin-validation.test.ts`, `tests/unit/variant-rows.test.ts`, `tests/unit/money.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
// @/server/admin-guard
export function requireAdmin(): Promise<{ userId: string }>;   // UnauthorizedError if no session, ForbiddenError if not ADMIN
// @/lib/money (added)
export function rupeesToPaise(input: string): number | null;   // "" → null; "549" → 54900; "549.5" → 54950; invalid/negative → NaN-free null
export function paiseToRupees(paise: number | null | undefined): string; // 54900 → "549"; 54950 → "549.50"; null → ""
// @/lib/validation/admin
export const variantInputSchema; export const productInputSchema; export const collectionInputSchema; export const imageUpdateSchema;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type CollectionInput = z.infer<typeof collectionInputSchema>;
// @/lib/variant-rows
export interface ColorSpec { name: string; hex: string }
export interface VariantRow { key: string; id?: string; size: string; colorName: string; colorHex: string; pricePaise: number | null; stock: number }
export function buildVariantRows(sizes: string[], colors: ColorSpec[], existing: VariantRow[]): VariantRow[];
export function variantKey(size: string, colorName: string): string;   // `${size}|${colorName.trim().toLowerCase()}`
```

- [ ] **Step 1: Failing tests**

Create `tests/unit/admin-guard.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getUserByIdMock = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => authMock() }));
vi.mock("@/server/services/auth", () => ({ getUserById: (id: string) => getUserByIdMock(id) }));

import { requireAdmin } from "@/server/admin-guard";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

describe("requireAdmin", () => {
  beforeEach(() => {
    authMock.mockReset();
    getUserByIdMock.mockReset();
  });

  it("rejects anonymous visitors", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects customers even if the session claims admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    getUserByIdMock.mockResolvedValue({ id: "u1", role: "CUSTOMER" });
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects deleted users", async () => {
    authMock.mockResolvedValue({ user: { id: "gone", role: "ADMIN" } });
    getUserByIdMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns the admin id", async () => {
    authMock.mockResolvedValue({ user: { id: "a1", role: "ADMIN" } });
    getUserByIdMock.mockResolvedValue({ id: "a1", role: "ADMIN" });
    await expect(requireAdmin()).resolves.toEqual({ userId: "a1" });
  });
});
```

If importing `@/server/admin-guard` pulls in `next-auth` internals that fail under Vitest (the Task-6 precedent from Plan 1B), also add `vi.mock("next-auth", () => ({ default: vi.fn(), AuthError: class AuthError extends Error {} }))` at the top, and note it in the report.

Append to `tests/unit/money.test.ts`:

```ts
import { paiseToRupees, rupeesToPaise } from "@/lib/money";

describe("rupee/paise conversion", () => {
  it("parses rupee strings into paise", () => {
    expect(rupeesToPaise("549")).toBe(54900);
    expect(rupeesToPaise(" 549.5 ")).toBe(54950);
    expect(rupeesToPaise("0.01")).toBe(1);
    expect(rupeesToPaise("")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("1.234")).toBeNull();
  });

  it("formats paise for an input field", () => {
    expect(paiseToRupees(54900)).toBe("549");
    expect(paiseToRupees(54950)).toBe("549.50");
    expect(paiseToRupees(null)).toBe("");
    expect(paiseToRupees(undefined)).toBe("");
  });
});
```

(Merge the import with the file's existing import line rather than duplicating it.)

Create `tests/unit/variant-rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildVariantRows, variantKey } from "@/lib/variant-rows";

const black = { name: "Black", hex: "#111111" };
const white = { name: "White", hex: "#f2f2ee" };

describe("buildVariantRows", () => {
  it("builds one row per size × color in SIZES order, colors in given order", () => {
    const rows = buildVariantRows(["L", "S"], [black, white], []);
    expect(rows.map((r) => `${r.size}/${r.colorName}`)).toEqual(["S/Black", "L/Black", "S/White", "L/White"]);
    expect(rows.every((r) => r.stock === 0 && r.pricePaise === null && r.id === undefined)).toBe(true);
  });

  it("keeps id, stock and price of existing rows, matched case-insensitively by color", () => {
    const existing = [{ key: variantKey("M", "black"), id: "v1", size: "M", colorName: "black", colorHex: "#000000", pricePaise: 64900, stock: 7 }];
    const [row] = buildVariantRows(["M"], [black], existing);
    expect(row).toMatchObject({ id: "v1", stock: 7, pricePaise: 64900, colorName: "Black", colorHex: "#111111" });
  });

  it("drops rows whose size or color is no longer selected", () => {
    const existing = buildVariantRows(["S", "M"], [black], []);
    expect(buildVariantRows(["S"], [black], existing)).toHaveLength(1);
  });

  it("ignores blank color names and duplicate colors", () => {
    expect(buildVariantRows(["S"], [black, { name: " ", hex: "#fff000" }, { name: "BLACK", hex: "#222222" }], [])).toHaveLength(1);
  });
});
```

Create `tests/unit/admin-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { collectionInputSchema, productInputSchema } from "@/lib/validation/admin";

const base = {
  name: "Test Tee",
  slug: "",
  description: "",
  fit: "OVERSIZED",
  fabric: "100% Cotton",
  basePricePaise: 59900,
  compareAtPricePaise: null,
  status: "DRAFT",
  isCustomizable: false,
  collectionIds: [],
  variants: [],
};

describe("productInputSchema", () => {
  it("accepts a draft without variants", () => {
    expect(productInputSchema.safeParse(base).success).toBe(true);
  });

  it("requires at least one variant to publish", () => {
    const r = productInputSchema.safeParse({ ...base, status: "ACTIVE" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "variants")).toBe(true);
  });

  it("rejects a compare-at price not above the base price", () => {
    const r = productInputSchema.safeParse({ ...base, compareAtPricePaise: 59900 });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate size/color pairs and bad hex or slug", () => {
    const v = { size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 3 };
    expect(productInputSchema.safeParse({ ...base, variants: [v, { ...v, colorName: "black" }] }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, variants: [{ ...v, colorHex: "black" }] }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, variants: [{ ...v, size: "XXXL" }] }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, slug: "Bad Slug" }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, variants: [{ ...v, stock: -1 }] }).success).toBe(false);
  });
});

describe("collectionInputSchema", () => {
  it("validates name and optional slug", () => {
    expect(collectionInputSchema.safeParse({ name: "Summer", slug: "", description: "", isFeatured: true, isActive: true, sortOrder: 2 }).success).toBe(true);
    expect(collectionInputSchema.safeParse({ name: "S", slug: "", description: "", isFeatured: false, isActive: true, sortOrder: 0 }).success).toBe(false);
  });
});
```

Run: `npm test -- tests/unit/admin-guard.test.ts tests/unit/money.test.ts tests/unit/variant-rows.test.ts tests/unit/admin-validation.test.ts`
Expected: FAIL (modules and exports missing).

- [ ] **Step 2: Implement**

Create `src/server/admin-guard.ts`:

```ts
import { auth } from "@/server/auth";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import { getUserById } from "@/server/services/auth";

/** Re-checks the role in the database on every admin request; the JWT role alone is not trusted. */
export async function requireAdmin(): Promise<{ userId: string }> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new UnauthorizedError();
  const user = await getUserById(id);
  if (!user || user.role !== "ADMIN") throw new ForbiddenError("Admins only");
  return { userId: user.id };
}
```

Append to `src/lib/money.ts`:

```ts
export function rupeesToPaise(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function paiseToRupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}
```

Create `src/lib/variant-rows.ts`:

```ts
import { SIZES } from "@/lib/sizes";

export interface ColorSpec { name: string; hex: string }
export interface VariantRow { key: string; id?: string; size: string; colorName: string; colorHex: string; pricePaise: number | null; stock: number }

const order = new Map<string, number>(SIZES.map((s, i) => [s, i]));

export function variantKey(size: string, colorName: string): string {
  return `${size}|${colorName.trim().toLowerCase()}`;
}

export function buildVariantRows(sizes: string[], colors: ColorSpec[], existing: VariantRow[]): VariantRow[] {
  const byKey = new Map(existing.map((r) => [variantKey(r.size, r.colorName), r]));
  const seen = new Set<string>();
  const cleanColors = colors
    .map((c) => ({ name: c.name.trim(), hex: c.hex }))
    .filter((c) => {
      const k = c.name.toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const sortedSizes = [...new Set(sizes)].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  const rows: VariantRow[] = [];
  for (const c of cleanColors) {
    for (const size of sortedSizes) {
      const key = variantKey(size, c.name);
      const prev = byKey.get(key);
      rows.push({ key, id: prev?.id, size, colorName: c.name, colorHex: c.hex, pricePaise: prev?.pricePaise ?? null, stock: prev?.stock ?? 0 });
    }
  }
  return rows;
}
```

Create `src/lib/validation/admin.ts`:

```ts
import { z } from "zod";
import { SIZES } from "@/lib/sizes";

const paise = z.number().int().min(0).max(100_000_00);
const slugField = z
  .string()
  .trim()
  .max(140)
  .refine((s) => s === "" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s), "Use lowercase letters, numbers, and single hyphens");

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #111111");

export const variantInputSchema = z.object({
  id: z.string().min(1).optional(),
  size: z.enum(SIZES),
  colorName: z.string().trim().min(1, "Name the color").max(40),
  colorHex: hexColorSchema,
  pricePaise: paise.min(1).nullable(),
  stock: z.number().int().min(0, "Stock cannot be negative").max(100_000),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(120),
    slug: slugField,
    description: z.string().max(5000),
    fit: z.enum(["OVERSIZED", "REGULAR", "RELAXED"]),
    fabric: z.string().trim().min(1, "Describe the fabric").max(120),
    basePricePaise: paise.min(100, "Price must be at least ₹1"),
    compareAtPricePaise: paise.nullable(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    isCustomizable: z.boolean(),
    collectionIds: z.array(z.string().min(1)).max(50),
    variants: z.array(variantInputSchema).max(200),
  })
  .superRefine((v, ctx) => {
    if (v.compareAtPricePaise !== null && v.compareAtPricePaise <= v.basePricePaise) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["compareAtPricePaise"], message: "Compare-at price must be higher than the price" });
    }
    if (v.status === "ACTIVE" && v.variants.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "Add at least one size and color before publishing" });
    }
    const seen = new Set<string>();
    v.variants.forEach((variant, i) => {
      const k = `${variant.size}|${variant.colorName.trim().toLowerCase()}`;
      if (seen.has(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", i], message: `Duplicate ${variant.size} / ${variant.colorName}` });
      seen.add(k);
    });
  });

export const collectionInputSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  slug: slugField,
  description: z.string().max(1000),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
});

export const imageUpdateSchema = z.object({
  alt: z.string().trim().max(200),
  colorName: z.string().trim().max(40).nullable(),
});

export type VariantInput = z.infer<typeof variantInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type CollectionInput = z.infer<typeof collectionInputSchema>;
export type ImageUpdate = z.infer<typeof imageUpdateSchema>;
```

- [ ] **Step 3: Verify and commit**

Run the four test files (GREEN), then the full gate. Commit:

```bash
git add src/server/admin-guard.ts src/lib/validation/admin.ts src/lib/variant-rows.ts src/lib/money.ts tests/unit/admin-guard.test.ts tests/unit/admin-validation.test.ts tests/unit/variant-rows.test.ts tests/unit/money.test.ts
git commit -m "feat(admin): add admin guard, admin validation schemas, rupee conversion, and variant rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 2: Admin products service — list, get, create, update, delete, variant sync, collection membership

**Files:**
- Create: `src/server/services/admin-products.ts`
- Test: `tests/unit/admin-products.test.ts`

**Interfaces:**
- Consumes: `productInputSchema`, `ProductInput` (Task 1); `db`; `slugify`, `uniqueSlug`; `ConflictError`, `NotFoundError`, `ValidationError`; `zodFieldErrors` from `@/server/action-result`; `Page` type from catalog.
- Produces (from `@/server/services/admin-products`):

```ts
export interface AdminProductRow { id: string; slug: string; name: string; status: ProductStatus; imageUrl: string | null; variantCount: number; totalStock: number; basePricePaise: number; updatedAt: Date }
export interface AdminVariant { id: string; sku: string; size: string; colorName: string; colorHex: string; pricePaise: number | null; stock: number; inCarts: number }
export interface AdminImage { id: string; url: string; alt: string; colorName: string | null; sortOrder: number }
export interface AdminProductDetail { id: string; slug: string; name: string; description: string; fit: Fit; fabric: string; basePricePaise: number; compareAtPricePaise: number | null; status: ProductStatus; isCustomizable: boolean; collectionIds: string[]; images: AdminImage[]; variants: AdminVariant[] }
export function listAdminProducts(args?: { q?: string; status?: ProductStatus; page?: number; pageSize?: number }): Promise<Page<AdminProductRow>>;
export function getAdminProduct(id: string): Promise<AdminProductDetail>;          // NotFoundError
export function createProduct(input: unknown): Promise<{ id: string; slug: string }>;   // ValidationError on bad input
export function updateProduct(id: string, input: unknown): Promise<{ id: string; slug: string }>;
export function deleteProduct(id: string): Promise<void>;                          // ConflictError if ACTIVE
```

Behaviour rules:
- Slug: when blank, derive from the name; always made unique across products (excluding the product being edited) with `uniqueSlug`.
- Variant sync on update (inside one transaction): input variants with an `id` belonging to this product are updated; input variants without `id` are created; existing variants missing from the input are deleted, unless they sit in any cart, in which case a `ConflictError` names them (“set its stock to 0 instead”). An input `id` that is not one of this product's variants → `ValidationError({ variants: ["Unknown variant"] })`.
- New variant SKU: `${SLUG}-${COLOR}-${SIZE}` uppercased (color slugified); if taken, append `-2`, `-3`, … . SKUs of updated variants stay stable.
- Collection membership: remove links not in `collectionIds`; add new links at the end of each collection (`sortOrder = max + 1`); keep existing links' `sortOrder`. Unknown collection ids → `ValidationError({ collectionIds: ["Unknown collection"] })`.
- Delete: only `DRAFT` or `ARCHIVED` products may be deleted (`ConflictError("Archive the product before deleting it")` otherwise); cascade removes variants, images, links, and cart lines.
- `listAdminProducts`: newest `updatedAt` first, 25 per page (max 100), `q` matches name or slug case-insensitively, optional status filter; `imageUrl` is the first image by `sortOrder`.

- [ ] **Step 1: Failing tests**

Create `tests/unit/admin-products.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct, linkProductToCollection } from "../helpers/fixtures";
import {
  createProduct as adminCreate,
  deleteProduct,
  getAdminProduct,
  listAdminProducts,
  updateProduct,
} from "@/server/services/admin-products";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

const input = (over: Record<string, unknown> = {}) => ({
  name: "Midnight Tee",
  slug: "",
  description: "Soft and heavy.",
  fit: "OVERSIZED",
  fabric: "100% Cotton",
  basePricePaise: 69900,
  compareAtPricePaise: 99900,
  status: "ACTIVE",
  isCustomizable: false,
  collectionIds: [] as string[],
  variants: [
    { size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 5 },
    { size: "L", colorName: "Black", colorHex: "#111111", pricePaise: 74900, stock: 2 },
  ],
  ...over,
});

describe("admin products service", () => {
  beforeEach(resetDb);

  it("creates a product with derived unique slug, SKUs and collection links", async () => {
    const col = await createCollection({ name: "Drops" });
    await createProduct({ name: "Midnight Tee" }); // occupies slug midnight-tee
    const { id, slug } = await adminCreate(input({ collectionIds: [col.id] }));
    expect(slug).toBe("midnight-tee-2");
    const p = await getAdminProduct(id);
    expect(p.variants.map((v) => v.sku).sort()).toEqual(["MIDNIGHT-TEE-2-BLACK-L", "MIDNIGHT-TEE-2-BLACK-M"]);
    expect(p.variants.find((v) => v.size === "L")?.pricePaise).toBe(74900);
    expect(p.collectionIds).toEqual([col.id]);
  });

  it("rejects invalid input with field errors", async () => {
    await expect(adminCreate(input({ name: "x", variants: [] }))).rejects.toBeInstanceOf(ValidationError);
    await expect(adminCreate(input({ collectionIds: ["nope"] }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates fields, updates/creates/deletes variants, keeps SKUs stable", async () => {
    const { id } = await adminCreate(input());
    const before = await getAdminProduct(id);
    const m = before.variants.find((v) => v.size === "M")!;
    await updateProduct(id, input({
      name: "Midnight Tee v2",
      slug: "midnight-tee",
      variants: [
        { id: m.id, size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 9 },
        { size: "XL", colorName: "White", colorHex: "#f2f2ee", pricePaise: null, stock: 1 },
      ],
    }));
    const after = await getAdminProduct(id);
    expect(after.name).toBe("Midnight Tee v2");
    expect(after.variants.map((v) => `${v.size}/${v.colorName}/${v.stock}`).sort()).toEqual(["M/Black/9", "XL/White/1"]);
    expect(after.variants.find((v) => v.id === m.id)?.sku).toBe(m.sku);
  });

  it("refuses to drop a variant that is in a customer's bag", async () => {
    const { id } = await adminCreate(input());
    const p = await getAdminProduct(id);
    const l = p.variants.find((v) => v.size === "L")!;
    const cart = await db.cart.create({ data: { guestToken: "g-admin" } });
    await db.cartItem.create({ data: { cartId: cart.id, variantId: l.id, quantity: 1 } });
    const keepOnlyM = p.variants.filter((v) => v.size === "M").map((v) => ({ id: v.id, size: v.size, colorName: v.colorName, colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock }));
    await expect(updateProduct(id, input({ variants: keepOnlyM }))).rejects.toBeInstanceOf(ConflictError);
    expect((await getAdminProduct(id)).variants.find((v) => v.id === l.id)?.inCarts).toBe(1);
  });

  it("rejects variant ids from another product", async () => {
    const other = await createProduct({ name: "Other" });
    const { id } = await adminCreate(input());
    const foreign = { id: other.variants[0].id, size: "M", colorName: "Black", colorHex: "#111111", pricePaise: null, stock: 1 };
    await expect(updateProduct(id, input({ variants: [foreign] }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("syncs collection links, appending new ones at the end and keeping existing order", async () => {
    const a = await createCollection({ name: "A" });
    const b = await createCollection({ name: "B" });
    const existing = await createProduct({ name: "First" });
    await linkProductToCollection(b.id, existing.id, 4);
    const { id } = await adminCreate(input({ collectionIds: [a.id] }));
    await updateProduct(id, input({ collectionIds: [b.id] }));
    const links = await db.productCollection.findMany({ where: { productId: id } });
    expect(links.map((l) => [l.collectionId, l.sortOrder])).toEqual([[b.id, 5]]);
  });

  it("lists with search, status filter, stock totals and first image", async () => {
    await createProduct({ name: "Alpha Tee", status: "DRAFT", images: [{ url: "/a1.svg" }, { url: "/a2.svg" }], variants: [{ size: "S", colorName: "Red", stock: 3 }, { size: "M", colorName: "Red", stock: 4 }] });
    await createProduct({ name: "Beta Tee", status: "ACTIVE" });
    const all = await listAdminProducts();
    expect(all.total).toBe(2);
    const drafts = await listAdminProducts({ status: "DRAFT" });
    expect(drafts.items.map((p) => p.name)).toEqual(["Alpha Tee"]);
    expect(drafts.items[0]).toMatchObject({ variantCount: 2, totalStock: 7, imageUrl: "/a1.svg" });
    expect((await listAdminProducts({ q: "beta" })).items.map((p) => p.name)).toEqual(["Beta Tee"]);
  });

  it("only deletes non-active products and 404s afterwards", async () => {
    const { id } = await adminCreate(input());
    await expect(deleteProduct(id)).rejects.toBeInstanceOf(ConflictError);
    await updateProduct(id, input({ status: "ARCHIVED" }));
    await deleteProduct(id);
    await expect(getAdminProduct(id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

Run: `npm test -- tests/unit/admin-products.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement**

Create `src/server/services/admin-products.ts`:

```ts
import { Prisma, type Fit, type ProductStatus } from "@prisma/client";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { zodFieldErrors } from "@/server/action-result";
import { productInputSchema, type ProductInput } from "@/lib/validation/admin";
import { slugify, uniqueSlug } from "@/lib/slug";
import type { Page } from "@/server/services/catalog";

export interface AdminProductRow { id: string; slug: string; name: string; status: ProductStatus; imageUrl: string | null; variantCount: number; totalStock: number; basePricePaise: number; updatedAt: Date }
export interface AdminVariant { id: string; sku: string; size: string; colorName: string; colorHex: string; pricePaise: number | null; stock: number; inCarts: number }
export interface AdminImage { id: string; url: string; alt: string; colorName: string | null; sortOrder: number }
export interface AdminProductDetail {
  id: string; slug: string; name: string; description: string; fit: Fit; fabric: string;
  basePricePaise: number; compareAtPricePaise: number | null; status: ProductStatus; isCustomizable: boolean;
  collectionIds: string[]; images: AdminImage[]; variants: AdminVariant[];
}

type Tx = Prisma.TransactionClient;

function parse(input: unknown): ProductInput {
  const r = productInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  return r.data;
}

async function productSlug(tx: Tx, desired: string, name: string, selfId?: string): Promise<string> {
  const base = desired || slugify(name);
  return uniqueSlug(base, async (s) => {
    const hit = await tx.product.findUnique({ where: { slug: s }, select: { id: true } });
    return Boolean(hit && hit.id !== selfId);
  });
}

async function freeSku(tx: Tx, slug: string, colorName: string, size: string): Promise<string> {
  const root = `${slug}-${slugify(colorName)}-${size}`.toUpperCase();
  let candidate = root;
  for (let i = 2; await tx.productVariant.findUnique({ where: { sku: candidate }, select: { id: true } }); i++) {
    candidate = `${root}-${i}`;
  }
  return candidate;
}

async function assertCollections(tx: Tx, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const found = await tx.collection.count({ where: { id: { in: ids } } });
  if (found !== new Set(ids).size) throw new ValidationError({ collectionIds: ["Unknown collection"] });
}

async function syncCollections(tx: Tx, productId: string, ids: string[]): Promise<void> {
  const wanted = [...new Set(ids)];
  await tx.productCollection.deleteMany({ where: { productId, collectionId: { notIn: wanted } } });
  const existing = new Set((await tx.productCollection.findMany({ where: { productId }, select: { collectionId: true } })).map((l) => l.collectionId));
  for (const collectionId of wanted) {
    if (existing.has(collectionId)) continue;
    const max = await tx.productCollection.aggregate({ where: { collectionId }, _max: { sortOrder: true } });
    await tx.productCollection.create({ data: { productId, collectionId, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  }
}

async function syncVariants(tx: Tx, productId: string, slug: string, variants: ProductInput["variants"]): Promise<void> {
  const current = await tx.productVariant.findMany({ where: { productId }, include: { _count: { select: { cartItems: true } } } });
  const currentIds = new Set(current.map((v) => v.id));
  const keepIds = new Set(variants.filter((v) => v.id).map((v) => v.id!));
  for (const id of keepIds) if (!currentIds.has(id)) throw new ValidationError({ variants: ["Unknown variant"] });

  const removed = current.filter((v) => !keepIds.has(v.id));
  const blocked = removed.filter((v) => v._count.cartItems > 0);
  if (blocked.length) {
    const names = blocked.map((v) => `${v.size} / ${v.colorName}`).join(", ");
    throw new ConflictError(`${names} is in a customer's bag; set its stock to 0 instead of removing it`);
  }
  if (removed.length) await tx.productVariant.deleteMany({ where: { id: { in: removed.map((v) => v.id) } } });

  for (const [i, v] of variants.entries()) {
    const data = { size: v.size, colorName: v.colorName.trim(), colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock, sortOrder: i };
    if (v.id) {
      await tx.productVariant.update({ where: { id: v.id }, data });
    } else {
      await tx.productVariant.create({ data: { ...data, productId, sku: await freeSku(tx, slug, v.colorName, v.size) } });
    }
  }
}

function mapConflicts(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ConflictError("Two variants ended up with the same size and color, or a slug is taken. Check the variant list.");
  }
  throw err;
}

export async function createProduct(input: unknown): Promise<{ id: string; slug: string }> {
  const data = parse(input);
  try {
    return await db.$transaction(async (tx) => {
      await assertCollections(tx, data.collectionIds);
      const slug = await productSlug(tx, data.slug, data.name);
      const product = await tx.product.create({
        data: {
          slug, name: data.name, description: data.description, fit: data.fit, fabric: data.fabric,
          basePricePaise: data.basePricePaise, compareAtPricePaise: data.compareAtPricePaise,
          status: data.status, isCustomizable: data.isCustomizable,
        },
      });
      await syncVariants(tx, product.id, slug, data.variants.map(({ id: _drop, ...v }) => v));
      await syncCollections(tx, product.id, data.collectionIds);
      return { id: product.id, slug };
    });
  } catch (err) {
    mapConflicts(err);
  }
}

export async function updateProduct(id: string, input: unknown): Promise<{ id: string; slug: string }> {
  const data = parse(input);
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError("Product");
      await assertCollections(tx, data.collectionIds);
      const slug = await productSlug(tx, data.slug, data.name, id);
      await tx.product.update({
        where: { id },
        data: {
          slug, name: data.name, description: data.description, fit: data.fit, fabric: data.fabric,
          basePricePaise: data.basePricePaise, compareAtPricePaise: data.compareAtPricePaise,
          status: data.status, isCustomizable: data.isCustomizable,
        },
      });
      await syncVariants(tx, id, slug, data.variants);
      await syncCollections(tx, id, data.collectionIds);
      return { id, slug };
    });
  } catch (err) {
    mapConflicts(err);
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const p = await db.product.findUnique({ where: { id }, select: { status: true } });
  if (!p) throw new NotFoundError("Product");
  if (p.status === "ACTIVE") throw new ConflictError("Archive the product before deleting it");
  await db.product.delete({ where: { id } });
}

export async function getAdminProduct(id: string): Promise<AdminProductDetail> {
  const p = await db.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { cartItems: true } } } },
      collections: { select: { collectionId: true } },
    },
  });
  if (!p) throw new NotFoundError("Product");
  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description, fit: p.fit, fabric: p.fabric,
    basePricePaise: p.basePricePaise, compareAtPricePaise: p.compareAtPricePaise, status: p.status, isCustomizable: p.isCustomizable,
    collectionIds: p.collections.map((c) => c.collectionId),
    images: p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, colorName: i.colorName, sortOrder: i.sortOrder })),
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, size: v.size, colorName: v.colorName, colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock, inCarts: v._count.cartItems })),
  };
}

export async function listAdminProducts(args: { q?: string; status?: ProductStatus; page?: number; pageSize?: number } = {}): Promise<Page<AdminProductRow>> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 25));
  const q = args.q?.trim();
  const where: Prisma.ProductWhereInput = {
    ...(args.status ? { status: args.status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, variants: { select: { stock: true } } },
    }),
  ]);
  return {
    items: rows.map((p) => ({
      id: p.id, slug: p.slug, name: p.name, status: p.status, imageUrl: p.images[0]?.url ?? null,
      variantCount: p.variants.length, totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
      basePricePaise: p.basePricePaise, updatedAt: p.updatedAt,
    })),
    total, page, pageSize, hasMore: page * pageSize < total,
  };
}
```

Notes for the implementer:
- `mapConflicts` returns `never`, so TypeScript accepts the functions' return types; if the compiler still complains about a missing return after `catch`, add `throw err;` after the call (unreachable) rather than changing the signature.
- The destructure `({ id: _drop, ...v })` in `createProduct` strips any client-sent ids on create. If ESLint flags `_drop` as unused, prefix-underscore is allowed only if the config permits it; otherwise map explicitly: `data.variants.map((v) => ({ size: v.size, colorName: v.colorName, colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock }))`.

- [ ] **Step 3: Verify and commit**

Run: `npm test -- tests/unit/admin-products.test.ts` (8 passing), then the full gate. Commit:

```bash
git add src/server/services/admin-products.ts tests/unit/admin-products.test.ts
git commit -m "feat(admin): add admin products service with variant and collection sync

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 3: Image, collection, and dashboard services; hardened upload serving

**Files:**
- Create: `src/server/services/admin-images.ts`, `src/server/services/admin-collections.ts`, `src/server/services/admin-dashboard.ts`
- Modify: `src/server/uploads.ts` (add `uploadKeyFromUrl`), `src/app/api/uploads/[...path]/route.ts` (headers)
- Test: `tests/unit/admin-images.test.ts`, `tests/unit/admin-collections.test.ts`, `tests/unit/admin-dashboard.test.ts`, `tests/unit/uploads-route.test.ts`

**Interfaces:**
- Consumes: `storeImage`, `getStorage`, `LOCAL_UPLOAD_ROOT`, `imageUpdateSchema`, `collectionInputSchema`, `AdminImage` (Task 2), fixtures.
- Produces:

```ts
// @/server/uploads (added)
export function uploadKeyFromUrl(url: string): string | null;   // key if the URL was produced by the active storage adapter, else null (e.g. /seed/*.svg)
// @/server/services/admin-images
export const MAX_FILES_PER_UPLOAD = 10;
export const MAX_IMAGES_PER_PRODUCT = 20;
export function addProductImages(productId: string, files: File[]): Promise<AdminImage[]>;          // appended in order; ValidationError on count limits or bad files
export function updateProductImage(imageId: string, input: unknown): Promise<AdminImage>;          // alt, colorName (null clears)
export function reorderProductImages(productId: string, orderedIds: string[]): Promise<void>;      // ids must be exactly this product's images
export function deleteProductImage(imageId: string): Promise<{ productId: string }>;               // also deletes the stored file when uploadKeyFromUrl matches
// @/server/services/admin-collections
export interface AdminCollectionRow { id: string; slug: string; name: string; isActive: boolean; isFeatured: boolean; sortOrder: number; productCount: number }
export interface AdminCollectionDetail extends AdminCollectionRow { description: string; heroImageUrl: string | null; products: { id: string; name: string; slug: string; status: ProductStatus; imageUrl: string | null }[] }
export function listAdminCollections(): Promise<AdminCollectionRow[]>;           // sortOrder, then name
export function listCollectionOptions(): Promise<{ id: string; name: string }[]>;
export function getAdminCollection(id: string): Promise<AdminCollectionDetail>; // products in ProductCollection.sortOrder
export function createCollection(input: unknown): Promise<{ id: string; slug: string }>;
export function updateCollection(id: string, input: unknown): Promise<{ id: string; slug: string }>;
export function deleteCollection(id: string): Promise<void>;                    // links cascade; products untouched
export function setCollectionHero(id: string, file: File | null): Promise<string | null>; // null removes; returns new URL
export function reorderCollectionProducts(id: string, orderedProductIds: string[]): Promise<void>;
export function removeProductFromCollection(id: string, productId: string): Promise<void>;
// @/server/services/admin-dashboard
export interface DashboardStats { activeProducts: number; draftProducts: number; archivedProducts: number; lowStockVariants: number; customers: number; lowStock: { productId: string; productName: string; size: string; colorName: string; stock: number }[] }
export function getDashboardStats(): Promise<DashboardStats>;   // low stock = ACTIVE products' variants with stock < 5, list top 10 by stock asc
```

- [ ] **Step 1: Failing tests**

Create `tests/unit/admin-images.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

const root = mkdtempSync(join(tmpdir(), "admin-img-"));
const storage = new LocalDiskStorage(root, "/api/uploads");
vi.mock("@/server/adapters/storage", async (orig) => ({ ...(await orig<typeof import("@/server/adapters/storage")>()), getStorage: () => storage }));

import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct } from "../helpers/fixtures";
import { addProductImages, deleteProductImage, reorderProductImages, updateProductImage } from "@/server/services/admin-images";
import { ValidationError } from "@/server/errors";
import { existsSync } from "node:fs";

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "a.png", { type: "image/png" });
const gif = () => new File([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0])], "a.gif", { type: "image/gif" });

describe("admin images service", () => {
  beforeEach(resetDb);

  it("appends uploaded images after existing ones and stores the files", async () => {
    const p = await createProduct({ images: [{ url: "/seed/x.svg" }] });
    const added = await addProductImages(p.id, [png(), png()]);
    expect(added.map((i) => i.sortOrder)).toEqual([1, 2]);
    expect(added[0].url).toMatch(new RegExp(`^/api/uploads/products/${p.id}/`));
    expect(existsSync(join(root, added[0].url.replace("/api/uploads/", "")))).toBe(true);
  });

  it("rejects bad files and count limits without saving anything", async () => {
    const p = await createProduct({ images: [] });
    await expect(addProductImages(p.id, [png(), gif()])).rejects.toBeInstanceOf(ValidationError);
    expect(await db.productImage.count({ where: { productId: p.id } })).toBe(0);
    await expect(addProductImages(p.id, Array.from({ length: 11 }, png))).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates alt and color tag, reorders, and deletes with file cleanup", async () => {
    const p = await createProduct({ images: [] });
    const [a, b] = await addProductImages(p.id, [png(), png()]);
    expect((await updateProductImage(a.id, { alt: "Front", colorName: "Black" })).colorName).toBe("Black");
    expect((await updateProductImage(a.id, { alt: "Front", colorName: null })).colorName).toBeNull();
    await reorderProductImages(p.id, [b.id, a.id]);
    const order = await db.productImage.findMany({ where: { productId: p.id }, orderBy: { sortOrder: "asc" } });
    expect(order.map((i) => i.id)).toEqual([b.id, a.id]);
    await expect(reorderProductImages(p.id, [a.id])).rejects.toBeInstanceOf(ValidationError);
    await deleteProductImage(a.id);
    expect(existsSync(join(root, a.url.replace("/api/uploads/", "")))).toBe(false);
    expect(await db.productImage.count({ where: { productId: p.id } })).toBe(1);
  });

  it("does not try to delete seed files that the storage adapter did not create", async () => {
    const p = await createProduct({ images: [{ url: "/seed/keep.svg" }] });
    await expect(deleteProductImage(p.images[0].id)).resolves.toEqual({ productId: p.id });
  });
});
```

Create `tests/unit/admin-collections.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct, linkProductToCollection } from "../helpers/fixtures";
import {
  createCollection as adminCreate, deleteCollection, getAdminCollection, listAdminCollections,
  listCollectionOptions, removeProductFromCollection, reorderCollectionProducts, updateCollection,
} from "@/server/services/admin-collections";
import { NotFoundError, ValidationError } from "@/server/errors";

const input = (over: Record<string, unknown> = {}) => ({ name: "Summer Drop", slug: "", description: "Hot.", isFeatured: false, isActive: true, sortOrder: 3, ...over });

describe("admin collections service", () => {
  beforeEach(resetDb);

  it("creates with a unique slug and lists by sortOrder with product counts", async () => {
    await createCollection({ name: "Summer Drop", sortOrder: 9 });
    const { slug } = await adminCreate(input());
    expect(slug).toBe("summer-drop-2");
    const rows = await listAdminCollections();
    expect(rows.map((r) => r.slug)).toEqual(["summer-drop-2", "summer-drop"]);
    expect((await listCollectionOptions()).length).toBe(2);
    await expect(adminCreate(input({ name: "x" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates, reorders and removes products, deletes without touching products", async () => {
    const c = await createCollection({ name: "Box" });
    const a = await createProduct({ name: "A" });
    const b = await createProduct({ name: "B" });
    await linkProductToCollection(c.id, a.id, 0);
    await linkProductToCollection(c.id, b.id, 1);
    await updateCollection(c.id, input({ name: "Box Set", slug: "box-set", isFeatured: true }));
    await reorderCollectionProducts(c.id, [b.id, a.id]);
    let d = await getAdminCollection(c.id);
    expect(d).toMatchObject({ name: "Box Set", slug: "box-set", isFeatured: true });
    expect(d.products.map((p) => p.name)).toEqual(["B", "A"]);
    await expect(reorderCollectionProducts(c.id, [a.id])).rejects.toBeInstanceOf(ValidationError);
    await removeProductFromCollection(c.id, a.id);
    d = await getAdminCollection(c.id);
    expect(d.products.map((p) => p.name)).toEqual(["B"]);
    await deleteCollection(c.id);
    await expect(getAdminCollection(c.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.product.count()).toBe(2);
  });
});
```

Create `tests/unit/admin-dashboard.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct } from "../helpers/fixtures";
import { getDashboardStats } from "@/server/services/admin-dashboard";

describe("admin dashboard", () => {
  beforeEach(resetDb);

  it("counts products by status, low-stock active variants, and customers", async () => {
    await createProduct({ name: "Live", status: "ACTIVE", variants: [{ size: "S", colorName: "Red", stock: 2 }, { size: "M", colorName: "Red", stock: 9 }] });
    await createProduct({ name: "Draft", status: "DRAFT", variants: [{ size: "S", colorName: "Red", stock: 0 }] });
    await createProduct({ name: "Old", status: "ARCHIVED" });
    await db.user.create({ data: { email: "c@x.test" } });
    await db.user.create({ data: { email: "a@x.test", role: "ADMIN" } });
    const s = await getDashboardStats();
    expect(s).toMatchObject({ activeProducts: 1, draftProducts: 1, archivedProducts: 1, lowStockVariants: 1, customers: 1 });
    expect(s.lowStock).toEqual([{ productId: expect.any(String), productName: "Live", size: "S", colorName: "Red", stock: 2 }]);
  });
});
```

Create `tests/unit/uploads-route.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOCAL_UPLOAD_ROOT } from "@/server/adapters/storage";
import { GET } from "@/app/api/uploads/[...path]/route";

const call = (path: string[]) => GET(new Request("http://x/api/uploads"), { params: Promise.resolve({ path }) });

describe("uploads route", () => {
  beforeAll(() => {
    mkdirSync(join(LOCAL_UPLOAD_ROOT, "test-route"), { recursive: true });
    writeFileSync(join(LOCAL_UPLOAD_ROOT, "test-route", "ok.png"), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it("serves allowed files with hardened headers", async () => {
    const res = await call(["test-route", "ok.png"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
  });

  it("404s traversal, unknown extensions, and missing files", async () => {
    expect((await call(["..", "..", "package.json"])).status).toBe(404);
    expect((await call(["test-route", "x.svg"])).status).toBe(404);
    expect((await call(["test-route", "missing.png"])).status).toBe(404);
  });
});
```

Run: `npm test -- tests/unit/admin-images.test.ts tests/unit/admin-collections.test.ts tests/unit/admin-dashboard.test.ts tests/unit/uploads-route.test.ts` — Expected: FAIL (modules missing, headers missing).

- [ ] **Step 2: Implement**

Append to `src/server/uploads.ts`:

```ts
/** Returns the storage key for URLs produced by the active storage adapter; null for anything else (e.g. /seed/*.svg). */
export function uploadKeyFromUrl(url: string): string | null {
  const prefix = getStorage().getPublicUrl("");
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return key && !key.includes("..") ? key : null;
}
```

Modify the success response in `src/app/api/uploads/[...path]/route.ts` to:

```ts
return new Response(bytes, {
  headers: {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
  },
});
```

Create `src/server/services/admin-images.ts`:

```ts
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { zodFieldErrors } from "@/server/action-result";
import { getStorage } from "@/server/adapters/storage";
import { storeImage, uploadKeyFromUrl, validateImage } from "@/server/uploads";
import { imageUpdateSchema } from "@/lib/validation/admin";
import type { AdminImage } from "@/server/services/admin-products";

export const MAX_FILES_PER_UPLOAD = 10;
export const MAX_IMAGES_PER_PRODUCT = 20;

function toAdmin(i: { id: string; url: string; alt: string; colorName: string | null; sortOrder: number }): AdminImage {
  return { id: i.id, url: i.url, alt: i.alt, colorName: i.colorName, sortOrder: i.sortOrder };
}

export async function addProductImages(productId: string, files: File[]): Promise<AdminImage[]> {
  if (files.length === 0) throw new ValidationError({ files: ["Choose at least one image"] });
  if (files.length > MAX_FILES_PER_UPLOAD) throw new ValidationError({ files: [`Upload at most ${MAX_FILES_PER_UPLOAD} images at a time`] });
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, name: true, _count: { select: { images: true } } } });
  if (!product) throw new NotFoundError("Product");
  if (product._count.images + files.length > MAX_IMAGES_PER_PRODUCT) {
    throw new ValidationError({ files: [`A product can have at most ${MAX_IMAGES_PER_PRODUCT} images`] });
  }
  // Validate every file before storing any, so a bad file in the batch saves nothing.
  for (const f of files) validateImage(new Uint8Array(await f.arrayBuffer()));
  const max = await db.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } });
  let next = (max._max.sortOrder ?? -1) + 1;
  const created: AdminImage[] = [];
  for (const f of files) {
    const { url } = await storeImage(f, `products/${productId}`);
    const row = await db.productImage.create({ data: { productId, url, alt: product.name, sortOrder: next++ } });
    created.push(toAdmin(row));
  }
  return created;
}

export async function updateProductImage(imageId: string, input: unknown): Promise<AdminImage> {
  const r = imageUpdateSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  const exists = await db.productImage.findUnique({ where: { id: imageId }, select: { id: true } });
  if (!exists) throw new NotFoundError("Image");
  const row = await db.productImage.update({ where: { id: imageId }, data: { alt: r.data.alt, colorName: r.data.colorName || null } });
  return toAdmin(row);
}

export async function reorderProductImages(productId: string, orderedIds: string[]): Promise<void> {
  const current = await db.productImage.findMany({ where: { productId }, select: { id: true } });
  const ids = new Set(current.map((i) => i.id));
  if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(id)) || new Set(orderedIds).size !== orderedIds.length) {
    throw new ValidationError({ images: ["Image order does not match this product's images"] });
  }
  await db.$transaction(orderedIds.map((id, i) => db.productImage.update({ where: { id }, data: { sortOrder: i } })));
}

export async function deleteProductImage(imageId: string): Promise<{ productId: string }> {
  const img = await db.productImage.findUnique({ where: { id: imageId } });
  if (!img) throw new NotFoundError("Image");
  await db.productImage.delete({ where: { id: imageId } });
  const key = uploadKeyFromUrl(img.url);
  if (key) {
    try {
      await getStorage().delete(key);
    } catch (err) {
      console.error("[admin-images] could not delete stored file", key, err);
    }
  }
  return { productId: img.productId };
}
```

Create `src/server/services/admin-collections.ts`:

```ts
import type { ProductStatus } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { zodFieldErrors } from "@/server/action-result";
import { getStorage } from "@/server/adapters/storage";
import { storeImage, uploadKeyFromUrl } from "@/server/uploads";
import { collectionInputSchema, type CollectionInput } from "@/lib/validation/admin";
import { slugify, uniqueSlug } from "@/lib/slug";

export interface AdminCollectionRow { id: string; slug: string; name: string; isActive: boolean; isFeatured: boolean; sortOrder: number; productCount: number }
export interface AdminCollectionDetail extends AdminCollectionRow {
  description: string; heroImageUrl: string | null;
  products: { id: string; name: string; slug: string; status: ProductStatus; imageUrl: string | null }[];
}

function parse(input: unknown): CollectionInput {
  const r = collectionInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  return r.data;
}

async function collectionSlug(desired: string, name: string, selfId?: string): Promise<string> {
  return uniqueSlug(desired || slugify(name), async (s) => {
    const hit = await db.collection.findUnique({ where: { slug: s }, select: { id: true } });
    return Boolean(hit && hit.id !== selfId);
  });
}

export async function listAdminCollections(): Promise<AdminCollectionRow[]> {
  const rows = await db.collection.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });
  return rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, isActive: c.isActive, isFeatured: c.isFeatured, sortOrder: c.sortOrder, productCount: c._count.products }));
}

export async function listCollectionOptions(): Promise<{ id: string; name: string }[]> {
  return db.collection.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

export async function getAdminCollection(id: string): Promise<AdminCollectionDetail> {
  const c = await db.collection.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } },
      products: { orderBy: { sortOrder: "asc" }, include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } } },
    },
  });
  if (!c) throw new NotFoundError("Collection");
  return {
    id: c.id, slug: c.slug, name: c.name, isActive: c.isActive, isFeatured: c.isFeatured, sortOrder: c.sortOrder, productCount: c._count.products,
    description: c.description, heroImageUrl: c.heroImageUrl,
    products: c.products.map((l) => ({ id: l.product.id, name: l.product.name, slug: l.product.slug, status: l.product.status, imageUrl: l.product.images[0]?.url ?? null })),
  };
}

export async function createCollection(input: unknown): Promise<{ id: string; slug: string }> {
  const data = parse(input);
  const slug = await collectionSlug(data.slug, data.name);
  const c = await db.collection.create({ data: { slug, name: data.name, description: data.description, isFeatured: data.isFeatured, isActive: data.isActive, sortOrder: data.sortOrder } });
  return { id: c.id, slug };
}

export async function updateCollection(id: string, input: unknown): Promise<{ id: string; slug: string }> {
  const data = parse(input);
  const exists = await db.collection.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError("Collection");
  const slug = await collectionSlug(data.slug, data.name, id);
  await db.collection.update({ where: { id }, data: { slug, name: data.name, description: data.description, isFeatured: data.isFeatured, isActive: data.isActive, sortOrder: data.sortOrder } });
  return { id, slug };
}

export async function deleteCollection(id: string): Promise<void> {
  const c = await db.collection.findUnique({ where: { id }, select: { heroImageUrl: true } });
  if (!c) throw new NotFoundError("Collection");
  await db.collection.delete({ where: { id } });
  const key = c.heroImageUrl ? uploadKeyFromUrl(c.heroImageUrl) : null;
  if (key) await getStorage().delete(key).catch((err) => console.error("[admin-collections] hero cleanup failed", err));
}

export async function setCollectionHero(id: string, file: File | null): Promise<string | null> {
  const c = await db.collection.findUnique({ where: { id }, select: { heroImageUrl: true } });
  if (!c) throw new NotFoundError("Collection");
  const url = file ? (await storeImage(file, `collections/${id}`)).url : null;
  await db.collection.update({ where: { id }, data: { heroImageUrl: url } });
  const oldKey = c.heroImageUrl ? uploadKeyFromUrl(c.heroImageUrl) : null;
  if (oldKey) await getStorage().delete(oldKey).catch((err) => console.error("[admin-collections] hero cleanup failed", err));
  return url;
}

export async function reorderCollectionProducts(id: string, orderedProductIds: string[]): Promise<void> {
  const links = await db.productCollection.findMany({ where: { collectionId: id }, select: { productId: true } });
  const ids = new Set(links.map((l) => l.productId));
  if (orderedProductIds.length !== ids.size || !orderedProductIds.every((p) => ids.has(p)) || new Set(orderedProductIds).size !== orderedProductIds.length) {
    throw new ValidationError({ products: ["Product order does not match this collection"] });
  }
  await db.$transaction(orderedProductIds.map((productId, i) => db.productCollection.update({ where: { productId_collectionId: { productId, collectionId: id } }, data: { sortOrder: i } })));
}

export async function removeProductFromCollection(id: string, productId: string): Promise<void> {
  await db.productCollection.deleteMany({ where: { collectionId: id, productId } });
}
```

Check the compound unique name generated by Prisma for `ProductCollection @@id([productId, collectionId])`: it is `productId_collectionId`. If typecheck says otherwise, use the generated name.

Create `src/server/services/admin-dashboard.ts`:

```ts
import { db } from "@/server/db";

export interface DashboardStats {
  activeProducts: number; draftProducts: number; archivedProducts: number; lowStockVariants: number; customers: number;
  lowStock: { productId: string; productName: string; size: string; colorName: string; stock: number }[];
}

const LOW = 5;

export async function getDashboardStats(): Promise<DashboardStats> {
  const lowWhere = { stock: { lt: LOW }, product: { status: "ACTIVE" as const } };
  const [byStatus, lowStockVariants, customers, low] = await Promise.all([
    db.product.groupBy({ by: ["status"], _count: { _all: true } }),
    db.productVariant.count({ where: lowWhere }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.productVariant.findMany({ where: lowWhere, orderBy: [{ stock: "asc" }, { product: { name: "asc" } }], take: 10, include: { product: { select: { id: true, name: true } } } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    activeProducts: count("ACTIVE"), draftProducts: count("DRAFT"), archivedProducts: count("ARCHIVED"),
    lowStockVariants, customers,
    lowStock: low.map((v) => ({ productId: v.product.id, productName: v.product.name, size: v.size, colorName: v.colorName, stock: v.stock })),
  };
}
```

- [ ] **Step 3: Verify and commit**

Run the four test files (GREEN), then the full gate. The `uploads-route` test writes into `storage/uploads/test-route/` (gitignored). Commit:

```bash
git add src/server/uploads.ts src/app/api/uploads src/server/services/admin-images.ts src/server/services/admin-collections.ts src/server/services/admin-dashboard.ts tests/unit/admin-images.test.ts tests/unit/admin-collections.test.ts tests/unit/admin-dashboard.test.ts tests/unit/uploads-route.test.ts
git commit -m "feat(admin): add image, collection, and dashboard services; harden upload serving

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 4: Admin shell, dashboard, and products list

**Files:**
- Create: `src/app/admin/guard.ts`, `src/app/admin/layout.tsx`, `src/components/admin/admin-nav.tsx`, `src/app/admin/page.tsx`, `src/components/admin/stat-tile.tsx`, `src/components/admin/status-badge.tsx`, `src/app/admin/products/page.tsx`, `src/components/admin/products-table.tsx`, `src/app/admin/not-found.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `getDashboardStats`, `listAdminProducts`, `formatPaise`, `signOutAction` from `@/app/(storefront)/account/actions`, `BRAND`.
- Produces:

```ts
// @/app/admin/guard (server only)
export function requireAdminPage(): Promise<{ userId: string }>;   // redirects to /login?next=/admin on failure
// components
<AdminNav />                                   // "use client"; highlights the active section
<StatTile label value href? tone?="default"|"warn" />
<StatusBadge status={ProductStatus} />
<ProductsTable rows={AdminProductRow[]} />
```

Pages (all Server Components, each starts with `await requireAdminPage()`):
- `/admin` — dashboard.
- `/admin/products?q=&status=&page=` — list with search, status filter, pagination, "New product" button.

- [ ] **Step 1: Guard and shell**

Create `src/app/admin/guard.ts`:

```ts
import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/admin-guard";

export async function requireAdminPage(): Promise<{ userId: string }> {
  const result = await requireAdmin().then(
    (r) => ({ ok: true as const, r }),
    () => ({ ok: false as const }),
  );
  if (!result.ok) redirect("/login?next=%2Fadmin");
  return result.r;
}
```

Create `src/components/admin/admin-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Layers, Store } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/collections", label: "Collections", icon: Layers },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 lg:flex-col" aria-label="Admin">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", active ? "bg-surface-raised text-text" : "text-text-muted hover:bg-surface hover:text-text")}>
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
      <Link href="/" className="mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-muted hover:text-text lg:mt-6">
        <Store className="size-4" /> View store
      </Link>
    </nav>
  );
}
```

Create `src/app/admin/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/storefront/account/sign-out-button";
import { BRAND } from "@/config/brand";
import { requireAdminPage } from "./guard";

export const metadata: Metadata = { title: { default: "Admin", template: `%s · Admin | ${BRAND.name}` }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[220px_1fr]" data-testid="admin-shell">
      <aside className="border-b border-border bg-surface p-4 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="mb-4 flex items-center justify-between lg:mb-8 lg:block">
          <p className="font-display text-2xl uppercase">{BRAND.name}</p>
          <p className="text-xs uppercase tracking-widest text-text-muted">Admin</p>
        </div>
        <AdminNav />
        <div className="mt-6 hidden lg:block"><SignOutButton /></div>
      </aside>
      <main className="min-w-0 p-4 sm:p-8">{children}</main>
    </div>
  );
}
```

Create `src/app/admin/not-found.tsx`:

```tsx
import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="py-20">
      <h1 className="text-4xl">Not found</h1>
      <p className="mt-2 text-text-muted">That record does not exist or was deleted.</p>
      <Link href="/admin" className="mt-4 inline-block text-sm underline-offset-4 hover:underline">Back to dashboard</Link>
    </div>
  );
}
```

- [ ] **Step 2: Small shared components**

Create `src/components/admin/stat-tile.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatTile({ label, value, href, tone = "default" }: { label: string; value: number | string; href?: string; tone?: "default" | "warn" }) {
  const body = (
    <div className={cn("rounded-md border bg-surface p-5", tone === "warn" && Number(value) > 0 ? "border-danger/60" : "border-border")}>
      <p className="text-xs uppercase tracking-widest text-text-muted">{label}</p>
      <p className={cn("mt-2 font-display text-5xl", tone === "warn" && Number(value) > 0 && "text-danger")}>{value}</p>
    </div>
  );
  return href ? <Link href={href} className="block transition-opacity hover:opacity-90">{body}</Link> : body;
}
```

Create `src/components/admin/status-badge.tsx`:

```tsx
import type { ProductStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const STYLES: Record<ProductStatus, string> = {
  ACTIVE: "bg-brand text-brand-ink",
  DRAFT: "bg-surface-raised text-text",
  ARCHIVED: "bg-surface text-text-muted border border-border",
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide", STYLES[status])} data-testid="status-badge">{status.toLowerCase()}</span>;
}
```

- [ ] **Step 3: Dashboard page**

Create `src/app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/admin/stat-tile";
import { getDashboardStats } from "@/server/services/admin-dashboard";
import { requireAdminPage } from "./guard";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  await requireAdminPage();
  const s = await getDashboardStats();
  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-5xl">Dashboard</h1>
        <Button render={<Link href="/admin/products/new" />} nativeButton={false}>New product</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Live products" value={s.activeProducts} href="/admin/products?status=ACTIVE" />
        <StatTile label="Drafts" value={s.draftProducts} href="/admin/products?status=DRAFT" />
        <StatTile label="Archived" value={s.archivedProducts} href="/admin/products?status=ARCHIVED" />
        <StatTile label="Low-stock variants" value={s.lowStockVariants} tone="warn" />
        <StatTile label="Customers" value={s.customers} />
      </div>
      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="mb-4 text-2xl">Running low</h2>
        {s.lowStock.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="low-stock-empty">Every live variant has 5 or more in stock.</p>
        ) : (
          <table className="w-full text-sm" data-testid="low-stock-table">
            <thead><tr className="text-left text-text-muted"><th className="py-2">Product</th><th>Variant</th><th className="text-right">Stock</th></tr></thead>
            <tbody>
              {s.lowStock.map((v) => (
                <tr key={`${v.productId}-${v.size}-${v.colorName}`} className="border-t border-border">
                  <td className="py-2"><Link href={`/admin/products/${v.productId}`} className="hover:underline">{v.productName}</Link></td>
                  <td>{v.colorName} / {v.size}</td>
                  <td className={v.stock === 0 ? "text-right text-danger" : "text-right"}>{v.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Products list**

Create `src/components/admin/products-table.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { formatPaise } from "@/lib/money";
import type { AdminProductRow } from "@/server/services/admin-products";
import { StatusBadge } from "./status-badge";

export function ProductsTable({ rows }: { rows: AdminProductRow[] }) {
  if (!rows.length) return <p className="py-16 text-center text-text-muted" data-testid="products-empty">No products match.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] text-sm" data-testid="products-table">
        <thead className="bg-surface text-left text-text-muted">
          <tr><th className="p-3">Product</th><th>Status</th><th className="text-right">Variants</th><th className="text-right">Stock</th><th className="text-right">Price</th><th className="p-3 text-right">Updated</th></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border hover:bg-surface/60" data-testid="product-row">
              <td className="p-3">
                <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 font-medium hover:underline">
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-sm bg-surface-raised">
                    {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" />}
                  </span>
                  {p.name}
                </Link>
              </td>
              <td><StatusBadge status={p.status} /></td>
              <td className="text-right">{p.variantCount}</td>
              <td className={p.totalStock === 0 ? "text-right text-danger" : "text-right"}>{p.totalStock}</td>
              <td className="text-right">{formatPaise(p.basePricePaise)}</td>
              <td className="p-3 text-right text-text-muted">{p.updatedAt.toLocaleDateString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Create `src/app/admin/products/page.tsx`:

```tsx
import Link from "next/link";
import type { ProductStatus } from "@prisma/client";
import { ProductsTable } from "@/components/admin/products-table";
import { Button } from "@/components/ui/button";
import { listAdminProducts } from "@/server/services/admin-products";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Products" };

const STATUSES: ProductStatus[] = ["ACTIVE", "DRAFT", "ARCHIVED"];

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> };

export default async function AdminProductsPage({ searchParams }: Props) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const page = Math.max(1, Number(sp.page) || 1);
  const result = await listAdminProducts({ q: sp.q, status, page });
  const link = (p: number) => {
    const q = new URLSearchParams();
    if (sp.q) q.set("q", sp.q);
    if (status) q.set("status", status);
    if (p > 1) q.set("page", String(p));
    return `/admin/products${q.size ? `?${q}` : ""}`;
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl">Products</h1>
          <p className="text-sm text-text-muted" data-testid="products-count">{result.total} products</p>
        </div>
        <Button render={<Link href="/admin/products/new" />} nativeButton={false} data-testid="new-product">New product</Button>
      </div>
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name or slug" aria-label="Search products" className="h-9 w-64 rounded-md border border-border bg-surface px-3 text-sm" />
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className="h-9 rounded-md border border-border bg-surface px-3 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <ProductsTable rows={result.items} />
      <div className="flex items-center justify-between text-sm">
        {page > 1 ? <Link href={link(page - 1)} className="hover:underline">← Previous</Link> : <span />}
        <span className="text-text-muted">Page {page}</span>
        {result.hasMore ? <Link href={link(page + 1)} className="hover:underline">Next →</Link> : <span />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4b: Verify**

Run the full gate. Then on `npx next dev -p 3001` (with `NEXT_PUBLIC_SITE_URL=http://localhost:3001` in that shell only): log in as the seeded admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD` from `.env`) → `/admin` shows five tiles and the low-stock list (the seed has low-stock products), `/admin/products` lists 16 products, searching "blank" narrows to 2, status filter works; a customer account visiting `/admin` lands on `/login`. Stop the server; confirm nothing listens on 3001.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin src/components/admin
git commit -m "feat(admin): add admin shell, dashboard, and products list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 5: Product editor — form state helper, variant matrix, save and delete actions, new and edit pages

**Files:**
- Create: `src/lib/product-form.ts`, `src/app/admin/products/actions.ts`, `src/components/admin/product-editor.tsx`, `src/components/admin/variant-matrix.tsx`, `src/components/admin/delete-product-button.tsx`, `src/components/admin/field-error.tsx`, `src/app/admin/products/new/page.tsx`, `src/app/admin/products/[id]/page.tsx`
- Test: `tests/unit/product-form.test.ts`

**Interfaces:**
- Consumes: `buildVariantRows`, `variantKey`, `VariantRow`, `ColorSpec` (Task 1); `rupeesToPaise`, `paiseToRupees`; `ProductInput`; `createProduct`, `updateProduct`, `deleteProduct`, `getAdminProduct`, `AdminProductDetail` (Task 2); `listCollectionOptions` (Task 3); `requireAdmin`, `requireAdminPage`; `actionError`, `ActionResult`.
- Produces:

```ts
// @/lib/product-form (client-safe, pure; must not import from @/server/*)
export interface ProductFormState {
  name: string; slug: string; description: string; fit: "OVERSIZED" | "REGULAR" | "RELAXED"; fabric: string;
  priceText: string; compareAtText: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; isCustomizable: boolean;
  collectionIds: string[]; sizes: string[]; colors: ColorSpec[]; rows: VariantRow[];
}
export interface ProductLike { name: string; slug: string; description: string; fit: ProductFormState["fit"]; fabric: string; basePricePaise: number; compareAtPricePaise: number | null; status: ProductFormState["status"]; isCustomizable: boolean; collectionIds: string[]; variants: { id: string; size: string; colorName: string; colorHex: string; pricePaise: number | null; stock: number }[] }
export function emptyProductForm(): ProductFormState;
export function productFormFromProduct(p: ProductLike): ProductFormState;
export function toProductInput(s: ProductFormState): { input: ProductInput | null; errors: Record<string, string[]> };  // price text errors reported locally
// @/app/admin/products/actions ("use server")
export function saveProductAction(id: string | null, input: ProductInput): Promise<ActionResult<{ id: string; slug: string }>>;
export function deleteProductAction(id: string): Promise<ActionResult<null>>;
// components
<ProductEditor product={AdminProductDetail | null} collections={{ id: string; name: string }[]} />   // "use client"
<VariantMatrix state={ProductFormState} onChange={(next: ProductFormState) => void} inCarts={Record<string, number>} />
<DeleteProductButton id={string} status={ProductStatus} />
<FieldError errors={string[] | undefined} />
```

- [ ] **Step 1: Failing test for the pure form helper**

Create `tests/unit/product-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyProductForm, productFormFromProduct, toProductInput } from "@/lib/product-form";

describe("product form helper", () => {
  it("starts empty with one black color and no sizes", () => {
    const s = emptyProductForm();
    expect(s.status).toBe("DRAFT");
    expect(s.colors).toEqual([{ name: "Black", hex: "#111111" }]);
    expect(s.rows).toEqual([]);
  });

  it("loads a product into sizes, colors, and rows keyed by size|color", () => {
    const s = productFormFromProduct({
      name: "Tee", slug: "tee", description: "", fit: "REGULAR", fabric: "Cotton", basePricePaise: 54950, compareAtPricePaise: null,
      status: "ACTIVE", isCustomizable: true, collectionIds: ["c1"],
      variants: [
        { id: "v1", size: "L", colorName: "White", colorHex: "#ffffff", pricePaise: null, stock: 3 },
        { id: "v2", size: "S", colorName: "White", colorHex: "#ffffff", pricePaise: 49900, stock: 0 },
      ],
    });
    expect(s.priceText).toBe("549.50");
    expect(s.sizes).toEqual(["S", "L"]);
    expect(s.colors).toEqual([{ name: "White", hex: "#ffffff" }]);
    expect(s.rows.map((r) => [r.key, r.id, r.stock])).toEqual([["S|white", "v2", 0], ["L|white", "v1", 3]]);
  });

  it("converts to service input, reporting bad price text locally", () => {
    const s = { ...emptyProductForm(), name: "Tee", fabric: "Cotton", priceText: "abc" };
    expect(toProductInput(s).errors.basePricePaise).toBeDefined();
    const ok = toProductInput({ ...s, priceText: "599", compareAtText: "" });
    expect(ok.errors).toEqual({});
    expect(ok.input).toMatchObject({ basePricePaise: 59900, compareAtPricePaise: null, variants: [] });
  });
});
```

Run: `npm test -- tests/unit/product-form.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement the helper**

Create `src/lib/product-form.ts`:

```ts
import { rupeesToPaise, paiseToRupees } from "@/lib/money";
import { SIZES } from "@/lib/sizes";
import { buildVariantRows, variantKey, type ColorSpec, type VariantRow } from "@/lib/variant-rows";
import type { ProductInput } from "@/lib/validation/admin";

export interface ProductFormState {
  name: string; slug: string; description: string; fit: "OVERSIZED" | "REGULAR" | "RELAXED"; fabric: string;
  priceText: string; compareAtText: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; isCustomizable: boolean;
  collectionIds: string[]; sizes: string[]; colors: ColorSpec[]; rows: VariantRow[];
}

export interface ProductLike {
  name: string; slug: string; description: string; fit: ProductFormState["fit"]; fabric: string;
  basePricePaise: number; compareAtPricePaise: number | null; status: ProductFormState["status"]; isCustomizable: boolean;
  collectionIds: string[];
  variants: { id: string; size: string; colorName: string; colorHex: string; pricePaise: number | null; stock: number }[];
}

export function emptyProductForm(): ProductFormState {
  return {
    name: "", slug: "", description: "", fit: "OVERSIZED", fabric: "100% Cotton", priceText: "", compareAtText: "",
    status: "DRAFT", isCustomizable: false, collectionIds: [], sizes: [], colors: [{ name: "Black", hex: "#111111" }], rows: [],
  };
}

export function productFormFromProduct(p: ProductLike): ProductFormState {
  const order = new Map<string, number>(SIZES.map((s, i) => [s, i]));
  const sizes = [...new Set(p.variants.map((v) => v.size))].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  const colorMap = new Map<string, ColorSpec>();
  for (const v of p.variants) if (!colorMap.has(v.colorName.toLowerCase())) colorMap.set(v.colorName.toLowerCase(), { name: v.colorName, hex: v.colorHex });
  const colors = [...colorMap.values()];
  const existing: VariantRow[] = p.variants.map((v) => ({ key: variantKey(v.size, v.colorName), id: v.id, size: v.size, colorName: v.colorName, colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock }));
  return {
    name: p.name, slug: p.slug, description: p.description, fit: p.fit, fabric: p.fabric,
    priceText: paiseToRupees(p.basePricePaise), compareAtText: paiseToRupees(p.compareAtPricePaise),
    status: p.status, isCustomizable: p.isCustomizable, collectionIds: [...p.collectionIds],
    sizes, colors: colors.length ? colors : [{ name: "Black", hex: "#111111" }], rows: buildVariantRows(sizes, colors, existing),
  };
}

export function toProductInput(s: ProductFormState): { input: ProductInput | null; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  const base = rupeesToPaise(s.priceText);
  if (base === null) errors.basePricePaise = ["Enter a price in rupees, e.g. 599 or 599.50"];
  let compareAt: number | null = null;
  if (s.compareAtText.trim()) {
    compareAt = rupeesToPaise(s.compareAtText);
    if (compareAt === null) errors.compareAtPricePaise = ["Enter a price in rupees, or leave it blank"];
  }
  if (Object.keys(errors).length) return { input: null, errors };
  return {
    errors,
    input: {
      name: s.name, slug: s.slug.trim(), description: s.description, fit: s.fit, fabric: s.fabric,
      basePricePaise: base!, compareAtPricePaise: compareAt, status: s.status, isCustomizable: s.isCustomizable,
      collectionIds: s.collectionIds,
      variants: s.rows.map((r) => ({ id: r.id, size: r.size as ProductInput["variants"][number]["size"], colorName: r.colorName, colorHex: r.colorHex, pricePaise: r.pricePaise, stock: r.stock })),
    },
  };
}
```

If `id: undefined` inside variants trips the Zod `.optional()` (it should not), strip it with a conditional spread. Run the test — Expected: PASS (3).

- [ ] **Step 3: Actions**

Create `src/app/admin/products/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { createProduct, deleteProduct, updateProduct } from "@/server/services/admin-products";
import type { ProductInput } from "@/lib/validation/admin";

export async function saveProductAction(id: string | null, input: ProductInput): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    await requireAdmin();
    const saved = id ? await updateProduct(id, input) : await createProduct(input);
    revalidatePath("/", "layout");
    return { ok: true, data: saved };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    await deleteProduct(id);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}
```

- [ ] **Step 4: Components**

Create `src/components/admin/field-error.tsx`:

```tsx
export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-xs text-danger" role="alert">{errors[0]}</p>;
}
```

Create `src/components/admin/variant-matrix.tsx`:

```tsx
"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { paiseToRupees, rupeesToPaise } from "@/lib/money";
import type { ProductFormState } from "@/lib/product-form";
import { SIZES } from "@/lib/sizes";
import { buildVariantRows, type ColorSpec, type VariantRow } from "@/lib/variant-rows";
import { cn } from "@/lib/utils";

export function VariantMatrix({ state, onChange, inCarts }: { state: ProductFormState; onChange: (next: ProductFormState) => void; inCarts: Record<string, number> }) {
  const [fill, setFill] = useState("");

  const withMatrix = (sizes: string[], colors: ColorSpec[]) => onChange({ ...state, sizes, colors, rows: buildVariantRows(sizes, colors, state.rows) });
  const toggleSize = (size: string) => withMatrix(state.sizes.includes(size) ? state.sizes.filter((s) => s !== size) : [...state.sizes, size], state.colors);
  const setColor = (i: number, patch: Partial<ColorSpec>) => withMatrix(state.sizes, state.colors.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addColor = () => withMatrix(state.sizes, [...state.colors, { name: "", hex: "#ffffff" }]);
  const removeColor = (i: number) => withMatrix(state.sizes, state.colors.filter((_, j) => j !== i));
  const setRow = (key: string, patch: Partial<VariantRow>) => onChange({ ...state, rows: state.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const fillStock = () => {
    const n = Number(fill);
    if (!Number.isInteger(n) || n < 0) return;
    onChange({ ...state, rows: state.rows.map((r) => ({ ...r, stock: n })) });
  };

  return (
    <div className="space-y-5" data-testid="variant-matrix">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Sizes</legend>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button key={s} type="button" aria-pressed={state.sizes.includes(s)} onClick={() => toggleSize(s)} className={cn("min-w-12 rounded-full border px-3 py-1 text-sm", state.sizes.includes(s) ? "border-brand bg-brand text-brand-ink" : "border-border hover:border-text")} data-testid="size-toggle">{s}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Colors</legend>
        <ul className="space-y-2">
          {state.colors.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <input type="color" value={c.hex} onChange={(e) => setColor(i, { hex: e.target.value })} aria-label={`Color ${i + 1} swatch`} className="size-9 cursor-pointer rounded border border-border bg-transparent" />
              <input value={c.name} onChange={(e) => setColor(i, { name: e.target.value })} placeholder="Color name, e.g. Black" aria-label={`Color ${i + 1} name`} className="h-9 w-56 rounded-md border border-border bg-bg px-3 text-sm" data-testid="color-name" />
              <button type="button" onClick={() => removeColor(i)} aria-label={`Remove color ${c.name || i + 1}`} className="p-2 text-text-muted hover:text-danger"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={addColor}><Plus className="mr-1 size-4" />Add color</Button>
      </fieldset>

      {state.rows.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-muted">Set stock for every variant:</span>
            <input value={fill} onChange={(e) => setFill(e.target.value)} inputMode="numeric" aria-label="Stock for all variants" className="h-8 w-20 rounded-md border border-border bg-bg px-2" />
            <Button type="button" size="sm" variant="secondary" onClick={fillStock}>Apply</Button>
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] text-sm" data-testid="variant-rows">
              <thead className="bg-surface text-left text-text-muted"><tr><th className="p-2">Color</th><th>Size</th><th>Price override (₹)</th><th>Stock</th><th className="p-2">Notes</th></tr></thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.key} className="border-t border-border" data-testid="variant-row">
                    <td className="p-2"><span className="inline-flex items-center gap-2"><span className="size-3 rounded-full border border-border" style={{ backgroundColor: r.colorHex }} />{r.colorName}</span></td>
                    <td>{r.size}</td>
                    <td>
                      <input key={`${r.key}-price`} defaultValue={paiseToRupees(r.pricePaise)} placeholder="Base price" inputMode="decimal" aria-label={`Price override ${r.colorName} ${r.size}`} onBlur={(e) => setRow(r.key, { pricePaise: rupeesToPaise(e.target.value) })} className="h-8 w-28 rounded-md border border-border bg-bg px-2" />
                    </td>
                    <td>
                      <input type="number" min={0} value={r.stock} aria-label={`Stock ${r.colorName} ${r.size}`} onChange={(e) => setRow(r.key, { stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className="h-8 w-24 rounded-md border border-border bg-bg px-2" data-testid="stock-input" />
                    </td>
                    <td className="p-2 text-xs text-text-muted">{r.id && inCarts[r.id] ? `In ${inCarts[r.id]} bag(s), keep it or set stock to 0` : r.id ? "" : "New"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted" data-testid="variant-empty">Pick at least one size and name a color to create variants.</p>
      )}
    </div>
  );
}
```

Create `src/components/admin/delete-product-button.tsx`:

```tsx
"use client";

import type { ProductStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteProductAction } from "@/app/admin/products/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";

export function DeleteProductButton({ id, status }: { id: string; status: ProductStatus }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (status === "ACTIVE") return <p className="text-xs text-text-muted">Archive the product to delete it.</p>;
  const confirm = () =>
    start(async () => {
      const r = await deleteProductAction(id);
      if (r.ok) {
        toast.success("Product deleted");
        router.push("/admin/products");
      } else {
        toast.error(r.message);
        setOpen(false);
      }
    });
  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)} data-testid="delete-product">Delete product</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-bg">
          <DialogTitle>Delete this product?</DialogTitle>
          <DialogDescription>This removes its variants and images, and takes it out of every bag. It cannot be undone.</DialogDescription>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={confirm} disabled={pending} data-testid="confirm-delete">{pending ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

If `src/components/ui/button.tsx` has no `destructive` variant, use the closest existing variant and report it. If `DialogFooter` renders its own close button that conflicts, drop the explicit Cancel.

Create `src/components/admin/product-editor.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveProductAction } from "@/app/admin/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyProductForm, productFormFromProduct, toProductInput, type ProductFormState } from "@/lib/product-form";
import type { AdminProductDetail } from "@/server/services/admin-products";
import { FieldError } from "./field-error";
import { VariantMatrix } from "./variant-matrix";

const FITS = [["OVERSIZED", "Oversized"], ["REGULAR", "Regular"], ["RELAXED", "Relaxed"]] as const;
const STATUSES = [["DRAFT", "Draft (hidden)"], ["ACTIVE", "Active (live)"], ["ARCHIVED", "Archived (hidden)"]] as const;

export function ProductEditor({ product, collections }: { product: AdminProductDetail | null; collections: { id: string; name: string }[] }) {
  const [state, setState] = useState<ProductFormState>(() => (product ? productFormFromProduct(product) : emptyProductForm()));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const inCarts = Object.fromEntries((product?.variants ?? []).map((v) => [v.id, v.inCarts]));
  const set = <K extends keyof ProductFormState>(k: K, v: ProductFormState[K]) => setState((s) => ({ ...s, [k]: v }));
  const toggleCollection = (id: string) => set("collectionIds", state.collectionIds.includes(id) ? state.collectionIds.filter((c) => c !== id) : [...state.collectionIds, id]);

  const save = () => {
    const { input, errors: local } = toProductInput(state);
    if (!input) {
      setErrors(local);
      toast.error("Fix the highlighted fields");
      return;
    }
    start(async () => {
      const r = await saveProductAction(product?.id ?? null, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.message);
        return;
      }
      setErrors({});
      toast.success(product ? "Saved" : "Product created");
      if (product) router.refresh();
      else router.push(`/admin/products/${r.data.id}`);
    });
  };

  const variantErrors = Object.entries(errors).filter(([k]) => k.startsWith("variants")).flatMap(([, v]) => v);

  return (
    <form className="grid gap-8 xl:grid-cols-[1fr_320px]" onSubmit={(e) => { e.preventDefault(); save(); }} data-testid="product-editor">
      <div className="space-y-8">
        <section className="space-y-4 rounded-md border border-border bg-surface p-5">
          <div><Label htmlFor="p-name">Name</Label><Input id="p-name" value={state.name} onChange={(e) => set("name", e.target.value)} className="mt-1 bg-bg" /><FieldError errors={errors.name} /></div>
          <div><Label htmlFor="p-slug">URL slug</Label><Input id="p-slug" value={state.slug} onChange={(e) => set("slug", e.target.value)} placeholder="Leave blank to generate from the name" className="mt-1 bg-bg" /><FieldError errors={errors.slug} /></div>
          <div><Label htmlFor="p-desc">Description (markdown)</Label><textarea id="p-desc" value={state.description} onChange={(e) => set("description", e.target.value)} rows={6} className="mt-1 w-full rounded-md border border-border bg-bg p-3 text-sm" /><FieldError errors={errors.description} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="p-fit">Fit</Label>
              <select id="p-fit" value={state.fit} onChange={(e) => set("fit", e.target.value as ProductFormState["fit"])} className="mt-1 h-9 w-full rounded-md border border-border bg-bg px-3 text-sm">
                {FITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div><Label htmlFor="p-fabric">Fabric</Label><Input id="p-fabric" value={state.fabric} onChange={(e) => set("fabric", e.target.value)} className="mt-1 bg-bg" /><FieldError errors={errors.fabric} /></div>
            <div><Label htmlFor="p-price">Price (₹)</Label><Input id="p-price" inputMode="decimal" value={state.priceText} onChange={(e) => set("priceText", e.target.value)} className="mt-1 bg-bg" /><FieldError errors={errors.basePricePaise} /></div>
            <div><Label htmlFor="p-compare">Compare-at price (₹)</Label><Input id="p-compare" inputMode="decimal" value={state.compareAtText} onChange={(e) => set("compareAtText", e.target.value)} placeholder="Optional, shows a strikethrough" className="mt-1 bg-bg" /><FieldError errors={errors.compareAtPricePaise} /></div>
          </div>
        </section>

        <section className="space-y-3 rounded-md border border-border bg-surface p-5">
          <h2 className="text-2xl">Variants</h2>
          <VariantMatrix state={state} onChange={setState} inCarts={inCarts} />
          {variantErrors.length > 0 && <p className="text-sm text-danger" role="alert" data-testid="variant-error">{variantErrors[0]}</p>}
        </section>
      </div>

      <aside className="space-y-6">
        <section className="space-y-3 rounded-md border border-border bg-surface p-5">
          <Label htmlFor="p-status">Status</Label>
          <select id="p-status" value={state.status} onChange={(e) => set("status", e.target.value as ProductFormState["status"])} className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm" data-testid="status-select">
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={state.isCustomizable} onChange={(e) => set("isCustomizable", e.target.checked)} className="accent-brand" />Customizable blank (for the design tool)</label>
          <Button type="submit" disabled={pending} className="w-full font-display text-lg tracking-wide" data-testid="save-product">{pending ? "Saving…" : product ? "Save changes" : "Create product"}</Button>
        </section>
        <section className="space-y-2 rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl">Collections</h2>
          {collections.length === 0 && <p className="text-sm text-text-muted">No collections yet.</p>}
          {collections.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={state.collectionIds.includes(c.id)} onChange={() => toggleCollection(c.id)} className="accent-brand" />{c.name}</label>
          ))}
          <FieldError errors={errors.collectionIds} />
        </section>
      </aside>
    </form>
  );
}
```

- [ ] **Step 5: Pages**

Create `src/app/admin/products/new/page.tsx`:

```tsx
import Link from "next/link";
import { ProductEditor } from "@/components/admin/product-editor";
import { listCollectionOptions } from "@/server/services/admin-collections";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdminPage();
  const collections = await listCollectionOptions();
  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="text-sm text-text-muted hover:text-text">← Products</Link>
      <h1 className="text-5xl">New product</h1>
      <ProductEditor product={null} collections={collections} />
    </div>
  );
}
```

Create `src/app/admin/products/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteProductButton } from "@/components/admin/delete-product-button";
import { ProductEditor } from "@/components/admin/product-editor";
import { StatusBadge } from "@/components/admin/status-badge";
import { NotFoundError } from "@/server/errors";
import { listCollectionOptions } from "@/server/services/admin-collections";
import { getAdminProduct } from "@/server/services/admin-products";
import { requireAdminPage } from "../../guard";

type Props = { params: Promise<{ id: string }> };

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;
  const product = await getAdminProduct(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const collections = await listCollectionOptions();
  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="text-sm text-text-muted hover:text-text">← Products</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-5xl">{product.name}</h1>
        <StatusBadge status={product.status} />
        {product.status === "ACTIVE" && <Link href={`/products/${product.slug}`} target="_blank" className="text-sm underline-offset-4 hover:underline" data-testid="view-on-store">View on store ↗</Link>}
      </div>
      <ProductEditor key={product.id + product.variants.length} product={product} collections={collections} />
      <section className="rounded-md border border-danger/40 p-5">
        <h2 className="mb-2 text-xl">Danger zone</h2>
        <DeleteProductButton id={product.id} status={product.status} />
      </section>
    </div>
  );
}
```

(The `key` forces the editor to re-initialise its state from the server after `router.refresh()` when variants were added or removed. Task 6 inserts the image manager between the editor and the danger zone.)

- [ ] **Step 6: Verify and commit**

Full gate. Manual check on port 3001 as admin: create a draft product with sizes S and M, one color, stock 5, price 599 → lands on its edit page; set status Active and save → "View on store" opens the storefront product; try publishing a product with no variants → inline variant error; add an "XL" size → a new row marked "New"; delete a Draft product → back to the list. Stop the server.

```bash
git add src/lib/product-form.ts src/app/admin/products src/components/admin tests/unit/product-form.test.ts
git commit -m "feat(admin): add product editor with variant matrix, save and delete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 6: Image manager and collections admin

**Files:**
- Create: `src/app/admin/products/image-actions.ts`, `src/components/admin/image-manager.tsx`, `src/app/admin/collections/actions.ts`, `src/app/admin/collections/page.tsx`, `src/app/admin/collections/new/page.tsx`, `src/app/admin/collections/[id]/page.tsx`, `src/components/admin/collection-editor.tsx`, `src/components/admin/collection-products.tsx`, `src/components/admin/hero-uploader.tsx`
- Modify: `src/app/admin/products/[id]/page.tsx` (render `ImageManager`), `next.config.ts` (Server Action body limit)

**Interfaces:**
- Consumes: Task 3 services; `requireAdmin`, `requireAdminPage`; `actionError`, `ActionResult`; `FieldError`, `StatusBadge`; `AdminImage`, `AdminCollectionDetail`.
- Produces:

```ts
// @/app/admin/products/image-actions ("use server")
export function uploadProductImagesAction(productId: string, formData: FormData): Promise<ActionResult<AdminImage[]>>;  // files under "files"
export function updateProductImageAction(imageId: string, input: { alt: string; colorName: string | null }): Promise<ActionResult<AdminImage>>;
export function reorderProductImagesAction(productId: string, orderedIds: string[]): Promise<ActionResult<null>>;
export function deleteProductImageAction(imageId: string): Promise<ActionResult<null>>;
// @/app/admin/collections/actions ("use server")
export function saveCollectionAction(id: string | null, input: CollectionInput): Promise<ActionResult<{ id: string; slug: string }>>;
export function deleteCollectionAction(id: string): Promise<ActionResult<null>>;
export function setCollectionHeroAction(id: string, formData: FormData | null): Promise<ActionResult<string | null>>;  // file under "file"; null removes
export function reorderCollectionProductsAction(id: string, orderedProductIds: string[]): Promise<ActionResult<null>>;
export function removeProductFromCollectionAction(id: string, productId: string): Promise<ActionResult<null>>;
// components ("use client")
<ImageManager productId images={AdminImage[]} colorNames={string[]} />
<CollectionEditor collection={AdminCollectionDetail | null} />
<CollectionProducts collectionId products={AdminCollectionDetail["products"]} />
<HeroUploader collectionId heroImageUrl={string | null} />
```

- [ ] **Step 1: Allow image uploads through Server Actions**

Server Actions accept 1 MB bodies by default; uploads allow up to 10 × 5 MB. In `next.config.ts` add (keep every existing key):

```ts
  experimental: {
    serverActions: { bodySizeLimit: "55mb" },
  },
```

- [ ] **Step 2: Image actions and manager**

Create `src/app/admin/products/image-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { addProductImages, deleteProductImage, reorderProductImages, updateProductImage } from "@/server/services/admin-images";
import type { AdminImage } from "@/server/services/admin-products";

function done() {
  revalidatePath("/", "layout");
}

export async function uploadProductImagesAction(productId: string, formData: FormData): Promise<ActionResult<AdminImage[]>> {
  try {
    await requireAdmin();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const added = await addProductImages(productId, files);
    done();
    return { ok: true, data: added };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateProductImageAction(imageId: string, input: { alt: string; colorName: string | null }): Promise<ActionResult<AdminImage>> {
  try {
    await requireAdmin();
    const img = await updateProductImage(imageId, input);
    done();
    return { ok: true, data: img };
  } catch (err) {
    return actionError(err);
  }
}

export async function reorderProductImagesAction(productId: string, orderedIds: string[]): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    await reorderProductImages(productId, orderedIds);
    done();
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteProductImageAction(imageId: string): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    await deleteProductImage(imageId);
    done();
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}
```

Create `src/components/admin/image-manager.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deleteProductImageAction, reorderProductImagesAction, updateProductImageAction, uploadProductImagesAction,
} from "@/app/admin/products/image-actions";
import { Button } from "@/components/ui/button";
import type { AdminImage } from "@/server/services/admin-products";

export function ImageManager({ productId, images, colorNames }: { productId: string; images: AdminImage[]; colorNames: string[] }) {
  const [list, setList] = useState(images);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    start(async () => {
      const r = await uploadProductImagesAction(productId, fd);
      if (fileRef.current) fileRef.current.value = "";
      if (!r.ok) return void toast.error(r.fieldErrors?.files?.[0] ?? r.fieldErrors?.file?.[0] ?? r.message);
      setList((l) => [...l, ...r.data]);
      toast.success(`${r.data.length} image(s) added`);
      router.refresh();
    });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    start(async () => {
      const r = await reorderProductImagesAction(productId, next.map((x) => x.id));
      if (!r.ok) {
        toast.error(r.message);
        setList(list);
      }
    });
  };

  const save = (img: AdminImage, patch: Partial<Pick<AdminImage, "alt" | "colorName">>) => {
    const merged = { ...img, ...patch };
    setList((l) => l.map((x) => (x.id === img.id ? merged : x)));
    start(async () => {
      const r = await updateProductImageAction(img.id, { alt: merged.alt, colorName: merged.colorName });
      if (!r.ok) toast.error(r.message);
    });
  };

  const remove = (img: AdminImage) =>
    start(async () => {
      const r = await deleteProductImageAction(img.id);
      if (!r.ok) return void toast.error(r.message);
      setList((l) => l.filter((x) => x.id !== img.id));
      router.refresh();
    });

  return (
    <section className="space-y-4 rounded-md border border-border bg-surface p-5" data-testid="image-manager">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">Images</h2>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} data-testid="image-input" />
        <Button type="button" variant="secondary" disabled={pending} onClick={() => fileRef.current?.click()}><Upload className="mr-2 size-4" />{pending ? "Working…" : "Upload images"}</Button>
      </div>
      <p className="text-xs text-text-muted">PNG, JPG or WebP, up to 5 MB each. Tag an image with a color so the gallery shows it when that swatch is picked. The first image is the card image.</p>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted" data-testid="images-empty">No images yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((img, i) => (
            <li key={img.id} className="flex gap-3 rounded-md border border-border bg-bg p-3" data-testid="image-item">
              <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-sm bg-surface-raised">
                <Image src={img.url} alt={img.alt} fill sizes="80px" className="object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                <input defaultValue={img.alt} aria-label="Alt text" placeholder="Describe the image" onBlur={(e) => e.target.value !== img.alt && save(img, { alt: e.target.value })} className="h-8 rounded-md border border-border bg-surface px-2" />
                <select value={img.colorName ?? ""} aria-label="Color tag" onChange={(e) => save(img, { colorName: e.target.value || null })} className="h-8 rounded-md border border-border bg-surface px-2">
                  <option value="">All colors</option>
                  {colorNames.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="mt-auto flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || pending} aria-label="Move earlier" className="p-1 disabled:opacity-30"><ArrowUp className="size-4" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1 || pending} aria-label="Move later" className="p-1 disabled:opacity-30"><ArrowDown className="size-4" /></button>
                  <button type="button" onClick={() => remove(img)} disabled={pending} aria-label="Delete image" className="ml-auto p-1 text-text-muted hover:text-danger"><Trash2 className="size-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

In `src/app/admin/products/[id]/page.tsx`, import `ImageManager` and render it between the editor and the danger zone:

```tsx
      <ImageManager productId={product.id} images={product.images} colorNames={[...new Set(product.variants.map((v) => v.colorName))]} />
```

- [ ] **Step 3: Collection actions**

Create `src/app/admin/collections/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import {
  createCollection, deleteCollection, removeProductFromCollection, reorderCollectionProducts, setCollectionHero, updateCollection,
} from "@/server/services/admin-collections";
import type { CollectionInput } from "@/lib/validation/admin";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireAdmin();
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    return actionError(err);
  }
}

export async function saveCollectionAction(id: string | null, input: CollectionInput) {
  return run(() => (id ? updateCollection(id, input) : createCollection(input)));
}

export async function deleteCollectionAction(id: string) {
  return run(async () => {
    await deleteCollection(id);
    return null;
  });
}

export async function setCollectionHeroAction(id: string, formData: FormData | null) {
  return run(() => {
    const file = formData?.get("file");
    return setCollectionHero(id, file instanceof File && file.size > 0 ? file : null);
  });
}

export async function reorderCollectionProductsAction(id: string, orderedProductIds: string[]) {
  return run(async () => {
    await reorderCollectionProducts(id, orderedProductIds);
    return null;
  });
}

export async function removeProductFromCollectionAction(id: string, productId: string) {
  return run(async () => {
    await removeProductFromCollection(id, productId);
    return null;
  });
}
```

(`requireAdmin()` runs inside the `try`, before `fn`, so an unauthorised call returns a failed `ActionResult` and never touches data.)

- [ ] **Step 4: Collection components**

Create `src/components/admin/collection-editor.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCollectionAction, saveCollectionAction } from "@/app/admin/collections/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminCollectionDetail } from "@/server/services/admin-collections";
import { FieldError } from "./field-error";

export function CollectionEditor({ collection }: { collection: AdminCollectionDetail | null }) {
  const [name, setName] = useState(collection?.name ?? "");
  const [slug, setSlug] = useState(collection?.slug ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [isFeatured, setFeatured] = useState(collection?.isFeatured ?? false);
  const [isActive, setActive] = useState(collection?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(collection?.sortOrder ?? 0));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () =>
    start(async () => {
      const r = await saveCollectionAction(collection?.id ?? null, { name, slug, description, isFeatured, isActive, sortOrder: Math.max(0, Math.floor(Number(sortOrder) || 0)) });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return void toast.error(r.message);
      }
      setErrors({});
      toast.success(collection ? "Saved" : "Collection created");
      if (collection) router.refresh();
      else router.push(`/admin/collections/${r.data.id}`);
    });

  const remove = () =>
    start(async () => {
      if (!collection) return;
      const r = await deleteCollectionAction(collection.id);
      if (!r.ok) return void toast.error(r.message);
      toast.success("Collection deleted");
      router.push("/admin/collections");
    });

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="max-w-2xl space-y-4 rounded-md border border-border bg-surface p-5" data-testid="collection-editor">
      <div><Label htmlFor="c-name">Name</Label><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 bg-bg" /><FieldError errors={errors.name} /></div>
      <div><Label htmlFor="c-slug">URL slug</Label><Input id="c-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Leave blank to generate" className="mt-1 bg-bg" /><FieldError errors={errors.slug} /></div>
      <div><Label htmlFor="c-desc">Description</Label><textarea id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-border bg-bg p-3 text-sm" /></div>
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} className="accent-brand" />Visible on the store</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={isFeatured} onChange={(e) => setFeatured(e.target.checked)} className="accent-brand" />Featured on the home page</label>
        <label className="flex items-center gap-2">Order<input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" aria-label="Sort order" className="h-8 w-16 rounded-md border border-border bg-bg px-2" /></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending} data-testid="save-collection">{pending ? "Saving…" : collection ? "Save changes" : "Create collection"}</Button>
        {collection && <Button type="button" variant="destructive" disabled={pending} onClick={remove} data-testid="delete-collection">Delete collection</Button>}
      </div>
    </form>
  );
}
```

Create `src/components/admin/hero-uploader.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { setCollectionHeroAction } from "@/app/admin/collections/actions";
import { Button } from "@/components/ui/button";

export function HeroUploader({ collectionId, heroImageUrl }: { collectionId: string; heroImageUrl: string | null }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const send = (fd: FormData | null) =>
    start(async () => {
      const r = await setCollectionHeroAction(collectionId, fd);
      if (ref.current) ref.current.value = "";
      if (!r.ok) return void toast.error(r.fieldErrors?.file?.[0] ?? r.message);
      toast.success(r.data ? "Hero image updated" : "Hero image removed");
      router.refresh();
    });
  return (
    <section className="max-w-2xl space-y-3 rounded-md border border-border bg-surface p-5" data-testid="hero-uploader">
      <h2 className="text-2xl">Hero image</h2>
      {heroImageUrl ? (
        <div className="relative aspect-[3/1] overflow-hidden rounded-sm bg-surface-raised"><Image src={heroImageUrl} alt="" fill sizes="640px" className="object-cover" /></div>
      ) : (
        <p className="text-sm text-text-muted">No hero image. The first product image is used instead.</p>
      )}
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.append("file", f); send(fd); } }} />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => ref.current?.click()}>{heroImageUrl ? "Replace" : "Upload"}</Button>
        {heroImageUrl && <Button type="button" variant="ghost" disabled={pending} onClick={() => send(null)}>Remove</Button>}
      </div>
    </section>
  );
}
```

Create `src/components/admin/collection-products.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { toast } from "sonner";
import { removeProductFromCollectionAction, reorderCollectionProductsAction } from "@/app/admin/collections/actions";
import type { AdminCollectionDetail } from "@/server/services/admin-collections";
import { StatusBadge } from "./status-badge";

export function CollectionProducts({ collectionId, products }: { collectionId: string; products: AdminCollectionDetail["products"] }) {
  const [list, setList] = useState(products);
  const [pending, start] = useTransition();
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    const prev = list;
    setList(next);
    start(async () => {
      const r = await reorderCollectionProductsAction(collectionId, next.map((p) => p.id));
      if (!r.ok) {
        toast.error(r.message);
        setList(prev);
      }
    });
  };
  const remove = (id: string) =>
    start(async () => {
      const r = await removeProductFromCollectionAction(collectionId, id);
      if (!r.ok) return void toast.error(r.message);
      setList((l) => l.filter((p) => p.id !== id));
    });
  return (
    <section className="max-w-2xl space-y-3 rounded-md border border-border bg-surface p-5" data-testid="collection-products">
      <h2 className="text-2xl">Products ({list.length})</h2>
      <p className="text-xs text-text-muted">This order is the "Featured" sort on the storefront. Add products to this collection from each product's page.</p>
      {list.length === 0 ? <p className="text-sm text-text-muted">No products yet.</p> : (
        <ol className="divide-y divide-border">
          {list.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 py-2" data-testid="collection-product">
              <span className="w-6 text-right text-xs text-text-muted">{i + 1}</span>
              <span className="relative size-10 shrink-0 overflow-hidden rounded-sm bg-surface-raised">{p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" />}</span>
              <Link href={`/admin/products/${p.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">{p.name}</Link>
              <StatusBadge status={p.status} />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || pending} aria-label={`Move ${p.name} up`} className="p-1 disabled:opacity-30"><ArrowUp className="size-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1 || pending} aria-label={`Move ${p.name} down`} className="p-1 disabled:opacity-30"><ArrowDown className="size-4" /></button>
              <button type="button" onClick={() => remove(p.id)} disabled={pending} aria-label={`Remove ${p.name} from collection`} className="p-1 text-text-muted hover:text-danger"><X className="size-4" /></button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

(Spec 5 says "drag-to-order products"; this plan uses up/down buttons for keyboard accessibility and no extra dependency. Drag can be layered on later.)

- [ ] **Step 5: Collection pages**

Create `src/app/admin/collections/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listAdminCollections } from "@/server/services/admin-collections";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Collections" };

export default async function AdminCollectionsPage() {
  await requireAdminPage();
  const rows = await listAdminCollections();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-5xl">Collections</h1>
        <Button render={<Link href="/admin/collections/new" />} nativeButton={false} data-testid="new-collection">New collection</Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[560px] text-sm" data-testid="collections-table">
          <thead className="bg-surface text-left text-text-muted"><tr><th className="p-3">Name</th><th>Visible</th><th>Featured</th><th className="text-right">Products</th><th className="p-3 text-right">Order</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-border" data-testid="collection-row">
                <td className="p-3"><Link href={`/admin/collections/${c.id}`} className="font-medium hover:underline">{c.name}</Link><p className="text-xs text-text-muted">/collections/{c.slug}</p></td>
                <td>{c.isActive ? "Yes" : "No"}</td>
                <td>{c.isFeatured ? "Yes" : "No"}</td>
                <td className="text-right">{c.productCount}</td>
                <td className="p-3 text-right">{c.sortOrder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Create `src/app/admin/collections/new/page.tsx`:

```tsx
import Link from "next/link";
import { CollectionEditor } from "@/components/admin/collection-editor";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "New collection" };

export default async function NewCollectionPage() {
  await requireAdminPage();
  return (
    <div className="space-y-6">
      <Link href="/admin/collections" className="text-sm text-text-muted hover:text-text">← Collections</Link>
      <h1 className="text-5xl">New collection</h1>
      <CollectionEditor collection={null} />
    </div>
  );
}
```

Create `src/app/admin/collections/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionEditor } from "@/components/admin/collection-editor";
import { CollectionProducts } from "@/components/admin/collection-products";
import { HeroUploader } from "@/components/admin/hero-uploader";
import { NotFoundError } from "@/server/errors";
import { getAdminCollection } from "@/server/services/admin-collections";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "Edit collection" };

export default async function EditCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const collection = await getAdminCollection(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return (
    <div className="space-y-6">
      <Link href="/admin/collections" className="text-sm text-text-muted hover:text-text">← Collections</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-5xl">{collection.name}</h1>
        {collection.isActive && <Link href={`/collections/${collection.slug}`} target="_blank" className="text-sm underline-offset-4 hover:underline">View on store ↗</Link>}
      </div>
      <CollectionEditor key={collection.id} collection={collection} />
      <HeroUploader collectionId={collection.id} heroImageUrl={collection.heroImageUrl} />
      <CollectionProducts key={collection.products.map((p) => p.id).join()} collectionId={collection.id} products={collection.products} />
    </div>
  );
}
```

- [ ] **Step 6: Verify and commit**

Full gate. Manual check on port 3001 as admin: upload two PNG/JPG files to a product (they appear, first becomes the storefront card image), tag one with a color and confirm the storefront gallery switches to it for that swatch, reorder, delete one; create a collection, mark it featured, upload a hero image, reorder its products, then check the storefront `/collections/<slug>` featured sort follows the new order. Stop the server.

```bash
git add next.config.ts src/app/admin src/components/admin
git commit -m "feat(admin): add product image manager and collections admin

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

### Task 7: Admin end-to-end tests and docs

**Files:**
- Create: `tests/e2e/admin.spec.ts`, `tests/fixtures/pixel.png` (generated in Step 1)
- Modify: `playwright.config.ts` (load `.env` for admin credentials), `README.md` (admin section)

**Interfaces:**
- Consumes: seeded admin from `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`), `tests/e2e/helpers.ts` (`login`, `register`, `uniqueEmail`), test ids from Tasks 4-6.

- [ ] **Step 1: Fixture image and credentials**

Create the 1×1 PNG fixture:

```bash
mkdir -p tests/fixtures
node -e "require('fs').writeFileSync('tests/fixtures/pixel.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'))"
```

At the top of `playwright.config.ts`, load `.env` so specs can read the admin credentials (the dev database is the one the webServer uses):

```ts
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
```

- [ ] **Step 2: Specs**

Create `tests/e2e/admin.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { login, register, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;

async function loginAdmin(page: Page) {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin");
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
}

test.describe("admin", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");

  test("customers are sent to login", async ({ page }) => {
    await register(page, uniqueEmail("not-admin"));
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("dashboard and product list", async ({ page }) => {
    await loginAdmin(page);
    await page.getByRole("link", { name: "Products" }).click();
    await expect(page.getByTestId("product-row").first()).toBeVisible();
    await page.getByLabel("Search products").fill("blank");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/q=blank/);
    const rows = page.getByTestId("product-row");
    expect(await rows.count()).toBeGreaterThan(0);
    for (const t of await rows.allTextContents()) expect(t.toLowerCase()).toContain("blank");
  });

  test("create, publish, image, storefront, archive, delete", async ({ page }) => {
    const name = `E2E Tee ${Date.now()}`;
    await loginAdmin(page);
    await page.goto("/admin/products/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Price (₹)").fill("649");
    await page.getByTestId("size-toggle").filter({ hasText: /^S$/ }).click();
    await page.getByTestId("size-toggle").filter({ hasText: /^M$/ }).click();
    await expect(page.getByTestId("variant-row")).toHaveCount(2);
    await page.getByLabel("Stock for all variants").fill("7");
    await page.getByRole("button", { name: "Apply" }).click();

    // Publishing without variants is covered in unit tests; here publish with variants.
    await page.getByTestId("status-select").selectOption("ACTIVE");
    await page.getByTestId("save-product").click();
    await expect(page).toHaveURL(/\/admin\/products\/[^/]+$/);
    await expect(page.getByTestId("status-badge").first()).toHaveText(/active/i);

    await page.getByTestId("image-input").setInputFiles(path.join(__dirname, "..", "fixtures", "pixel.png"));
    await expect(page.getByTestId("image-item")).toHaveCount(1);

    const storeHref = await page.getByTestId("view-on-store").getAttribute("href");
    await page.goto(storeHref!);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name, { ignoreCase: true });
    await expect(page.getByTestId("size-chip")).toHaveCount(2);

    await page.goBack();
    await page.getByTestId("status-select").selectOption("ARCHIVED");
    await page.getByTestId("save-product").click();
    await expect(page.getByTestId("status-badge").first()).toHaveText(/archived/i);
    const archived = await page.request.get(storeHref!);
    expect(archived.status()).toBe(404);

    await page.getByTestId("delete-product").click();
    await page.getByTestId("confirm-delete").click();
    await expect(page).toHaveURL(/\/admin\/products$/);
  });

  test("collection create, reorder, delete", async ({ page }) => {
    const name = `E2E Collection ${Date.now()}`;
    await loginAdmin(page);
    await page.goto("/admin/collections/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByTestId("save-collection").click();
    await expect(page).toHaveURL(/\/admin\/collections\/[^/]+$/);
    await expect(page.getByTestId("collection-products")).toContainText("No products yet");
    await page.getByTestId("delete-collection").click();
    await expect(page).toHaveURL(/\/admin\/collections$/);
    await expect(page.getByTestId("collections-table")).not.toContainText(name);
  });
});
```

Notes for the implementer:
- The storefront `h1` is uppercase via CSS; Playwright's `toHaveText` compares text content, which keeps the original case, so `ignoreCase` is a safety net only.
- If the Server Action upload needs more than the default test timeout on first compile, raise that single test's timeout with `test.slow()` rather than changing global settings.
- Admin specs run only in the `desktop` project. Add `testIgnore: /admin/` to the `mobile` and `reduced-motion` projects if their `testMatch` would otherwise include it (current `testMatch` values already exclude it).

- [ ] **Step 3: README**

Add to `README.md`:

```markdown
## Admin

Sign in with the seeded admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`) and open `/admin`. Products are edited with a size × color variant matrix (stock and optional per-variant price), images can be uploaded, tagged to a color, and reordered, and collections control the storefront's featured order. Only accounts whose role is `ADMIN` in the database can open the admin.
```

- [ ] **Step 4: Run and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`. All green. Revert `tsconfig.json`/`next-env.d.ts` churn. The e2e product is deleted by its own test; the e2e collection is deleted by its own test.

```bash
git add tests/e2e/admin.spec.ts tests/fixtures/pixel.png playwright.config.ts README.md
git commit -m "test(e2e): cover admin products, images, and collections

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9yHXNWFM96NNtep5QczHB"
```

---

## Carried-over deferrals relevant to this plan

- Re-seeding (`npm run db:seed`) overwrites collection name/description/flags edited in the admin. Document in README (already noted under Scripts) and keep.
- `NEXT_PUBLIC_SITE_URL` baked at build time; Plan 1D moves server code to a runtime `SITE_URL`.
- Duplicate `getProductBySlug`/`getCollectionBySlug` per request; wrap with React `cache()` in a later polish pass.

## Plan self-review

- **Spec section 5 coverage:** dashboard counts (Task 3, 4), products list with search/status (Task 2, 4), product form with all fields, slug auto, collections multi-select, image uploader with reorder/alt/color tag, variant matrix with SKU auto, price override, stock, and safe removal of in-cart variants (Tasks 2, 5, 6), collections list/form with featured/active toggles, hero image and product ordering (Tasks 3, 6), server-action validation with field errors (Tasks 1, 5, 6), admin guard redirecting non-admins (Tasks 1, 4). Deviation: product ordering uses up/down buttons instead of drag (noted in Task 6).
- **Placeholders:** none.
- **Type consistency:** `AdminImage`, `AdminProductDetail`, `AdminCollectionDetail`, `ProductInput`, `CollectionInput`, `VariantRow`, `ProductFormState` are defined once and reused with the same names; `requireAdmin` (actions) vs `requireAdminPage` (pages) are distinct on purpose.
