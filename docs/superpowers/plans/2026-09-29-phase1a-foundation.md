# Phase 1A: Foundation and Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js app and build every server-side piece the storefront and admin will need: database schema, seed data, catalog and cart services, auth, storage and email adapters, and the public `/api/v1` REST API, all covered by tests.

**Architecture:** One Next.js 15 app with a strict service layer (`src/server/services`) that is the only code touching Prisma. Pages, server actions, and `/api/v1` handlers all call services. External systems sit behind adapters selected by env vars so local dev needs no AWS account.

**Tech Stack:** Next.js 15 (App Router, TypeScript, React 19), Tailwind CSS v4, Prisma 6 + PostgreSQL 16, Auth.js v5 (`next-auth@beta`) with Prisma adapter, Zod 3, bcryptjs, Vitest 3, dotenv-cli, tsx.

**Spec:** `docs/superpowers/specs/2026-09-29-phase1-storefront-foundation-design.md`

## Global Constraints

- Node 22 and npm 11 (already installed). Windows host: run commands in Git Bash; npm scripts must not rely on shell-specific env syntax (use `dotenv-cli`).
- Pin majors: `next@15`, `react@19`, `tailwindcss@4`, `prisma@6`, `@prisma/client@6`, `next-auth@5.0.0-beta.29` (or latest beta), `zod@3`, `vitest@3`.
- Money is always an integer number of paise. Never store or compute in rupees floats.
- Brand name comes only from `src/config/brand.ts` (`BRAND.name`). Placeholder value `"YOUR BRAND"` until the owner supplies one.
- Services are the only code that imports `@/server/db`. API handlers and pages never call Prisma directly.
- Sizes are the fixed list `["XS","S","M","L","XL","XXL","3XL"]` exported from `src/lib/sizes.ts`.
- Every task ends with `npm run lint && npm run typecheck && npm test` green before committing.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

| Path | Responsibility |
|---|---|
| `docker-compose.yml`, `docker/postgres-init.sql` | Local Postgres with `thrift` and `thrift_test` databases |
| `.env.example`, `.env.test` | Documented env vars; test DB URL |
| `prisma/schema.prisma`, `prisma/seed.ts` | Data model; admin user, collections, products, variants, placeholder images |
| `src/server/db.ts` | Prisma client singleton |
| `src/server/errors.ts` | Typed domain errors and HTTP mapping |
| `src/lib/money.ts`, `src/lib/slug.ts`, `src/lib/sizes.ts` | Pure helpers |
| `src/config/brand.ts`, `src/config/site.ts` | Brand constants, nav and footer links |
| `src/server/services/catalog.ts` | Collections, product listing with filters/sort/paging, product detail, related, facets, search |
| `src/server/services/cart.ts` | Cart read, add, update, remove, merge with stock caps |
| `src/server/cart-cookie.ts` | Guest cart cookie for pages and server actions |
| `src/server/services/auth.ts` | Register, verify credentials, password reset tokens |
| `src/server/auth.config.ts`, `src/server/auth.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts` | Auth.js v5 split config (edge-safe + full), route protection |
| `src/server/adapters/storage/*`, `src/server/adapters/email/*` | Storage (local disk, S3) and email (console, SES) adapters with env-based factories |
| `src/server/uploads.ts`, `src/app/api/uploads/[...path]/route.ts` | Image validation by magic bytes; serves local uploads |
| `src/server/api.ts`, `src/app/api/v1/**` | JSON envelope, bearer auth, rate limit, REST routes |
| `vitest.config.ts`, `tests/helpers/db.ts`, `tests/helpers/fixtures.ts`, `tests/unit/**` | Test runner, DB reset, fixture builders, tests |

---

### Task 1: Scaffold the Next.js app, local Postgres, and env files

**Files:**
- Create: entire Next.js scaffold under repo root (`package.json`, `src/app/*`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/globals.css`)
- Create: `docker-compose.yml`, `docker/postgres-init.sql`, `.env.example`, `.env.test`
- Modify: `README.md`, `.gitignore`, `package.json` (scripts)

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `start`, `lint`, `typecheck`; Postgres at `postgresql://thrift:thrift@localhost:5432/thrift` and `.../thrift_test`.

- [ ] **Step 1: Scaffold into a temp folder, then copy in (create-next-app refuses a folder containing README.md)**

```bash
cd "C:/Users/Sherwyn joel/OneDrive/Desktop"
npx --yes create-next-app@15 thrift-scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --turbopack --no-git
cp -r thrift-scaffold/. thrift-Ecom/
rm -rf thrift-scaffold
cd thrift-Ecom
git status --short | head -20
```

Expected: `package.json`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `public/` now exist. The scaffold's README.md overwrote ours; that is fine, Step 6 rewrites it.

- [ ] **Step 2: Add the typecheck script and confirm the scaffold builds**

Edit `package.json` scripts to exactly:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit"
}
```

Run: `npm run lint && npm run typecheck && npm run build`
Expected: all three succeed; build prints a route table with `/`.

- [ ] **Step 3: Add local Postgres via Docker Compose**

Create `docker/postgres-init.sql`:

```sql
CREATE DATABASE thrift_test;
```

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: thrift-postgres
    environment:
      POSTGRES_USER: thrift
      POSTGRES_PASSWORD: thrift
      POSTGRES_DB: thrift
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres-init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U thrift -d thrift"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

Run: `docker compose up -d && sleep 8 && docker exec thrift-postgres psql -U thrift -d thrift -c "\l" | grep thrift`
Expected: two rows, `thrift` and `thrift_test`. (If Docker Desktop is not running, start it first.)

- [ ] **Step 4: Write env files**

Create `.env.example`:

```bash
# Database
DATABASE_URL="postgresql://thrift:thrift@localhost:5432/thrift"

# Auth.js
AUTH_SECRET="replace-with-openssl-rand-base64-32"
AUTH_TRUST_HOST="true"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Site
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# Adapters: local|s3 and console|ses
STORAGE_DRIVER="local"
EMAIL_DRIVER="console"
EMAIL_FROM="no-reply@example.com"

# S3 (only when STORAGE_DRIVER=s3)
AWS_REGION="ap-south-1"
S3_BUCKET=""
S3_PUBLIC_BASE_URL=""

# Seed admin
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="change-me-now"
```

Create `.env.test`:

```bash
DATABASE_URL="postgresql://thrift:thrift@localhost:5432/thrift_test"
AUTH_SECRET="test-secret-test-secret-test-secret-1234"
AUTH_TRUST_HOST="true"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
STORAGE_DRIVER="local"
EMAIL_DRIVER="console"
EMAIL_FROM="test@example.com"
ADMIN_EMAIL="admin@test.local"
ADMIN_PASSWORD="admin-test-password"
```

Then: `cp .env.example .env` and replace `AUTH_SECRET` with the output of `openssl rand -base64 32`.

- [ ] **Step 5: Update .gitignore**

Append to `.gitignore`:

```
storage/uploads/
test-results/
playwright-report/
coverage/
```

Confirm `.env` and `.env.*` are already ignored and `!.env.example` is present. Add `!.env.test` on its own line so the test env is committed:

```
!.env.test
```

- [ ] **Step 6: Rewrite README.md**

```markdown
# T-Shirt Store (brand name pending)

Custom T-shirt e-commerce: animated storefront, persistent cart, accounts, admin panel, and (later) a design-your-own tool. Next.js 15, Prisma, PostgreSQL.

## Local setup

1. `docker compose up -d` — Postgres on localhost:5432 (`thrift` and `thrift_test` databases)
2. `cp .env.example .env` and set `AUTH_SECRET` (`openssl rand -base64 32`)
3. `npm install`
4. `npm run db:migrate` then `npm run db:seed`
5. `npm run dev` — http://localhost:3000

## Scripts

- `npm run dev` / `build` / `start`
- `npm run lint`, `npm run typecheck`, `npm test`
- `npm run db:migrate`, `npm run db:seed`, `npm run db:studio`

## Docs

- Design specs: `docs/superpowers/specs/`
- Implementation plans: `docs/superpowers/plans/`
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 app with local Postgres and env files

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Prisma schema and client

**Files:**
- Create: `prisma/schema.prisma`, `src/server/db.ts`
- Modify: `package.json` (deps, scripts, prisma seed config)

**Interfaces:**
- Produces: `db` (PrismaClient) from `@/server/db`; models `User`, `Account`, `VerificationToken`, `Collection`, `Product`, `ProductCollection`, `ProductImage`, `ProductVariant`, `Cart`, `CartItem`; enums `Role`, `Fit`, `ProductStatus`.

- [ ] **Step 1: Install Prisma and tooling**

```bash
npm i @prisma/client@6
npm i -D prisma@6 tsx dotenv-cli
```

- [ ] **Step 2: Write the schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  CUSTOMER
  ADMIN
}

enum Fit {
  OVERSIZED
  REGULAR
  RELAXED
}

enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String?
  name          String?
  image         String?
  role          Role      @default(CUSTOMER)
  emailVerified DateTime?
  accounts      Account[]
  cart          Cart?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@id([identifier, token])
}

model Collection {
  id           String              @id @default(cuid())
  slug         String              @unique
  name         String
  description  String              @default("")
  heroImageUrl String?
  sortOrder    Int                 @default(0)
  isFeatured   Boolean             @default(false)
  isActive     Boolean             @default(true)
  products     ProductCollection[]
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
}

model Product {
  id                  String              @id @default(cuid())
  slug                String              @unique
  name                String
  description         String              @default("")
  fit                 Fit                 @default(OVERSIZED)
  fabric              String              @default("100% Cotton")
  basePricePaise      Int
  compareAtPricePaise Int?
  isCustomizable      Boolean             @default(false)
  status              ProductStatus       @default(DRAFT)
  images              ProductImage[]
  variants            ProductVariant[]
  collections         ProductCollection[]
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  @@index([status, createdAt])
}

model ProductCollection {
  productId    String
  collectionId String
  sortOrder    Int        @default(0)
  product      Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)

  @@id([productId, collectionId])
  @@index([collectionId, sortOrder])
}

model ProductImage {
  id        String   @id @default(cuid())
  productId String
  url       String
  alt       String   @default("")
  sortOrder Int      @default(0)
  colorName String?
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([productId, sortOrder])
}

model ProductVariant {
  id         String     @id @default(cuid())
  productId  String
  sku        String     @unique
  size       String
  colorName  String
  colorHex   String
  pricePaise Int?
  stock      Int        @default(0)
  sortOrder  Int        @default(0)
  product    Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
  cartItems  CartItem[]
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt

  @@unique([productId, size, colorName])
}

model Cart {
  id         String     @id @default(cuid())
  userId     String?    @unique
  guestToken String?    @unique
  user       User?      @relation(fields: [userId], references: [id], onDelete: Cascade)
  items      CartItem[]
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
}

model CartItem {
  id        String         @id @default(cuid())
  cartId    String
  variantId String
  quantity  Int
  cart      Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variant   ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@unique([cartId, variantId])
}
```

- [ ] **Step 3: Prisma client singleton**

Create `src/server/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 4: Scripts and seed hook**

Add to `package.json` scripts:

```json
"db:migrate": "prisma migrate dev",
"db:migrate:deploy": "prisma migrate deploy",
"db:test:migrate": "dotenv -e .env.test -- prisma migrate deploy",
"db:seed": "prisma db seed",
"db:studio": "prisma studio",
"postinstall": "prisma generate"
```

Add a top-level key to `package.json`:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 5: Create the initial migration on both databases**

Run: `npx prisma migrate dev --name init && npm run db:test:migrate && npx prisma validate`
Expected: `prisma/migrations/<timestamp>_init/migration.sql` created; both databases report "Database schema is up to date"; validate prints "The schema is valid".

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add Prisma schema for users, catalog, and cart

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Vitest with a real test database

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/helpers/db.ts`, `tests/unit/db.test.ts`
- Modify: `package.json` (scripts), `tsconfig.json` (exclude tests from Next build if needed)

**Interfaces:**
- Produces: `resetDb(): Promise<void>` from `tests/helpers/db`; `npm test` runs Vitest once against `thrift_test`.

- [ ] **Step 1: Install**

```bash
npm i -D vitest@3 vite-tsconfig-paths dotenv
```

- [ ] **Step 2: Config and setup**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test", override: true });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
```

Create `tests/setup.ts`:

```ts
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test", override: true });
```

Create `tests/helpers/db.ts`:

```ts
import { db } from "@/server/db";

const TABLES = [
  "CartItem",
  "Cart",
  "ProductImage",
  "ProductVariant",
  "ProductCollection",
  "Product",
  "Collection",
  "Account",
  "VerificationToken",
  "User",
];

export async function resetDb(): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
```

Add scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Write the smoke test**

Create `tests/unit/db.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";

describe("database connection", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("starts empty and can insert a user", async () => {
    expect(await db.user.count()).toBe(0);
    await db.user.create({ data: { email: "a@test.local", name: "A" } });
    expect(await db.user.count()).toBe(1);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: 1 test passed. If it fails with "relation does not exist", run `npm run db:test:migrate` first.

- [ ] **Step 5: Keep Next's typecheck happy**

If `npm run typecheck` complains about `vitest/config` types under the Next tsconfig, add `"types": ["node"]` is not needed; instead ensure `tsconfig.json` `include` contains `"tests/**/*.ts"` and `"vitest.config.ts"`. Run `npm run typecheck` and `npm run lint` and confirm both pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: add Vitest with test database reset helper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Domain errors, money, slug, sizes, and brand config

**Files:**
- Create: `src/server/errors.ts`, `src/lib/money.ts`, `src/lib/slug.ts`, `src/lib/sizes.ts`, `src/config/brand.ts`, `src/config/site.ts`
- Test: `tests/unit/errors.test.ts`, `tests/unit/money.test.ts`, `tests/unit/slug.test.ts`

**Interfaces:**
- Produces: `DomainError`, `NotFoundError`, `OutOfStockError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`, `ValidationError`, `toHttp(err): { status: number; body: { error: { code; message; details? } } }`; `formatPaise(paise: number): string`; `discountPercent(pricePaise, compareAtPaise): number | null`; `slugify(text): string`; `uniqueSlug(base, exists)`; `SIZES` tuple and `Size` type; `BRAND` object; `SITE_NAV`, `FOOTER_LINKS`.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, OutOfStockError, ValidationError, toHttp } from "@/server/errors";

describe("domain errors", () => {
  it("maps known errors to status and envelope", () => {
    expect(toHttp(new NotFoundError("Product"))).toEqual({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Product not found" } },
    });
    expect(toHttp(new OutOfStockError(3)).status).toBe(409);
    expect(toHttp(new ConflictError("Slug already in use")).body.error.code).toBe("CONFLICT");
    const v = toHttp(new ValidationError({ email: ["Invalid email"] }));
    expect(v.status).toBe(400);
    expect(v.body.error.details).toEqual({ email: ["Invalid email"] });
  });

  it("hides unknown errors behind a generic 500", () => {
    const res = toHttp(new Error("db exploded"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(res.body.error.message).not.toContain("exploded");
  });
});
```

Create `tests/unit/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { discountPercent, formatPaise } from "@/lib/money";

describe("money", () => {
  it("formats paise as Indian rupees with grouping", () => {
    expect(formatPaise(54900)).toBe("₹549");
    expect(formatPaise(119900)).toBe("₹1,199");
    expect(formatPaise(12345600)).toBe("₹1,23,456");
    expect(formatPaise(0)).toBe("₹0");
  });

  it("computes discount percent, or null when no real discount", () => {
    expect(discountPercent(54900, 119900)).toBe(54);
    expect(discountPercent(54900, null)).toBeNull();
    expect(discountPercent(54900, 54900)).toBeNull();
    expect(discountPercent(54900, 40000)).toBeNull();
  });
});
```

Create `tests/unit/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slug", () => {
  it("slugifies names", () => {
    expect(slugify("Originals Beige Oversized T-shirt")).toBe("originals-beige-oversized-t-shirt");
    expect(slugify("  Hello   World! ")).toBe("hello-world");
    expect(slugify("Ünïcode & symbols")).toBe("unicode-symbols");
  });

  it("appends a counter until the slug is free", async () => {
    const taken = new Set(["tee", "tee-2"]);
    const exists = async (s: string) => taken.has(s);
    expect(await uniqueSlug("tee", exists)).toBe("tee-3");
    expect(await uniqueSlug("fresh", exists)).toBe("fresh");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL, modules `@/server/errors`, `@/lib/money`, `@/lib/slug` not found.

- [ ] **Step 3: Implement**

Create `src/server/errors.ts`:

```ts
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(what = "Resource") {
    super("NOT_FOUND", `${what} not found`, 404);
  }
}

export class OutOfStockError extends DomainError {
  constructor(public readonly available: number) {
    super("OUT_OF_STOCK", `Only ${available} left in stock`, 409, { available });
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have access to this") {
    super("FORBIDDEN", message, 403);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Please log in") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class ValidationError extends DomainError {
  constructor(fieldErrors: Record<string, string[]>, message = "Invalid input") {
    super("VALIDATION_ERROR", message, 400, fieldErrors);
  }
}

export type ErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export function toHttp(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof DomainError) {
    const error: ErrorBody["error"] = { code: err.code, message: err.message };
    if (err.details !== undefined) error.details = err.details;
    return { status: err.status, body: { error } };
  }
  const id = Math.random().toString(36).slice(2, 10);
  console.error(`[internal:${id}]`, err);
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: `Something went wrong (ref ${id})` } },
  };
}
```

Create `src/lib/money.ts`:

```ts
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatPaise(paise: number): string {
  return inr.format(Math.round(paise / 100)).replace(/ /g, "");
}

export function discountPercent(pricePaise: number, compareAtPaise: number | null | undefined): number | null {
  if (!compareAtPaise || compareAtPaise <= pricePaise) return null;
  return Math.round(((compareAtPaise - pricePaise) / compareAtPaise) * 100);
}
```

Create `src/lib/slug.ts`:

```ts
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base) || "item";
  if (!(await exists(root))) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Date.now()}`;
}
```

Create `src/lib/sizes.ts`:

```ts
export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"] as const;
export type Size = (typeof SIZES)[number];
export function isSize(value: string): value is Size {
  return (SIZES as readonly string[]).includes(value);
}
```

Create `src/config/brand.ts`:

```ts
export const BRAND = {
  name: "YOUR BRAND",
  tagline: "Wear what you mean.",
  supportEmail: "support@example.com",
  freeShippingThresholdPaise: 99900,
  currency: "INR",
  social: {
    instagram: "https://instagram.com/",
    youtube: "https://youtube.com/",
  },
} as const;
```

Create `src/config/site.ts`:

```ts
export const SITE_NAV = [
  { label: "New Drops", href: "/collections/new-drops" },
  { label: "Oversized", href: "/collections/oversized-tees" },
  { label: "Regular Fit", href: "/collections/regular-fit-tees" },
  { label: "Customize", href: "/customize" },
] as const;

export const FOOTER_LINKS = {
  shop: [
    { label: "All Collections", href: "/collections" },
    { label: "New Drops", href: "/collections/new-drops" },
    { label: "Customize", href: "/customize" },
  ],
  help: [
    { label: "Shipping", href: "/pages/shipping" },
    { label: "Returns & Exchange", href: "/pages/returns" },
    { label: "Contact", href: "/pages/contact" },
  ],
  company: [
    { label: "About", href: "/pages/about" },
    { label: "Privacy", href: "/pages/privacy" },
    { label: "Terms", href: "/pages/terms" },
  ],
} as const;
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all tests pass (db, errors, money, slug).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add domain errors, money and slug helpers, brand config

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Test fixtures and the catalog service

**Files:**
- Create: `tests/helpers/fixtures.ts`, `src/server/services/catalog.ts`
- Test: `tests/unit/catalog.test.ts`

**Interfaces:**
- Consumes: `db`, `NotFoundError`, Prisma enums `Fit`, `ProductStatus`, `SIZES`.
- Produces (from `@/server/services/catalog`):

```ts
export type ProductSort = "featured" | "newest" | "price-asc" | "price-desc";
export const PRODUCT_SORTS: ProductSort[];
export interface ProductFilters { size?: string[]; color?: string[]; fit?: Fit[]; minPricePaise?: number; maxPricePaise?: number }
export interface ProductCard { id: string; slug: string; name: string; fit: Fit; pricePaise: number; compareAtPricePaise: number | null; images: { url: string; alt: string }[]; colors: { name: string; hex: string }[]; lowStock: boolean; isCustomizable: boolean; createdAt: Date }
export interface ProductDetail extends ProductCard { description: string; fabric: string; variants: { id: string; sku: string; size: string; colorName: string; colorHex: string; pricePaise: number; stock: number }[]; collections: { slug: string; name: string }[] }
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; hasMore: boolean }
export interface CollectionSummary { id: string; slug: string; name: string; description: string; heroImageUrl: string | null; isFeatured: boolean; productCount: number }
export interface Facets { sizes: string[]; colors: { name: string; hex: string }[]; fits: Fit[]; minPricePaise: number; maxPricePaise: number }
export function listCollections(opts?: { featuredOnly?: boolean }): Promise<CollectionSummary[]>
export function getCollectionBySlug(slug: string): Promise<CollectionSummary>
export function listProducts(args?: { collectionSlug?: string; filters?: ProductFilters; sort?: ProductSort; page?: number; pageSize?: number }): Promise<Page<ProductCard>>
export function getProductBySlug(slug: string): Promise<ProductDetail>
export function getRelatedProducts(productId: string, limit?: number): Promise<ProductCard[]>
export function getFacets(collectionSlug?: string): Promise<Facets>
export function searchProducts(q: string, page?: number, pageSize?: number): Promise<Page<ProductCard>>
```

- [ ] **Step 1: Fixture helpers**

Create `tests/helpers/fixtures.ts`:

```ts
import { db } from "@/server/db";
import type { Fit, ProductStatus } from "@prisma/client";
import { slugify } from "@/lib/slug";

let counter = 0;
const next = () => ++counter;

export async function createCollection(
  over: Partial<{ name: string; slug: string; isFeatured: boolean; isActive: boolean; sortOrder: number }> = {},
) {
  const name = over.name ?? `Collection ${next()}`;
  return db.collection.create({
    data: {
      name,
      slug: over.slug ?? slugify(name),
      isFeatured: over.isFeatured ?? false,
      isActive: over.isActive ?? true,
      sortOrder: over.sortOrder ?? 0,
    },
  });
}

export interface VariantSpec {
  size: string;
  colorName: string;
  colorHex?: string;
  stock?: number;
  pricePaise?: number | null;
}

export async function createProduct(
  over: Partial<{
    name: string;
    slug: string;
    basePricePaise: number;
    compareAtPricePaise: number | null;
    fit: Fit;
    status: ProductStatus;
    isCustomizable: boolean;
    collectionIds: string[];
    variants: VariantSpec[];
    images: { url: string; alt?: string; colorName?: string }[];
    createdAt: Date;
  }> = {},
) {
  const n = next();
  const name = over.name ?? `Product ${n}`;
  const variants = over.variants ?? [{ size: "M", colorName: "Black", stock: 10 }];
  const images = over.images ?? [{ url: `/seed/p${n}.svg`, alt: name }];
  return db.product.create({
    data: {
      name,
      slug: over.slug ?? slugify(name),
      basePricePaise: over.basePricePaise ?? 59900,
      compareAtPricePaise: over.compareAtPricePaise ?? null,
      fit: over.fit ?? "OVERSIZED",
      status: over.status ?? "ACTIVE",
      isCustomizable: over.isCustomizable ?? false,
      createdAt: over.createdAt,
      images: {
        create: images.map((img, i) => ({ url: img.url, alt: img.alt ?? name, colorName: img.colorName, sortOrder: i })),
      },
      variants: {
        create: variants.map((v, i) => ({
          sku: `SKU-${n}-${v.size}-${v.colorName}`.toUpperCase().replace(/\s+/g, "-"),
          size: v.size,
          colorName: v.colorName,
          colorHex: v.colorHex ?? "#000000",
          stock: v.stock ?? 10,
          pricePaise: v.pricePaise ?? null,
          sortOrder: i,
        })),
      },
      collections: {
        create: (over.collectionIds ?? []).map((collectionId, i) => ({ collectionId, sortOrder: i })),
      },
    },
    include: { variants: true, images: true },
  });
}

export async function linkProductToCollection(collectionId: string, productId: string, sortOrder: number) {
  await db.productCollection.create({ data: { collectionId, productId, sortOrder } });
}
```

- [ ] **Step 2: Write failing catalog tests**

Create `tests/unit/catalog.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct, linkProductToCollection } from "../helpers/fixtures";
import {
  getCollectionBySlug,
  getFacets,
  getProductBySlug,
  getRelatedProducts,
  listCollections,
  listProducts,
  searchProducts,
} from "@/server/services/catalog";
import { NotFoundError } from "@/server/errors";

describe("catalog service", () => {
  beforeEach(resetDb);

  it("lists active collections with active product counts, featured first then sortOrder", async () => {
    const a = await createCollection({ name: "Alpha", sortOrder: 2 });
    const b = await createCollection({ name: "Beta", sortOrder: 1, isFeatured: true });
    await createCollection({ name: "Hidden", isActive: false });
    await createProduct({ collectionIds: [a.id] });
    await createProduct({ collectionIds: [a.id], status: "DRAFT" });
    await createProduct({ collectionIds: [b.id] });
    const all = await listCollections();
    expect(all.map((c) => c.slug)).toEqual(["beta", "alpha"]);
    expect(all.find((c) => c.slug === "alpha")?.productCount).toBe(1);
    expect((await listCollections({ featuredOnly: true })).map((c) => c.slug)).toEqual(["beta"]);
    await expect(getCollectionBySlug("hidden")).rejects.toBeInstanceOf(NotFoundError);
    expect((await getCollectionBySlug("beta")).productCount).toBe(1);
  });

  it("lists only active products, paginated 24 per page, newest first", async () => {
    const col = await createCollection({ name: "Tees" });
    for (let i = 0; i < 30; i++) {
      await createProduct({ name: `Tee ${i}`, collectionIds: [col.id], createdAt: new Date(2026, 0, i + 1) });
    }
    await createProduct({ name: "Draft", collectionIds: [col.id], status: "DRAFT" });
    const p1 = await listProducts({ collectionSlug: "tees", sort: "newest" });
    expect(p1.total).toBe(30);
    expect(p1.items).toHaveLength(24);
    expect(p1.hasMore).toBe(true);
    expect(p1.items[0].name).toBe("Tee 29");
    const p2 = await listProducts({ collectionSlug: "tees", sort: "newest", page: 2 });
    expect(p2.items).toHaveLength(6);
    expect(p2.hasMore).toBe(false);
  });

  it("sorts featured by collection sortOrder and by price both ways", async () => {
    const col = await createCollection({ name: "Sorted" });
    const cheap = await createProduct({ name: "Cheap", basePricePaise: 30000 });
    const mid = await createProduct({ name: "Mid", basePricePaise: 50000 });
    const dear = await createProduct({ name: "Dear", basePricePaise: 90000 });
    await linkProductToCollection(col.id, dear.id, 0);
    await linkProductToCollection(col.id, cheap.id, 1);
    await linkProductToCollection(col.id, mid.id, 2);
    const names = async (sort: "featured" | "price-asc" | "price-desc") =>
      (await listProducts({ collectionSlug: "sorted", sort })).items.map((p) => p.name);
    expect(await names("featured")).toEqual(["Dear", "Cheap", "Mid"]);
    expect(await names("price-asc")).toEqual(["Cheap", "Mid", "Dear"]);
    expect(await names("price-desc")).toEqual(["Dear", "Mid", "Cheap"]);
  });

  it("filters by size, color, fit, and price range", async () => {
    await createProduct({ name: "Black L", fit: "OVERSIZED", basePricePaise: 50000, variants: [{ size: "L", colorName: "Black" }] });
    await createProduct({ name: "White S", fit: "REGULAR", basePricePaise: 80000, variants: [{ size: "S", colorName: "White" }] });
    const names = async (filters: Parameters<typeof listProducts>[0] extends infer A ? (A extends { filters?: infer F } ? F : never) : never) =>
      (await listProducts({ filters })).items.map((p) => p.name);
    expect(await names({ size: ["L"] })).toEqual(["Black L"]);
    expect(await names({ color: ["White"] })).toEqual(["White S"]);
    expect(await names({ fit: ["REGULAR"] })).toEqual(["White S"]);
    expect(await names({ minPricePaise: 60000 })).toEqual(["White S"]);
    expect(await names({ maxPricePaise: 60000 })).toEqual(["Black L"]);
  });

  it("builds product cards with price, colors, first two images, and low stock flag", async () => {
    await createProduct({
      name: "Card",
      basePricePaise: 54900,
      compareAtPricePaise: 119900,
      variants: [
        { size: "M", colorName: "Black", colorHex: "#111111", stock: 2 },
        { size: "L", colorName: "Beige", colorHex: "#e5d5b5", stock: 4 },
      ],
      images: [{ url: "/a.svg" }, { url: "/b.svg" }, { url: "/c.svg" }],
    });
    const [card] = (await listProducts({})).items;
    expect(card.pricePaise).toBe(54900);
    expect(card.compareAtPricePaise).toBe(119900);
    expect(card.images.map((i) => i.url)).toEqual(["/a.svg", "/b.svg"]);
    expect(card.colors).toEqual([{ name: "Black", hex: "#111111" }, { name: "Beige", hex: "#e5d5b5" }]);
    expect(card.lowStock).toBe(true);
  });

  it("returns product detail with variants and collections, 404 for draft or missing", async () => {
    const col = await createCollection({ name: "Detail Col" });
    await createProduct({ name: "Detail", collectionIds: [col.id], variants: [{ size: "M", colorName: "Black", pricePaise: 64900 }] });
    await createProduct({ name: "Draft Detail", status: "DRAFT" });
    const d = await getProductBySlug("detail");
    expect(d.variants[0].pricePaise).toBe(64900);
    expect(d.collections[0].slug).toBe("detail-col");
    await expect(getProductBySlug("draft-detail")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getProductBySlug("nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("finds related products from the same collections, excluding itself", async () => {
    const col = await createCollection({ name: "Rel" });
    const me = await createProduct({ name: "Me", collectionIds: [col.id] });
    await createProduct({ name: "Sibling", collectionIds: [col.id] });
    await createProduct({ name: "Stranger" });
    const rel = await getRelatedProducts(me.id, 4);
    expect(rel.map((p) => p.name)).toEqual(["Sibling"]);
  });

  it("computes facets from active products and searches by name or description", async () => {
    await createProduct({ name: "Skate Tee", basePricePaise: 40000, variants: [{ size: "S", colorName: "Red", colorHex: "#f00" }] });
    await createProduct({ name: "Plain", basePricePaise: 70000, variants: [{ size: "XL", colorName: "Black", colorHex: "#000" }] });
    const f = await getFacets();
    expect(f.sizes).toEqual(["S", "XL"]);
    expect(f.colors).toEqual([{ name: "Black", hex: "#000" }, { name: "Red", hex: "#f00" }]);
    expect(f.minPricePaise).toBe(40000);
    expect(f.maxPricePaise).toBe(70000);
    expect((await searchProducts("skate")).items.map((p) => p.name)).toEqual(["Skate Tee"]);
    expect((await searchProducts("zzz")).total).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test -- tests/unit/catalog.test.ts`
Expected: FAIL, `@/server/services/catalog` not found.

- [ ] **Step 4: Implement the catalog service**

Create `src/server/services/catalog.ts`:

```ts
import { Prisma, type Fit } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { SIZES } from "@/lib/sizes";

export type ProductSort = "featured" | "newest" | "price-asc" | "price-desc";
export const PRODUCT_SORTS: ProductSort[] = ["featured", "newest", "price-asc", "price-desc"];

export interface ProductFilters {
  size?: string[];
  color?: string[];
  fit?: Fit[];
  minPricePaise?: number;
  maxPricePaise?: number;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  fit: Fit;
  pricePaise: number;
  compareAtPricePaise: number | null;
  images: { url: string; alt: string }[];
  colors: { name: string; hex: string }[];
  lowStock: boolean;
  isCustomizable: boolean;
  createdAt: Date;
}

export interface ProductDetail extends ProductCard {
  description: string;
  fabric: string;
  variants: { id: string; sku: string; size: string; colorName: string; colorHex: string; pricePaise: number; stock: number }[];
  collections: { slug: string; name: string }[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface CollectionSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  heroImageUrl: string | null;
  isFeatured: boolean;
  productCount: number;
}

export interface Facets {
  sizes: string[];
  colors: { name: string; hex: string }[];
  fits: Fit[];
  minPricePaise: number;
  maxPricePaise: number;
}

const LOW_STOCK_AT = 5;
const DEFAULT_PAGE_SIZE = 24;

const cardInclude = {
  images: { orderBy: { sortOrder: "asc" as const }, take: 2 },
  variants: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.ProductInclude;

type ProductWithCard = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

function toCard(p: ProductWithCard): ProductCard {
  const seen = new Map<string, string>();
  for (const v of p.variants) if (!seen.has(v.colorName)) seen.set(v.colorName, v.colorHex);
  const stocks = p.variants.map((v) => v.stock);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    fit: p.fit,
    pricePaise: p.basePricePaise,
    compareAtPricePaise: p.compareAtPricePaise,
    images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
    colors: [...seen].map(([name, hex]) => ({ name, hex })),
    lowStock: stocks.length > 0 && stocks.every((s) => s < LOW_STOCK_AT),
    isCustomizable: p.isCustomizable,
    createdAt: p.createdAt,
  };
}

function productWhere(collectionSlug: string | undefined, f: ProductFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { status: "ACTIVE" };
  if (collectionSlug) where.collections = { some: { collection: { slug: collectionSlug, isActive: true } } };
  if (f.fit?.length) where.fit = { in: f.fit };
  if (f.minPricePaise !== undefined || f.maxPricePaise !== undefined) {
    where.basePricePaise = { gte: f.minPricePaise, lte: f.maxPricePaise };
  }
  const variantWhere: Prisma.ProductVariantWhereInput = {};
  if (f.size?.length) variantWhere.size = { in: f.size };
  if (f.color?.length) variantWhere.colorName = { in: f.color };
  if (Object.keys(variantWhere).length) where.variants = { some: variantWhere };
  return where;
}

function productOrder(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ basePricePaise: "asc" }, { createdAt: "desc" }];
    case "price-desc":
      return [{ basePricePaise: "desc" }, { createdAt: "desc" }];
    case "newest":
    case "featured":
    default:
      return [{ createdAt: "desc" }];
  }
}

async function pageProducts(
  where: Prisma.ProductWhereInput,
  orderBy: Prisma.ProductOrderByWithRelationInput[],
  page: number,
  pageSize: number,
): Promise<Page<ProductCard>> {
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: cardInclude }),
  ]);
  return { items: rows.map(toCard), total, page, pageSize, hasMore: page * pageSize < total };
}

const collectionInclude = {
  _count: { select: { products: { where: { product: { status: "ACTIVE" as const } } } } },
} satisfies Prisma.CollectionInclude;

type CollectionWithCount = Prisma.CollectionGetPayload<{ include: typeof collectionInclude }>;

function toCollection(c: CollectionWithCount): CollectionSummary {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    heroImageUrl: c.heroImageUrl,
    isFeatured: c.isFeatured,
    productCount: c._count.products,
  };
}

export async function listCollections(opts: { featuredOnly?: boolean } = {}): Promise<CollectionSummary[]> {
  const rows = await db.collection.findMany({
    where: { isActive: true, ...(opts.featuredOnly ? { isFeatured: true } : {}) },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: collectionInclude,
  });
  return rows.map(toCollection);
}

export async function getCollectionBySlug(slug: string): Promise<CollectionSummary> {
  const c = await db.collection.findFirst({ where: { slug, isActive: true }, include: collectionInclude });
  if (!c) throw new NotFoundError("Collection");
  return toCollection(c);
}

export async function listProducts(
  args: { collectionSlug?: string; filters?: ProductFilters; sort?: ProductSort; page?: number; pageSize?: number } = {},
): Promise<Page<ProductCard>> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, args.pageSize ?? DEFAULT_PAGE_SIZE));
  const sort = args.sort ?? "featured";
  const where = productWhere(args.collectionSlug, args.filters ?? {});

  if (sort === "featured" && args.collectionSlug) {
    // Featured order inside a collection is ProductCollection.sortOrder, so page through the join table.
    const joinWhere: Prisma.ProductCollectionWhereInput = {
      collection: { slug: args.collectionSlug, isActive: true },
      product: where,
    };
    const [total, joins] = await Promise.all([
      db.productCollection.count({ where: joinWhere }),
      db.productCollection.findMany({
        where: joinWhere,
        orderBy: [{ sortOrder: "asc" }, { product: { createdAt: "desc" } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { product: { include: cardInclude } },
      }),
    ]);
    return { items: joins.map((j) => toCard(j.product)), total, page, pageSize, hasMore: page * pageSize < total };
  }
  return pageProducts(where, productOrder(sort), page, pageSize);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail> {
  const p = await db.product.findFirst({
    where: { slug, status: "ACTIVE" },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      collections: { include: { collection: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!p) throw new NotFoundError("Product");
  const card = toCard({ ...p, images: p.images.slice(0, 2) });
  return {
    ...card,
    images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
    description: p.description,
    fabric: p.fabric,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      colorName: v.colorName,
      colorHex: v.colorHex,
      pricePaise: v.pricePaise ?? p.basePricePaise,
      stock: v.stock,
    })),
    collections: p.collections
      .filter((pc) => pc.collection.isActive)
      .map((pc) => ({ slug: pc.collection.slug, name: pc.collection.name })),
  };
}

export async function getRelatedProducts(productId: string, limit = 4): Promise<ProductCard[]> {
  const links = await db.productCollection.findMany({ where: { productId }, select: { collectionId: true } });
  const ids = links.map((l) => l.collectionId);
  if (!ids.length) return [];
  const rows = await db.product.findMany({
    where: { status: "ACTIVE", id: { not: productId }, collections: { some: { collectionId: { in: ids } } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: cardInclude,
  });
  return rows.map(toCard);
}

export async function getFacets(collectionSlug?: string): Promise<Facets> {
  const where = productWhere(collectionSlug, {});
  const [variants, prices, fits] = await Promise.all([
    db.productVariant.findMany({
      where: { product: where },
      select: { size: true, colorName: true, colorHex: true },
      distinct: ["size", "colorName"],
    }),
    db.product.aggregate({ where, _min: { basePricePaise: true }, _max: { basePricePaise: true } }),
    db.product.findMany({ where, select: { fit: true }, distinct: ["fit"] }),
  ]);
  const sizeOrder = new Map<string, number>(SIZES.map((s, i) => [s, i]));
  const sizes = [...new Set(variants.map((v) => v.size))].sort(
    (a, b) => (sizeOrder.get(a) ?? 99) - (sizeOrder.get(b) ?? 99),
  );
  const colorMap = new Map<string, string>();
  for (const v of variants) if (!colorMap.has(v.colorName)) colorMap.set(v.colorName, v.colorHex);
  const colors = [...colorMap].map(([name, hex]) => ({ name, hex })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    sizes,
    colors,
    fits: fits.map((f) => f.fit),
    minPricePaise: prices._min.basePricePaise ?? 0,
    maxPricePaise: prices._max.basePricePaise ?? 0,
  };
}

export async function searchProducts(q: string, page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<Page<ProductCard>> {
  const term = q.trim();
  if (!term) return { items: [], total: 0, page, pageSize, hasMore: false };
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
    ],
  };
  return pageProducts(where, [{ createdAt: "desc" }], page, pageSize);
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all pass. If the featured-sort test fails, confirm the join-table branch runs when `collectionSlug` is set and `sort` is `"featured"`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(catalog): add catalog service with filters, sorting, facets, and search

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Seed data with placeholder shirt images

**Files:**
- Create: `src/server/seed/catalog-data.ts`, `src/server/seed/tee-svg.ts`, `src/server/seed/run-seed.ts`, `prisma/seed.ts`
- Test: `tests/unit/seed.test.ts`

**Interfaces:**
- Consumes: `db`, `slugify`, `SIZES`.
- Produces: `runSeed(db: PrismaClient, opts: { adminEmail: string; adminPassword: string; publicDir: string }): Promise<{ collections: number; products: number; variants: number }>`; `teeSvg(hex: string, side: "front" | "back"): string`; SVG files at `public/seed/tee-<slug>-front.svg` and `-back.svg`.

- [ ] **Step 1: Install bcryptjs (also used by auth in Task 8)**

```bash
npm i bcryptjs
npm i -D @types/bcryptjs
```

- [ ] **Step 2: Write the failing seed test**

Create `tests/unit/seed.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { runSeed } from "@/server/seed/run-seed";
import { teeSvg } from "@/server/seed/tee-svg";

describe("seed", () => {
  beforeEach(resetDb);

  it("renders a shirt svg in the requested color", () => {
    const svg = teeSvg("#c6ff3d", "front");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("#c6ff3d");
  });

  it("creates the admin, collections, products, and variants, and is idempotent", async () => {
    const publicDir = mkdtempSync(join(tmpdir(), "seed-"));
    const opts = { adminEmail: "admin@test.local", adminPassword: "admin-test-password", publicDir };
    const first = await runSeed(db, opts);
    expect(first.collections).toBeGreaterThanOrEqual(5);
    expect(first.products).toBeGreaterThanOrEqual(16);
    expect(first.variants).toBeGreaterThan(100);

    const admin = await db.user.findUnique({ where: { email: "admin@test.local" } });
    expect(admin?.role).toBe("ADMIN");
    expect(admin?.passwordHash).toBeTruthy();

    const customizable = await db.product.count({ where: { isCustomizable: true, status: "ACTIVE" } });
    expect(customizable).toBeGreaterThanOrEqual(1);

    const featured = await db.collection.count({ where: { isFeatured: true } });
    expect(featured).toBe(3);

    const second = await runSeed(db, opts);
    expect(second.products).toBe(first.products);
    expect(await db.product.count()).toBe(first.products);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- tests/unit/seed.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement the SVG generator**

Create `src/server/seed/tee-svg.ts`:

```ts
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (n & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** A flat 4:5 T-shirt mockup. Back side carries a print block so hover-swap is visible. */
export function teeSvg(hex: string, side: "front" | "back"): string {
  const dark = shade(hex, -28);
  const print = side === "back"
    ? `<rect x="300" y="330" width="200" height="240" rx="6" fill="${shade(hex, 70)}" opacity="0.9"/>
       <text x="400" y="470" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="46" font-weight="900" fill="${dark}">BACK</text>`
    : `<rect x="340" y="360" width="120" height="60" rx="4" fill="${shade(hex, 70)}" opacity="0.85"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
  <rect width="800" height="1000" fill="#141414"/>
  <path d="M250 180 L330 140 Q400 200 470 140 L550 180 L680 260 L620 360 L560 320 L560 880 L240 880 L240 320 L180 360 L120 260 Z" fill="${hex}" stroke="${dark}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M330 140 Q400 230 470 140" fill="none" stroke="${dark}" stroke-width="6"/>
  ${print}
</svg>`;
}
```

- [ ] **Step 5: Implement the catalog data**

Create `src/server/seed/catalog-data.ts`:

```ts
import type { Fit } from "@prisma/client";

export interface SeedColor { name: string; hex: string }
export interface SeedProduct {
  name: string;
  fit: Fit;
  pricePaise: number;
  compareAtPaise: number | null;
  colors: SeedColor[];
  sizes: string[];
  collections: string[]; // collection slugs
  description: string;
  isCustomizable?: boolean;
  lowStock?: boolean;
}

export const SEED_COLLECTIONS = [
  { slug: "new-drops", name: "New Drops", isFeatured: true, sortOrder: 0, description: "Fresh off the press. New designs every week." },
  { slug: "oversized-tees", name: "Oversized Tees", isFeatured: true, sortOrder: 1, description: "Dropped shoulders, heavy cotton, room to move." },
  { slug: "graphic-tees", name: "Graphic Tees", isFeatured: true, sortOrder: 2, description: "Loud prints for loud people." },
  { slug: "regular-fit-tees", name: "Regular Fit", isFeatured: false, sortOrder: 3, description: "Classic cut, everyday weight." },
  { slug: "plain-tees", name: "Plain & Blank", isFeatured: false, sortOrder: 4, description: "Solid colors. Print your own or wear them clean." },
];

const BLACK = { name: "Black", hex: "#111111" };
const WHITE = { name: "White", hex: "#f2f2ee" };
const BEIGE = { name: "Beige", hex: "#d9c7a5" };
const LIME = { name: "Lime", hex: "#c6ff3d" };
const NAVY = { name: "Navy", hex: "#1c2a4a" };
const RED = { name: "Red", hex: "#b3261e" };
const OLIVE = { name: "Olive", hex: "#5b6b3a" };
const LILAC = { name: "Lilac", hex: "#b8a3e6" };

const ALL = ["S", "M", "L", "XL", "XXL"];
const OVERSIZED_DESC = "Heavyweight 240 GSM cotton with a drop-shoulder cut. Pre-shrunk, bio-washed, and printed to last.";
const REGULAR_DESC = "180 GSM combed cotton in a classic straight cut. Soft hand feel, holds its shape wash after wash.";

export const SEED_PRODUCTS: SeedProduct[] = [
  { name: "Static Noise Oversized Tee", fit: "OVERSIZED", pricePaise: 69900, compareAtPaise: 129900, colors: [BLACK, WHITE], sizes: ALL, collections: ["new-drops", "oversized-tees", "graphic-tees"], description: OVERSIZED_DESC },
  { name: "Acid Wash Skull Oversized Tee", fit: "OVERSIZED", pricePaise: 79900, compareAtPaise: 149900, colors: [BLACK], sizes: ALL, collections: ["new-drops", "oversized-tees", "graphic-tees"], description: OVERSIZED_DESC, lowStock: true },
  { name: "Neon Ticker Oversized Tee", fit: "OVERSIZED", pricePaise: 64900, compareAtPaise: 119900, colors: [BLACK, LIME], sizes: ALL, collections: ["new-drops", "oversized-tees"], description: OVERSIZED_DESC },
  { name: "Late Nights Back Print Tee", fit: "OVERSIZED", pricePaise: 74900, compareAtPaise: 139900, colors: [BLACK, NAVY], sizes: ALL, collections: ["oversized-tees", "graphic-tees"], description: OVERSIZED_DESC },
  { name: "Concrete Garden Oversized Tee", fit: "OVERSIZED", pricePaise: 69900, compareAtPaise: null, colors: [BEIGE, OLIVE], sizes: ALL, collections: ["oversized-tees", "graphic-tees"], description: OVERSIZED_DESC },
  { name: "Signal Lost Oversized Tee", fit: "OVERSIZED", pricePaise: 59900, compareAtPaise: 109900, colors: [WHITE, LILAC], sizes: ALL, collections: ["oversized-tees", "graphic-tees"], description: OVERSIZED_DESC },
  { name: "Heavy Rotation Oversized Tee", fit: "OVERSIZED", pricePaise: 84900, compareAtPaise: 159900, colors: [BLACK, RED], sizes: ALL, collections: ["new-drops", "oversized-tees"], description: OVERSIZED_DESC },
  { name: "Blank Oversized Tee", fit: "OVERSIZED", pricePaise: 54900, compareAtPaise: 89900, colors: [BLACK, WHITE, BEIGE, NAVY, LIME], sizes: ALL, collections: ["plain-tees", "oversized-tees"], description: "Our blank canvas. Heavyweight, boxy, and ready for your print.", isCustomizable: true },
  { name: "Blank Regular Tee", fit: "REGULAR", pricePaise: 44900, compareAtPaise: 69900, colors: [BLACK, WHITE, RED, OLIVE], sizes: ALL, collections: ["plain-tees", "regular-fit-tees"], description: "Classic blank. Light, soft, and print-ready.", isCustomizable: true },
  { name: "Minimal Logo Regular Tee", fit: "REGULAR", pricePaise: 49900, compareAtPaise: 89900, colors: [BLACK, WHITE], sizes: ALL, collections: ["regular-fit-tees"], description: REGULAR_DESC },
  { name: "Retro Stripe Regular Tee", fit: "REGULAR", pricePaise: 54900, compareAtPaise: 99900, colors: [BEIGE, NAVY], sizes: ALL, collections: ["regular-fit-tees", "graphic-tees"], description: REGULAR_DESC },
  { name: "Sunset District Regular Tee", fit: "REGULAR", pricePaise: 52900, compareAtPaise: 94900, colors: [WHITE, LILAC], sizes: ALL, collections: ["regular-fit-tees", "graphic-tees"], description: REGULAR_DESC, lowStock: true },
  { name: "Boxy Pocket Relaxed Tee", fit: "RELAXED", pricePaise: 62900, compareAtPaise: 109900, colors: [OLIVE, BEIGE], sizes: ALL, collections: ["new-drops"], description: "Relaxed shoulder with a chest pocket. Midweight cotton, garment dyed.", },
  { name: "Night Shift Relaxed Tee", fit: "RELAXED", pricePaise: 64900, compareAtPaise: 119900, colors: [BLACK, NAVY], sizes: ALL, collections: ["new-drops", "graphic-tees"], description: "Relaxed cut with a tonal chest print. Midweight cotton, garment dyed." },
  { name: "Plain Oversized Tee", fit: "OVERSIZED", pricePaise: 49900, compareAtPaise: 79900, colors: [BLACK, WHITE, LILAC], sizes: ALL, collections: ["plain-tees", "oversized-tees"], description: "Solid oversized tee with no print. Heavyweight cotton." },
  { name: "Plain Regular Tee", fit: "REGULAR", pricePaise: 39900, compareAtPaise: 59900, colors: [BLACK, WHITE, RED], sizes: ALL, collections: ["plain-tees", "regular-fit-tees"], description: "Solid regular tee with no print. Light combed cotton." },
];
```

- [ ] **Step 6: Implement the seed runner and Prisma entry**

Create `src/server/seed/run-seed.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugify } from "@/lib/slug";
import { SEED_COLLECTIONS, SEED_PRODUCTS } from "./catalog-data";
import { teeSvg } from "./tee-svg";

export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
  publicDir: string;
}

export interface SeedResult {
  collections: number;
  products: number;
  variants: number;
}

function stockFor(index: number, low: boolean | undefined): number {
  if (low) return (index % 3) + 1;
  return 8 + ((index * 7) % 30);
}

export async function runSeed(db: PrismaClient, opts: SeedOptions): Promise<SeedResult> {
  const passwordHash = await hash(opts.adminPassword, 10);
  await db.user.upsert({
    where: { email: opts.adminEmail },
    update: { role: "ADMIN", passwordHash },
    create: { email: opts.adminEmail, name: "Admin", role: "ADMIN", passwordHash },
  });

  const seedDir = join(opts.publicDir, "seed");
  mkdirSync(seedDir, { recursive: true });

  for (const c of SEED_COLLECTIONS) {
    await db.collection.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, isFeatured: c.isFeatured, sortOrder: c.sortOrder, isActive: true },
      create: { ...c, isActive: true },
    });
  }

  for (const [pi, p] of SEED_PRODUCTS.entries()) {
    const slug = slugify(p.name);
    const existing = await db.product.findUnique({ where: { slug } });
    if (existing) continue;

    const images = p.colors.flatMap((c, ci) => {
      const key = slugify(c.name);
      const front = `tee-${key}-front.svg`;
      const back = `tee-${key}-back.svg`;
      writeFileSync(join(seedDir, front), teeSvg(c.hex, "front"));
      writeFileSync(join(seedDir, back), teeSvg(c.hex, "back"));
      return [
        { url: `/seed/${front}`, alt: `${p.name} in ${c.name}, front`, colorName: c.name, sortOrder: ci * 2 },
        { url: `/seed/${back}`, alt: `${p.name} in ${c.name}, back`, colorName: c.name, sortOrder: ci * 2 + 1 },
      ];
    });

    let vi = 0;
    const variants = p.colors.flatMap((c) =>
      p.sizes.map((size) => ({
        sku: `${slug.toUpperCase().slice(0, 12)}-${slugify(c.name).toUpperCase()}-${size}`,
        size,
        colorName: c.name,
        colorHex: c.hex,
        stock: stockFor(pi * 10 + vi++, p.lowStock),
        sortOrder: vi,
      })),
    );

    const collections = await db.collection.findMany({ where: { slug: { in: p.collections } }, select: { id: true } });

    await db.product.create({
      data: {
        name: p.name,
        slug,
        description: p.description,
        fit: p.fit,
        basePricePaise: p.pricePaise,
        compareAtPricePaise: p.compareAtPaise,
        isCustomizable: p.isCustomizable ?? false,
        status: "ACTIVE",
        createdAt: new Date(Date.now() - pi * 86_400_000),
        images: { create: images },
        variants: { create: variants },
        collections: { create: collections.map((c, i) => ({ collectionId: c.id, sortOrder: pi * 10 + i })) },
      },
    });
  }

  const [collections, products, variants] = await Promise.all([db.collection.count(), db.product.count(), db.productVariant.count()]);
  return { collections, products, variants };
}
```

Create `prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { join } from "node:path";
import { runSeed } from "../src/server/seed/run-seed";

const db = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
  const result = await runSeed(db, { adminEmail, adminPassword, publicDir: join(process.cwd(), "public") });
  console.log("Seeded:", result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
```

Because `prisma/seed.ts` imports from `src/` with a relative path, `tsx` resolves it without the `@/` alias. Keep that import relative.

- [ ] **Step 7: Run tests, then seed the dev database**

Run: `npm test -- tests/unit/seed.test.ts && npm run db:seed && ls public/seed | head`
Expected: test passes; seed prints counts; `public/seed/` holds `tee-black-front.svg` and friends.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(seed): add admin user, collections, products, and svg shirt mockups

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Cart service and guest cart cookie

**Files:**
- Create: `src/server/services/cart.ts`, `src/server/cart-cookie.ts`
- Test: `tests/unit/cart.test.ts`

**Interfaces:**
- Consumes: `db`, `NotFoundError`, `OutOfStockError`, `ValidationError`, fixtures.
- Produces (from `@/server/services/cart`):

```ts
export type CartRef = { userId: string } | { guestToken: string };
export const MAX_QTY_PER_LINE = 10;
export interface CartLine { id: string; variantId: string; quantity: number; lineTotalPaise: number; product: { slug: string; name: string; imageUrl: string | null }; variant: { size: string; colorName: string; colorHex: string; pricePaise: number; stock: number } }
export interface CartView { id: string | null; items: CartLine[]; subtotalPaise: number; itemCount: number }
export const EMPTY_CART: CartView;
export function getCart(ref: CartRef): Promise<CartView>
export function addItem(ref: CartRef, variantId: string, quantity: number): Promise<CartView>
export function updateItem(ref: CartRef, itemId: string, quantity: number): Promise<CartView>
export function removeItem(ref: CartRef, itemId: string): Promise<CartView>
export function mergeGuestCartIntoUser(guestToken: string, userId: string): Promise<CartView>
```

  and from `@/server/cart-cookie`: `CART_COOKIE = "cart_token"`, `readGuestToken(): Promise<string | null>`, `ensureGuestToken(): Promise<string>` (server actions and route handlers only), `clearGuestToken(): Promise<void>`.

- [ ] **Step 1: Write failing cart tests**

Create `tests/unit/cart.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createProduct } from "../helpers/fixtures";
import { addItem, getCart, mergeGuestCartIntoUser, removeItem, updateItem } from "@/server/services/cart";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";

async function variantOf(name: string, stock: number, pricePaise = 59900) {
  const p = await createProduct({ name, basePricePaise: pricePaise, variants: [{ size: "M", colorName: "Black", stock }] });
  return p.variants[0];
}

describe("cart service", () => {
  beforeEach(resetDb);

  it("returns an empty cart view for an unknown guest without creating rows", async () => {
    const view = await getCart({ guestToken: "nobody" });
    expect(view.items).toEqual([]);
    expect(view.subtotalPaise).toBe(0);
    expect(await db.cart.count()).toBe(0);
  });

  it("adds items, sums quantities, and computes totals", async () => {
    const v = await variantOf("Tee", 10, 50000);
    await addItem({ guestToken: "g1" }, v.id, 2);
    const view = await addItem({ guestToken: "g1" }, v.id, 1);
    expect(view.items).toHaveLength(1);
    expect(view.items[0].quantity).toBe(3);
    expect(view.items[0].lineTotalPaise).toBe(150000);
    expect(view.subtotalPaise).toBe(150000);
    expect(view.itemCount).toBe(3);
    expect(view.items[0].product.slug).toBe("tee");
    expect(view.items[0].variant.size).toBe("M");
  });

  it("rejects quantities beyond stock or the per-line cap, and unknown or inactive variants", async () => {
    const v = await variantOf("Scarce", 2);
    await expect(addItem({ guestToken: "g2" }, v.id, 3)).rejects.toBeInstanceOf(OutOfStockError);
    await addItem({ guestToken: "g2" }, v.id, 2);
    await expect(addItem({ guestToken: "g2" }, v.id, 1)).rejects.toBeInstanceOf(OutOfStockError);

    const plenty = await variantOf("Plenty", 100);
    await expect(addItem({ guestToken: "g2" }, plenty.id, 11)).rejects.toBeInstanceOf(ValidationError);
    await expect(addItem({ guestToken: "g2" }, plenty.id, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(addItem({ guestToken: "g2" }, "missing", 1)).rejects.toBeInstanceOf(NotFoundError);

    const draft = await createProduct({ name: "Draft", status: "DRAFT" });
    await expect(addItem({ guestToken: "g2" }, draft.variants[0].id, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates and removes lines, treating quantity 0 as remove", async () => {
    const v = await variantOf("Upd", 5);
    const view = await addItem({ guestToken: "g3" }, v.id, 1);
    const itemId = view.items[0].id;
    expect((await updateItem({ guestToken: "g3" }, itemId, 4)).items[0].quantity).toBe(4);
    await expect(updateItem({ guestToken: "g3" }, itemId, 6)).rejects.toBeInstanceOf(OutOfStockError);
    expect((await updateItem({ guestToken: "g3" }, itemId, 0)).items).toEqual([]);
    await expect(removeItem({ guestToken: "g3" }, itemId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not let one cart touch another cart's line", async () => {
    const v = await variantOf("Iso", 5);
    const mine = await addItem({ guestToken: "me" }, v.id, 1);
    await expect(updateItem({ guestToken: "you" }, mine.items[0].id, 2)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("merges a guest cart into the user cart with stock caps and deletes the guest cart", async () => {
    const user = await db.user.create({ data: { email: "u@test.local" } });
    const a = await variantOf("A", 3);
    const b = await variantOf("B", 10);
    await addItem({ userId: user.id }, a.id, 2);
    await addItem({ guestToken: "guest" }, a.id, 2);
    await addItem({ guestToken: "guest" }, b.id, 1);

    const merged = await mergeGuestCartIntoUser("guest", user.id);
    const qty = Object.fromEntries(merged.items.map((i) => [i.variantId, i.quantity]));
    expect(qty[a.id]).toBe(3);
    expect(qty[b.id]).toBe(1);
    expect(await db.cart.findUnique({ where: { guestToken: "guest" } })).toBeNull();
    expect((await getCart({ userId: user.id })).itemCount).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- tests/unit/cart.test.ts`
Expected: FAIL, `@/server/services/cart` not found.

- [ ] **Step 3: Implement the cart service**

Create `src/server/services/cart.ts`:

```ts
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";

export type CartRef = { userId: string } | { guestToken: string };
export const MAX_QTY_PER_LINE = 10;

export interface CartLine {
  id: string;
  variantId: string;
  quantity: number;
  lineTotalPaise: number;
  product: { slug: string; name: string; imageUrl: string | null };
  variant: { size: string; colorName: string; colorHex: string; pricePaise: number; stock: number };
}

export interface CartView {
  id: string | null;
  items: CartLine[];
  subtotalPaise: number;
  itemCount: number;
}

export const EMPTY_CART: CartView = { id: null, items: [], subtotalPaise: 0, itemCount: 0 };

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        include: {
          product: { include: { images: { orderBy: { sortOrder: "asc" as const } } } },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

function whereRef(ref: CartRef): Prisma.CartWhereUniqueInput {
  return "userId" in ref ? { userId: ref.userId } : { guestToken: ref.guestToken };
}

function toView(cart: CartRow | null): CartView {
  if (!cart) return EMPTY_CART;
  const items: CartLine[] = cart.items.map((it) => {
    const p = it.variant.product;
    const pricePaise = it.variant.pricePaise ?? p.basePricePaise;
    const colorImage = p.images.find((img) => img.colorName === it.variant.colorName) ?? p.images[0];
    return {
      id: it.id,
      variantId: it.variantId,
      quantity: it.quantity,
      lineTotalPaise: pricePaise * it.quantity,
      product: { slug: p.slug, name: p.name, imageUrl: colorImage?.url ?? null },
      variant: { size: it.variant.size, colorName: it.variant.colorName, colorHex: it.variant.colorHex, pricePaise, stock: it.variant.stock },
    };
  });
  return {
    id: cart.id,
    items,
    subtotalPaise: items.reduce((s, i) => s + i.lineTotalPaise, 0),
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
  };
}

async function findCart(ref: CartRef): Promise<CartRow | null> {
  return db.cart.findUnique({ where: whereRef(ref), include: cartInclude });
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

export async function getCart(ref: CartRef): Promise<CartView> {
  return toView(await findCart(ref));
}

export async function addItem(ref: CartRef, variantId: string, quantity: number): Promise<CartView> {
  assertQuantity(quantity);
  if (quantity === 0) throw new ValidationError({ quantity: ["Quantity must be at least 1"] });
  const variant = await loadSellableVariant(variantId);
  const cartId = await findOrCreateCartId(ref);
  const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const next = (existing?.quantity ?? 0) + quantity;
  if (next > MAX_QTY_PER_LINE) throw new ValidationError({ quantity: [`You can add at most ${MAX_QTY_PER_LINE} of one item`] });
  if (next > variant.stock) throw new OutOfStockError(variant.stock);
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    update: { quantity: next },
    create: { cartId, variantId, quantity: next },
  });
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
  if (quantity > item.variant.stock) throw new OutOfStockError(item.variant.stock);
  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return getCart(ref);
}

export async function removeItem(ref: CartRef, itemId: string): Promise<CartView> {
  const item = await ownedItem(ref, itemId);
  await db.cartItem.delete({ where: { id: item.id } });
  return getCart(ref);
}

export async function mergeGuestCartIntoUser(guestToken: string, userId: string): Promise<CartView> {
  const guest = await db.cart.findUnique({ where: { guestToken }, include: { items: { include: { variant: true } } } });
  if (!guest) return getCart({ userId });
  const userCartId = await findOrCreateCartId({ userId });
  await db.$transaction(async (tx) => {
    for (const it of guest.items) {
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: userCartId, variantId: it.variantId } } });
      const merged = Math.min((existing?.quantity ?? 0) + it.quantity, it.variant.stock, MAX_QTY_PER_LINE);
      if (merged <= 0) continue;
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: userCartId, variantId: it.variantId } },
        update: { quantity: merged },
        create: { cartId: userCartId, variantId: it.variantId, quantity: merged },
      });
    }
    await tx.cart.delete({ where: { id: guest.id } });
  });
  return getCart({ userId });
}
```

- [ ] **Step 4: Implement the cookie helper**

Create `src/server/cart-cookie.ts`:

```ts
import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

export const CART_COOKIE = "cart_token";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function readGuestToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/** Only call from a server action or route handler: setting cookies during render throws. */
export async function ensureGuestToken(): Promise<string> {
  const store = await cookies();
  const current = store.get(CART_COOKIE)?.value;
  if (current) return current;
  const token = randomBytes(24).toString("base64url");
  store.set(CART_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: ONE_YEAR, secure: process.env.NODE_ENV === "production" });
  return token;
}

export async function clearGuestToken(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}
```

Install the guard package: `npm i server-only`.

- [ ] **Step 5: Run tests, lint, typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(cart): add persistent cart service with stock caps and guest merge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Auth service, Auth.js configuration, and route protection

**Files:**
- Create: `src/server/services/auth.ts`, `src/lib/validation/auth.ts`, `src/server/auth.config.ts`, `src/server/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/auth/after-login/route.ts`, `src/middleware.ts`, `src/types/next-auth.d.ts`
- Test: `tests/unit/auth-service.test.ts`

**Interfaces:**
- Consumes: `db`, `ConflictError`, `UnauthorizedError`, `ValidationError`, `NotFoundError`, `mergeGuestCartIntoUser`, `readGuestToken`, `clearGuestToken`.
- Produces:

```ts
// @/lib/validation/auth
export const registerSchema: z.ZodObject<{ name; email; password }>;   // name 2-60, email, password min 8
export const loginSchema: z.ZodObject<{ email; password }>;
export const resetRequestSchema: z.ZodObject<{ email }>;
export const resetPasswordSchema: z.ZodObject<{ token; password }>;
// @/server/services/auth
export interface PublicUser { id: string; email: string; name: string | null; image: string | null; role: "CUSTOMER" | "ADMIN" }
export function registerUser(input: { name: string; email: string; password: string }): Promise<PublicUser>
export function verifyCredentials(email: string, password: string): Promise<PublicUser | null>
export function getUserById(id: string): Promise<PublicUser | null>
export function createPasswordResetToken(email: string): Promise<{ token: string; user: PublicUser } | null>
export function resetPassword(token: string, newPassword: string): Promise<void>
export function updateProfile(userId: string, input: { name: string }): Promise<PublicUser>
export function changePassword(userId: string, current: string, next: string): Promise<void>
// @/server/auth
export const { handlers, auth, signIn, signOut } = NextAuth(...)  // session.user has id and role
```

- [ ] **Step 1: Install**

```bash
npm i next-auth@beta @auth/prisma-adapter zod@3
```

- [ ] **Step 2: Validation schemas**

Create `src/lib/validation/auth.ts`:

```ts
import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email");
export const passwordSchema = z.string().min(8, "Use at least 8 characters").max(100);

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(60),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password") });
export const resetRequestSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password: passwordSchema });
export const updateProfileSchema = z.object({ name: z.string().trim().min(2).max(60) });
export const changePasswordSchema = z.object({ current: z.string().min(1), next: passwordSchema });

export type RegisterInput = z.infer<typeof registerSchema>;
```

- [ ] **Step 3: Write failing service tests**

Create `tests/unit/auth-service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import {
  changePassword, createPasswordResetToken, registerUser, resetPassword, updateProfile, verifyCredentials,
} from "@/server/services/auth";
import { ConflictError, UnauthorizedError, ValidationError } from "@/server/errors";

describe("auth service", () => {
  beforeEach(resetDb);

  it("registers a customer with a hashed password and normalized email", async () => {
    const u = await registerUser({ name: "Asha", email: "  Asha@Example.com ", password: "hunter2hunter2" });
    expect(u.email).toBe("asha@example.com");
    expect(u.role).toBe("CUSTOMER");
    const row = await db.user.findUnique({ where: { id: u.id } });
    expect(row?.passwordHash).not.toBe("hunter2hunter2");
    await expect(registerUser({ name: "Dup", email: "asha@example.com", password: "hunter2hunter2" })).rejects.toBeInstanceOf(ConflictError);
    await expect(registerUser({ name: "X", email: "bad", password: "short" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("verifies credentials case-insensitively and rejects wrong passwords or Google-only users", async () => {
    await registerUser({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" });
    expect((await verifyCredentials("ASHA@example.com", "hunter2hunter2"))?.email).toBe("asha@example.com");
    expect(await verifyCredentials("asha@example.com", "nope")).toBeNull();
    await db.user.create({ data: { email: "g@example.com" } });
    expect(await verifyCredentials("g@example.com", "anything")).toBeNull();
  });

  it("issues a single-use reset token that expires and changes the password", async () => {
    await registerUser({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" });
    expect(await createPasswordResetToken("nobody@example.com")).toBeNull();
    const issued = await createPasswordResetToken("asha@example.com");
    expect(issued?.token.length).toBeGreaterThan(20);
    await resetPassword(issued!.token, "newpassword123");
    expect(await verifyCredentials("asha@example.com", "newpassword123")).not.toBeNull();
    await expect(resetPassword(issued!.token, "again12345")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("updates profile and changes password only with the current one", async () => {
    const u = await registerUser({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" });
    expect((await updateProfile(u.id, { name: "Asha K" })).name).toBe("Asha K");
    await expect(changePassword(u.id, "wrong", "newpassword123")).rejects.toBeInstanceOf(UnauthorizedError);
    await changePassword(u.id, "hunter2hunter2", "newpassword123");
    expect(await verifyCredentials("asha@example.com", "newpassword123")).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npm test -- tests/unit/auth-service.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 5: Implement the auth service**

Create `src/server/services/auth.ts`:

```ts
import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";
import { registerSchema, updateProfileSchema, changePasswordSchema, passwordSchema } from "@/lib/validation/auth";

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: "CUSTOMER" | "ADMIN";
}

const RESET_PREFIX = "pwreset:";
const RESET_TTL_MS = 60 * 60 * 1000;

function toPublic(u: { id: string; email: string; name: string | null; image: string | null; role: "CUSTOMER" | "ADMIN" }): PublicUser {
  return { id: u.id, email: u.email, name: u.name, image: u.image, role: u.role };
}

function fieldErrors(err: { flatten(): { fieldErrors: Record<string, string[] | undefined> } }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(err.flatten().fieldErrors)) if (v?.length) out[k] = v;
  return out;
}

export async function registerUser(input: { name: string; email: string; password: string }): Promise<PublicUser> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const { name, email, password } = parsed.data;
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) throw new ConflictError("An account with this email already exists");
  const passwordHash = await hash(password, 10);
  const user = await db.user.create({ data: { name, email, passwordHash } });
  return toPublic(user);
}

export async function verifyCredentials(email: string, password: string): Promise<PublicUser | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user?.passwordHash) return null;
  const ok = await compare(password, user.passwordHash);
  return ok ? toPublic(user) : null;
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const user = await db.user.findUnique({ where: { id } });
  return user ? toPublic(user) : null;
}

export async function createPasswordResetToken(email: string): Promise<{ token: string; user: PublicUser } | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return null;
  const token = randomBytes(32).toString("base64url");
  const identifier = RESET_PREFIX + user.email;
  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({ data: { identifier, token, expires: new Date(Date.now() + RESET_TTL_MS) } });
  return { token, user: toPublic(user) };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) throw new ValidationError({ password: parsed.error.issues.map((i) => i.message) });
  const row = await db.verificationToken.findUnique({ where: { token } });
  if (!row || !row.identifier.startsWith(RESET_PREFIX) || row.expires < new Date()) {
    throw new UnauthorizedError("This reset link is invalid or has expired");
  }
  const email = row.identifier.slice(RESET_PREFIX.length);
  await db.$transaction([
    db.user.update({ where: { email }, data: { passwordHash: await hash(parsed.data, 10) } }),
    db.verificationToken.delete({ where: { identifier_token: { identifier: row.identifier, token } } }),
  ]);
}

export async function updateProfile(userId: string, input: { name: string }): Promise<PublicUser> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const user = await db.user.update({ where: { id: userId }, data: { name: parsed.data.name } });
  return toPublic(user);
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const parsed = changePasswordSchema.safeParse({ current, next });
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");
  if (!user.passwordHash || !(await compare(current, user.passwordHash))) {
    throw new UnauthorizedError("Current password is incorrect");
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hash(next, 10) } });
}
```

- [ ] **Step 6: Run the service tests**

Run: `npm test -- tests/unit/auth-service.test.ts`
Expected: PASS.

- [ ] **Step 7: Auth.js split configuration (edge-safe part has no Prisma)**

Create `src/types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; role: "CUSTOMER" | "ADMIN" };
  }
  interface User {
    role?: "CUSTOMER" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "CUSTOMER" | "ADMIN";
  }
}
```

Create `src/server/auth.config.ts`:

```ts
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: googleEnabled
    ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, allowDangerousEmailAccountLinking: true })]
    : [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "CUSTOMER";
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      session.user.role = token.role ?? "CUSTOMER";
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isAdminArea = pathname.startsWith("/admin");
      const isAccountArea = pathname.startsWith("/account");
      if (isAdminArea) return auth?.user?.role === "ADMIN";
      if (isAccountArea) return Boolean(auth?.user);
      return true;
    },
  },
} satisfies NextAuthConfig;
```

Create `src/server/auth.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/server/db";
import { authConfig } from "@/server/auth.config";
import { verifyCredentials } from "@/server/services/auth";
import { loginSchema } from "@/lib/validation/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await verifyCredentials(parsed.data.email, parsed.data.password);
        return user ? { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role } : null;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "CUSTOMER";
      }
      if (trigger === "update" && token.id) {
        const fresh = await db.user.findUnique({ where: { id: token.id }, select: { role: true, name: true } });
        if (fresh) {
          token.role = fresh.role;
          token.name = fresh.name;
        }
      }
      if (!token.role && token.id) {
        const fresh = await db.user.findUnique({ where: { id: token.id }, select: { role: true } });
        token.role = fresh?.role ?? "CUSTOMER";
      }
      return token;
    },
  },
});
```

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/server/auth";

export const { GET, POST } = handlers;
```

Create `src/middleware.ts`:

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/server/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"],
};
```

Note: with `authorized` returning `false`, Auth.js redirects to `pages.signIn` (`/login`) with a `callbackUrl` query. Non-admin logged-in users hitting `/admin` also land on `/login`; the login page (Plan 1B) shows "You need an admin account" when it sees an active session.

- [ ] **Step 8: Merge the guest cart after any login**

Create `src/app/auth/after-login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { clearGuestToken, readGuestToken } from "@/server/cart-cookie";
import { mergeGuestCartIntoUser } from "@/server/services/cart";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const session = await auth();
  if (session?.user?.id) {
    const guestToken = await readGuestToken();
    if (guestToken) {
      await mergeGuestCartIntoUser(guestToken, session.user.id);
      await clearGuestToken();
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
```

Every login path (credentials server action, Google `signIn`) must use `redirectTo: "/auth/after-login?next=<destination>"` so this route runs once. Plan 1B wires the pages.

- [ ] **Step 9: Typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green. If `next-auth` complains that `authConfig.providers` is typed too narrowly, cast with `providers: [...authConfig.providers]` as shown and ensure `authConfig` uses `satisfies NextAuthConfig` (not a type annotation).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(auth): add auth service, Auth.js credentials + Google, and route protection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Storage and email adapters, image validation, local upload serving

**Files:**
- Create: `src/server/adapters/storage/types.ts`, `src/server/adapters/storage/local-disk.ts`, `src/server/adapters/storage/s3.ts`, `src/server/adapters/storage/index.ts`, `src/server/adapters/email/types.ts`, `src/server/adapters/email/console.ts`, `src/server/adapters/email/ses.ts`, `src/server/adapters/email/index.ts`, `src/server/uploads.ts`, `src/app/api/uploads/[...path]/route.ts`
- Test: `tests/unit/storage.test.ts`, `tests/unit/uploads.test.ts`, `tests/unit/email.test.ts`

**Interfaces:**
- Produces:

```ts
// @/server/adapters/storage
export interface StorageAdapter { put(key: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }>; getPublicUrl(key: string): string; delete(key: string): Promise<void> }
export class LocalDiskStorage implements StorageAdapter { constructor(rootDir: string, publicBase?: string) }
export class S3Storage implements StorageAdapter { constructor(opts: { bucket: string; region: string; publicBaseUrl: string }) }
export function getStorage(): StorageAdapter   // by STORAGE_DRIVER
// @/server/uploads
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export function validateImage(bytes: Uint8Array): { ext: "png" | "jpg" | "webp"; contentType: string }  // throws ValidationError
export function newUploadKey(prefix: string, ext: string): string
export function storeImage(file: File, prefix: string): Promise<{ url: string; key: string }>
// @/server/adapters/email
export interface EmailMessage { to: string; subject: string; html: string; text?: string }
export interface EmailAdapter { send(msg: EmailMessage): Promise<void> }
export class ConsoleEmail implements EmailAdapter { sent: EmailMessage[] }
export function getEmail(): EmailAdapter   // by EMAIL_DRIVER
```

- [ ] **Step 1: Install AWS SDK clients (tree-shaken, only used when drivers are s3/ses)**

```bash
npm i @aws-sdk/client-s3 @aws-sdk/client-ses
```

- [ ] **Step 2: Write failing tests**

Create `tests/unit/storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

describe("LocalDiskStorage", () => {
  it("writes, exposes a public url, and deletes", async () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    const s = new LocalDiskStorage(root, "/api/uploads");
    const { url } = await s.put("products/abc.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(url).toBe("/api/uploads/products/abc.png");
    expect(readFileSync(join(root, "products", "abc.png"))).toEqual(Buffer.from([1, 2, 3]));
    await s.delete("products/abc.png");
    expect(existsSync(join(root, "products", "abc.png"))).toBe(false);
    await expect(s.delete("products/abc.png")).resolves.toBeUndefined();
  });

  it("refuses keys that escape the root", async () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    const s = new LocalDiskStorage(root);
    await expect(s.put("../evil.png", new Uint8Array([1]), "image/png")).rejects.toThrow();
  });
});
```

Create `tests/unit/uploads.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, newUploadKey, validateImage } from "@/server/uploads";
import { ValidationError } from "@/server/errors";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("validateImage", () => {
  it("detects png, jpg, and webp by magic bytes", () => {
    expect(validateImage(png)).toEqual({ ext: "png", contentType: "image/png" });
    expect(validateImage(jpg)).toEqual({ ext: "jpg", contentType: "image/jpeg" });
    expect(validateImage(webp)).toEqual({ ext: "webp", contentType: "image/webp" });
  });

  it("rejects other bytes and oversize files", () => {
    expect(() => validateImage(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0]))).toThrow(ValidationError);
    expect(() => validateImage(new Uint8Array(MAX_UPLOAD_BYTES + 1))).toThrow(ValidationError);
  });

  it("builds random keys under a prefix", () => {
    const k = newUploadKey("products", "png");
    expect(k).toMatch(/^products\/[a-z0-9-]+\.png$/);
    expect(newUploadKey("products", "png")).not.toBe(k);
  });
});
```

Create `tests/unit/email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ConsoleEmail } from "@/server/adapters/email/console";

describe("ConsoleEmail", () => {
  it("records messages instead of sending", async () => {
    const e = new ConsoleEmail();
    await e.send({ to: "a@b.c", subject: "Hi", html: "<p>hi</p>" });
    expect(e.sent).toHaveLength(1);
    expect(e.sent[0].subject).toBe("Hi");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test -- tests/unit/storage.test.ts tests/unit/uploads.test.ts tests/unit/email.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement storage**

Create `src/server/adapters/storage/types.ts`:

```ts
export interface StorageAdapter {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
}
```

Create `src/server/adapters/storage/local-disk.ts`:

```ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { StorageAdapter } from "./types";

export class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly rootDir: string, private readonly publicBase = "/api/uploads") {}

  private resolveKey(key: string): string {
    const root = resolve(this.rootDir);
    const full = resolve(root, key);
    if (full !== root && !full.startsWith(root + sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<{ url: string }> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return { url: this.getPublicUrl(key) };
  }

  getPublicUrl(key: string): string {
    return `${this.publicBase}/${key.replace(/^\/+/, "")}`;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }
}
```

Create `src/server/adapters/storage/s3.ts`:

```ts
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./types";

export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;
  constructor(private readonly opts: { bucket: string; region: string; publicBaseUrl: string }) {
    this.client = new S3Client({ region: opts.region });
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }> {
    await this.client.send(new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: bytes, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
    return { url: this.getPublicUrl(key) };
  }

  getPublicUrl(key: string): string {
    return `${this.opts.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }
}
```

Create `src/server/adapters/storage/index.ts`:

```ts
import { join } from "node:path";
import { LocalDiskStorage } from "./local-disk";
import { S3Storage } from "./s3";
import type { StorageAdapter } from "./types";

export type { StorageAdapter } from "./types";
export { LocalDiskStorage } from "./local-disk";
export { S3Storage } from "./s3";

export const LOCAL_UPLOAD_ROOT = join(process.cwd(), "storage", "uploads");

let cached: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (cached) return cached;
  if (process.env.STORAGE_DRIVER === "s3") {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.AWS_REGION;
    const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
    if (!bucket || !region || !publicBaseUrl) throw new Error("S3_BUCKET, AWS_REGION and S3_PUBLIC_BASE_URL are required when STORAGE_DRIVER=s3");
    cached = new S3Storage({ bucket, region, publicBaseUrl });
  } else {
    cached = new LocalDiskStorage(LOCAL_UPLOAD_ROOT);
  }
  return cached;
}
```

- [ ] **Step 5: Implement upload validation and the local file route**

Create `src/server/uploads.ts`:

```ts
import { randomUUID } from "node:crypto";
import { ValidationError } from "@/server/errors";
import { getStorage } from "@/server/adapters/storage";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type Detected = { ext: "png" | "jpg" | "webp"; contentType: string };

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

export function validateImage(bytes: Uint8Array): Detected {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError({ file: [`Images must be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`] });
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", contentType: "image/png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ext: "jpg", contentType: "image/jpeg" };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { ext: "webp", contentType: "image/webp" };
  throw new ValidationError({ file: ["Only PNG, JPG, and WebP images are allowed"] });
}

export function newUploadKey(prefix: string, ext: string): string {
  return `${prefix}/${randomUUID()}.${ext}`;
}

export async function storeImage(file: File, prefix: string): Promise<{ url: string; key: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { ext, contentType } = validateImage(bytes);
  const key = newUploadKey(prefix, ext);
  const { url } = await getStorage().put(key, bytes, contentType);
  return { url, key };
}
```

Create `src/app/api/uploads/[...path]/route.ts`:

```ts
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { LOCAL_UPLOAD_ROOT } from "@/server/adapters/storage";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const root = resolve(LOCAL_UPLOAD_ROOT);
  const full = resolve(root, ...path);
  if (!full.startsWith(root + sep)) return new Response("Not found", { status: 404 });
  const type = TYPES[extname(full).toLowerCase()];
  if (!type) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(full);
    return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
```

- [ ] **Step 6: Implement email**

Create `src/server/adapters/email/types.ts`:

```ts
export interface EmailMessage { to: string; subject: string; html: string; text?: string }
export interface EmailAdapter { send(msg: EmailMessage): Promise<void> }
```

Create `src/server/adapters/email/console.ts`:

```ts
import type { EmailAdapter, EmailMessage } from "./types";

export class ConsoleEmail implements EmailAdapter {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
    console.log(`[email] to=${msg.to} subject="${msg.subject}"\n${msg.text ?? msg.html}`);
  }
}
```

Create `src/server/adapters/email/ses.ts`:

```ts
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { EmailAdapter, EmailMessage } from "./types";

export class SesEmail implements EmailAdapter {
  private readonly client: SESClient;
  constructor(private readonly from: string, region: string) {
    this.client = new SESClient({ region });
  }
  async send(msg: EmailMessage): Promise<void> {
    await this.client.send(new SendEmailCommand({
      Source: this.from,
      Destination: { ToAddresses: [msg.to] },
      Message: {
        Subject: { Data: msg.subject, Charset: "UTF-8" },
        Body: { Html: { Data: msg.html, Charset: "UTF-8" }, ...(msg.text ? { Text: { Data: msg.text, Charset: "UTF-8" } } : {}) },
      },
    }));
  }
}
```

Create `src/server/adapters/email/index.ts`:

```ts
import { ConsoleEmail } from "./console";
import { SesEmail } from "./ses";
import type { EmailAdapter } from "./types";

export type { EmailAdapter, EmailMessage } from "./types";
export { ConsoleEmail } from "./console";

let cached: EmailAdapter | undefined;

export function getEmail(): EmailAdapter {
  if (cached) return cached;
  if (process.env.EMAIL_DRIVER === "ses") {
    const from = process.env.EMAIL_FROM;
    const region = process.env.AWS_REGION;
    if (!from || !region) throw new Error("EMAIL_FROM and AWS_REGION are required when EMAIL_DRIVER=ses");
    cached = new SesEmail(from, region);
  } else {
    cached = new ConsoleEmail();
  }
  return cached;
}
```

- [ ] **Step 7: Run tests, lint, typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: green. If ESLint flags the unused `_contentType` parameter, keep the underscore prefix (the scaffold config allows it) or add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` above it.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(adapters): add storage and email adapters with image validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Public REST API `/api/v1`

**Files:**
- Create: `src/lib/validation/catalog.ts`, `src/server/rate-limit.ts`, `src/server/api-token.ts`, `src/server/api.ts`, and route files:
  `src/app/api/v1/collections/route.ts`, `src/app/api/v1/collections/[slug]/products/route.ts`, `src/app/api/v1/products/[slug]/route.ts`, `src/app/api/v1/search/route.ts`, `src/app/api/v1/cart/route.ts`, `src/app/api/v1/cart/items/route.ts`, `src/app/api/v1/cart/items/[id]/route.ts`, `src/app/api/v1/auth/register/route.ts`, `src/app/api/v1/auth/login/route.ts`, `src/app/api/v1/me/route.ts`
- Test: `tests/unit/rate-limit.test.ts`, `tests/unit/api.test.ts`

**Interfaces:**
- Consumes: catalog, cart, auth services; `toHttp`; `readGuestToken`.
- Produces:

```ts
// @/lib/validation/catalog  (also used by the storefront collection page in Plan 1B)
export const productQuerySchema: z.ZodType<{ size?: string[]; color?: string[]; fit?: Fit[]; minPrice?: number; maxPrice?: number; sort: ProductSort; page: number }>
export function parseProductQuery(params: URLSearchParams | Record<string, string | string[] | undefined>): { filters: ProductFilters; sort: ProductSort; page: number }
// @/server/rate-limit
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number }
// @/server/api-token
export function signApiToken(user: { id: string; role: string }): Promise<string>   // 30 days
export function verifyApiToken(token: string): Promise<{ id: string; role: string } | null>
// @/server/api
export function ok<T>(data: T, init?: ResponseInit): Response
export function handle(fn: (req: NextRequest, ctx: RouteCtx) => Promise<Response>): (req: NextRequest, ctx: RouteCtx) => Promise<Response>
export function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T>
export function getApiUser(req: NextRequest): Promise<PublicUser | null>        // Bearer first, then session cookie
export function requireApiUser(req: NextRequest): Promise<PublicUser>
export function resolveApiCartRef(req: NextRequest): Promise<{ ref: CartRef; newGuestToken: string | null }>
export const CART_TOKEN_HEADER = "X-Cart-Token";
```

Contract: the mobile app authenticates with `Authorization: Bearer <token>` from `/auth/login` or `/auth/register`. Anonymous carts send `X-Cart-Token`; when absent the server creates one and returns it in the `X-Cart-Token` response header, which the client must store and resend.

- [ ] **Step 1: Install jose (JWT signing) and write the query parser**

```bash
npm i jose
```

Create `src/lib/validation/catalog.ts`:

```ts
import { z } from "zod";
import type { Fit } from "@prisma/client";
import { PRODUCT_SORTS, type ProductFilters, type ProductSort } from "@/server/services/catalog";

const FITS = ["OVERSIZED", "REGULAR", "RELAXED"] as const;

const list = z.preprocess((v) => {
  if (Array.isArray(v)) return v.flatMap((s) => String(s).split(",")).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return undefined;
}, z.array(z.string()).optional());

const paise = z.coerce.number().int().min(0).optional();

export const productQuerySchema = z.object({
  size: list,
  color: list,
  fit: z.preprocess((v) => (v === undefined ? undefined : v), list).pipe(z.array(z.enum(FITS)).optional()),
  minPrice: paise,
  maxPrice: paise,
  sort: z.enum(PRODUCT_SORTS as [ProductSort, ...ProductSort[]]).default("featured"),
  page: z.coerce.number().int().min(1).default(1),
});

export function parseProductQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): { filters: ProductFilters; sort: ProductSort; page: number } {
  const raw: Record<string, string | string[] | undefined> =
    params instanceof URLSearchParams
      ? Object.fromEntries([...new Set(params.keys())].map((k) => [k, params.getAll(k)]))
      : params;
  const parsed = productQuerySchema.safeParse(raw);
  const q = parsed.success ? parsed.data : productQuerySchema.parse({});
  return {
    filters: { size: q.size, color: q.color, fit: q.fit as Fit[] | undefined, minPricePaise: q.minPrice, maxPricePaise: q.maxPrice },
    sort: q.sort,
    page: q.page,
  };
}
```

Bad values fall back to defaults instead of erroring, so a mangled URL still renders a grid.

- [ ] **Step 2: Rate limiter with test**

Create `tests/unit/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rateLimit } from "@/server/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit inside the window then blocks", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});
```

Create `src/server/rate-limit.ts`:

```ts
const buckets = new Map<string, number[]>();

/** In-memory sliding window. Fine for one instance; swap for Redis if a second instance is added. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.ceil((hits[0] + windowMs - now) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) buckets.clear();
  return { ok: true, retryAfterSec: 0 };
}
```

- [ ] **Step 3: API tokens and the handler toolkit**

Create `src/server/api-token.ts`:

```ts
import { SignJWT, jwtVerify } from "jose";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signApiToken(user: { id: string; role: string }): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyApiToken(token: string): Promise<{ id: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return { id: payload.sub, role: String(payload.role ?? "CUSTOMER") };
  } catch {
    return null;
  }
}
```

Create `src/server/api.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { randomBytes } from "node:crypto";
import { toHttp, UnauthorizedError, ValidationError } from "@/server/errors";
import { verifyApiToken } from "@/server/api-token";
import { getUserById, type PublicUser } from "@/server/services/auth";
import type { CartRef } from "@/server/services/cart";
import { CART_COOKIE } from "@/server/cart-cookie";

export const CART_TOKEN_HEADER = "X-Cart-Token";
export type RouteCtx = { params: Promise<Record<string, string>> };

export function ok<T>(data: T, init?: ResponseInit): Response {
  return NextResponse.json({ data }, init);
}

export function handle(fn: (req: NextRequest, ctx: RouteCtx) => Promise<Response>) {
  return async (req: NextRequest, ctx: RouteCtx): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      const { status, body } = toHttp(err);
      return NextResponse.json(body, { status });
    }
  };
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError({ body: ["Expected a JSON body"] });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path.join(".") || "body";
      (fields[k] ??= []).push(issue.message);
    }
    throw new ValidationError(fields);
  }
  return parsed.data;
}

export async function getApiUser(req: NextRequest): Promise<PublicUser | null> {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const claims = await verifyApiToken(header.slice(7).trim());
    return claims ? getUserById(claims.id) : null;
  }
  try {
    const { auth } = await import("@/server/auth");
    const session = await auth();
    return session?.user?.id ? getUserById(session.user.id) : null;
  } catch {
    return null;
  }
}

export async function requireApiUser(req: NextRequest): Promise<PublicUser> {
  const user = await getApiUser(req);
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function resolveApiCartRef(req: NextRequest): Promise<{ ref: CartRef; newGuestToken: string | null }> {
  const user = await getApiUser(req);
  if (user) return { ref: { userId: user.id }, newGuestToken: null };
  const fromHeader = req.headers.get(CART_TOKEN_HEADER);
  if (fromHeader) return { ref: { guestToken: fromHeader }, newGuestToken: null };
  const fromCookie = req.cookies.get(CART_COOKIE)?.value;
  if (fromCookie) return { ref: { guestToken: fromCookie }, newGuestToken: null };
  const token = randomBytes(24).toString("base64url");
  return { ref: { guestToken: token }, newGuestToken: token };
}

export function withCartToken(res: Response, token: string | null): Response {
  if (token) res.headers.set(CART_TOKEN_HEADER, token);
  return res;
}
```

- [ ] **Step 4: Write failing API tests**

Create `tests/unit/api.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createCollection, createProduct } from "../helpers/fixtures";
import { GET as listCollections } from "@/app/api/v1/collections/route";
import { GET as collectionProducts } from "@/app/api/v1/collections/[slug]/products/route";
import { GET as productDetail } from "@/app/api/v1/products/[slug]/route";
import { GET as search } from "@/app/api/v1/search/route";
import { GET as getCart } from "@/app/api/v1/cart/route";
import { POST as addCartItem } from "@/app/api/v1/cart/items/route";
import { PATCH as patchCartItem, DELETE as deleteCartItem } from "@/app/api/v1/cart/items/[id]/route";
import { POST as register } from "@/app/api/v1/auth/register/route";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { GET as me } from "@/app/api/v1/me/route";

const BASE = "http://localhost:3000";
const req = (path: string, init: RequestInit = {}) => new NextRequest(BASE + path, init);
const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers },
});
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

describe("/api/v1", () => {
  beforeEach(resetDb);

  it("lists collections and paged products with filters in the envelope", async () => {
    const col = await createCollection({ name: "Drops", isFeatured: true });
    await createProduct({ name: "Big", collectionIds: [col.id], variants: [{ size: "XL", colorName: "Black" }] });
    await createProduct({ name: "Small", collectionIds: [col.id], variants: [{ size: "S", colorName: "White" }] });
    const cols = await (await listCollections(req("/api/v1/collections"), params({}))).json();
    expect(cols.data[0].slug).toBe("drops");
    const res = await collectionProducts(req("/api/v1/collections/drops/products?size=S"), params({ slug: "drops" }));
    const body = await res.json();
    expect(body.data.items.map((p: { name: string }) => p.name)).toEqual(["Small"]);
    const missing = await collectionProducts(req("/api/v1/collections/nope/products"), params({ slug: "nope" }));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns product detail with related products, and searches", async () => {
    const col = await createCollection({ name: "C" });
    await createProduct({ name: "Alpha Tee", collectionIds: [col.id] });
    await createProduct({ name: "Beta Tee", collectionIds: [col.id] });
    const res = await productDetail(req("/api/v1/products/alpha-tee"), params({ slug: "alpha-tee" }));
    const body = await res.json();
    expect(body.data.product.slug).toBe("alpha-tee");
    expect(body.data.related.map((p: { name: string }) => p.name)).toEqual(["Beta Tee"]);
    const s = await (await search(req("/api/v1/search?q=beta"), params({}))).json();
    expect(s.data.items).toHaveLength(1);
  });

  it("runs a guest cart through add, update, delete using X-Cart-Token", async () => {
    const p = await createProduct({ name: "Cart Tee", variants: [{ size: "M", colorName: "Black", stock: 3 }] });
    const first = await addCartItem(req("/api/v1/cart/items", json({ variantId: p.variants[0].id, quantity: 1 })), params({}));
    expect(first.status).toBe(200);
    const token = first.headers.get("X-Cart-Token");
    expect(token).toBeTruthy();
    const h = { "X-Cart-Token": token! };

    const view = await (await getCart(req("/api/v1/cart", { headers: h }), params({}))).json();
    expect(view.data.itemCount).toBe(1);
    const itemId = view.data.items[0].id;

    const tooMany = await patchCartItem(req(`/api/v1/cart/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity: 5 }), headers: { ...h, "content-type": "application/json" } }), params({ id: itemId }));
    expect(tooMany.status).toBe(409);
    expect((await tooMany.json()).error.code).toBe("OUT_OF_STOCK");

    const gone = await deleteCartItem(req(`/api/v1/cart/items/${itemId}`, { method: "DELETE", headers: h }), params({ id: itemId }));
    expect((await gone.json()).data.items).toEqual([]);

    const bad = await addCartItem(req("/api/v1/cart/items", json({ variantId: "", quantity: 0 }, h)), params({}));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("registers, logs in with a bearer token, and reads /me", async () => {
    const r = await register(req("/api/v1/auth/register", json({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" })), params({}));
    expect(r.status).toBe(201);
    const rb = await r.json();
    expect(rb.data.token).toBeTruthy();
    expect(rb.data.user.email).toBe("asha@example.com");

    const dup = await register(req("/api/v1/auth/register", json({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" })), params({}));
    expect(dup.status).toBe(409);

    const bad = await login(req("/api/v1/auth/login", json({ email: "asha@example.com", password: "wrong" })), params({}));
    expect(bad.status).toBe(401);

    const good = await login(req("/api/v1/auth/login", json({ email: "asha@example.com", password: "hunter2hunter2" })), params({}));
    const { token } = (await good.json()).data;
    const who = await me(req("/api/v1/me", { headers: { authorization: `Bearer ${token}` } }), params({}));
    expect((await who.json()).data.email).toBe("asha@example.com");
    const anon = await me(req("/api/v1/me"), params({}));
    expect(anon.status).toBe(401);
  });

  it("uses the user cart when a bearer token is present", async () => {
    const p = await createProduct({ name: "User Tee" });
    const r = await register(req("/api/v1/auth/register", json({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" })), params({}));
    const { token } = (await r.json()).data;
    const auth = { authorization: `Bearer ${token}` };
    const added = await addCartItem(req("/api/v1/cart/items", json({ variantId: p.variants[0].id, quantity: 2 }, auth)), params({}));
    expect(added.headers.get("X-Cart-Token")).toBeNull();
    const view = await (await getCart(req("/api/v1/cart", { headers: auth }), params({}))).json();
    expect(view.data.itemCount).toBe(2);
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `npm test -- tests/unit/api.test.ts`
Expected: FAIL, route modules not found.

- [ ] **Step 6: Implement the routes**

Create `src/app/api/v1/collections/route.ts`:

```ts
import { handle, ok } from "@/server/api";
import { listCollections } from "@/server/services/catalog";

export const GET = handle(async () => ok(await listCollections()));
```

Create `src/app/api/v1/collections/[slug]/products/route.ts`:

```ts
import { handle, ok } from "@/server/api";
import { getCollectionBySlug, getFacets, listProducts } from "@/server/services/catalog";
import { parseProductQuery } from "@/lib/validation/catalog";

export const GET = handle(async (req, ctx) => {
  const { slug } = await ctx.params;
  const collection = await getCollectionBySlug(slug);
  const { filters, sort, page } = parseProductQuery(req.nextUrl.searchParams);
  const [products, facets] = await Promise.all([
    listProducts({ collectionSlug: slug, filters, sort, page }),
    getFacets(slug),
  ]);
  return ok({ collection, ...products, facets });
});
```

Create `src/app/api/v1/products/[slug]/route.ts`:

```ts
import { handle, ok } from "@/server/api";
import { getProductBySlug, getRelatedProducts } from "@/server/services/catalog";

export const GET = handle(async (_req, ctx) => {
  const { slug } = await ctx.params;
  const product = await getProductBySlug(slug);
  const related = await getRelatedProducts(product.id, 4);
  return ok({ product, related });
});
```

Create `src/app/api/v1/search/route.ts`:

```ts
import { handle, ok } from "@/server/api";
import { searchProducts } from "@/server/services/catalog";

export const GET = handle(async (req) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1) || 1);
  return ok(await searchProducts(q, page));
});
```

Create `src/app/api/v1/cart/route.ts`:

```ts
import { handle, ok, resolveApiCartRef, withCartToken } from "@/server/api";
import { getCart } from "@/server/services/cart";

export const GET = handle(async (req) => {
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  return withCartToken(ok(await getCart(ref)), newGuestToken);
});
```

Create `src/app/api/v1/cart/items/route.ts`:

```ts
import { z } from "zod";
import { handle, ok, parseJson, resolveApiCartRef, withCartToken } from "@/server/api";
import { addItem, MAX_QTY_PER_LINE } from "@/server/services/cart";

const addSchema = z.object({
  variantId: z.string().min(1, "variantId is required"),
  quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE).default(1),
});

export const POST = handle(async (req) => {
  const body = await parseJson(req, addSchema);
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  return withCartToken(ok(await addItem(ref, body.variantId, body.quantity)), newGuestToken);
});
```

Create `src/app/api/v1/cart/items/[id]/route.ts`:

```ts
import { z } from "zod";
import { handle, ok, parseJson, resolveApiCartRef, withCartToken } from "@/server/api";
import { MAX_QTY_PER_LINE, removeItem, updateItem } from "@/server/services/cart";

const patchSchema = z.object({ quantity: z.number().int().min(0).max(MAX_QTY_PER_LINE) });

export const PATCH = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  return withCartToken(ok(await updateItem(ref, id, body.quantity)), newGuestToken);
});

export const DELETE = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  return withCartToken(ok(await removeItem(ref, id)), newGuestToken);
});
```

Create `src/app/api/v1/auth/register/route.ts`:

```ts
import { handle, ok, parseJson } from "@/server/api";
import { registerSchema } from "@/lib/validation/auth";
import { registerUser } from "@/server/services/auth";
import { signApiToken } from "@/server/api-token";
import { rateLimit } from "@/server/rate-limit";
import { DomainError } from "@/server/errors";

export const POST = handle(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`register:${ip}`, 20, 60_000);
  if (!limit.ok) throw new DomainError("RATE_LIMITED", "Too many attempts, try again shortly", 429, { retryAfterSec: limit.retryAfterSec });
  const body = await parseJson(req, registerSchema);
  const user = await registerUser(body);
  const token = await signApiToken(user);
  return ok({ user, token }, { status: 201 });
});
```

Create `src/app/api/v1/auth/login/route.ts`:

```ts
import { handle, ok, parseJson } from "@/server/api";
import { loginSchema } from "@/lib/validation/auth";
import { verifyCredentials } from "@/server/services/auth";
import { signApiToken } from "@/server/api-token";
import { rateLimit } from "@/server/rate-limit";
import { DomainError, UnauthorizedError } from "@/server/errors";

export const POST = handle(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`login:${ip}`, 60, 60_000);
  if (!limit.ok) throw new DomainError("RATE_LIMITED", "Too many attempts, try again shortly", 429, { retryAfterSec: limit.retryAfterSec });
  const body = await parseJson(req, loginSchema);
  const user = await verifyCredentials(body.email, body.password);
  if (!user) throw new UnauthorizedError("Incorrect email or password");
  const token = await signApiToken(user);
  return ok({ user, token });
});
```

Create `src/app/api/v1/me/route.ts`:

```ts
import { handle, ok, requireApiUser } from "@/server/api";

export const GET = handle(async (req) => ok(await requireApiUser(req)));
```

- [ ] **Step 7: Run everything**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all green; the build's route table lists every `/api/v1/*` path. If `next/server` imports fail inside Vitest with a `Request is not defined` style error, Node 22 provides the fetch globals, so check that `vitest.config.ts` has `environment: "node"`.

- [ ] **Step 8: Smoke the running server**

Run in one terminal: `npm run dev`. In another:

```bash
curl -s http://localhost:3000/api/v1/collections | head -c 300; echo
curl -s "http://localhost:3000/api/v1/collections/new-drops/products?sort=price-asc" | head -c 300; echo
curl -s -i -X POST http://localhost:3000/api/v1/cart/items -H "content-type: application/json" -d "{\"variantId\":\"x\",\"quantity\":1}" | head -20
```

Expected: JSON envelopes; the last call returns 404 `NOT_FOUND` with an `X-Cart-Token` header present.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(api): add /api/v1 catalog, cart, and auth endpoints with bearer tokens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Plan self-review

- **Spec coverage (Plan 1A scope):** architecture and service layer (Tasks 2, 5, 7, 8), adapters (Task 9), auth with JWT and role (Task 8), cart persistence and merge (Tasks 7, 8), money in paise (Task 4), API envelope, endpoints, rate limit (Task 10), error handling (Tasks 4, 10), local dev (Task 1), seed (Task 6), Vitest with real Postgres (Task 3). Storefront pages, admin UI, Playwright, Docker deploy, and CI are Plans 1B, 1C, 1D.
- **Placeholders:** none. Every step has runnable code or a command with expected output.
- **Type consistency:** `CartRef`, `CartView`, `PublicUser`, `ProductCard`, `Page<T>`, `parseProductQuery`, `handle/ok/parseJson/resolveApiCartRef/withCartToken` are defined once and used with the same names across Tasks 7, 8, 10. `ctx.params` is a Promise everywhere (Next 15).
