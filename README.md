# T-Shirt Store (brand name pending)

Custom T-shirt e-commerce: animated storefront, persistent cart, accounts, admin panel, and (later) a design-your-own tool. Next.js 15, Prisma, PostgreSQL.

## Local setup

1. `docker compose up -d` — Postgres on localhost:5432 (`thrift` and `thrift_test` databases)
2. `cp .env.example .env` and set `AUTH_SECRET` (`openssl rand -base64 32`)
3. `npm install`
4. `npm run db:migrate` then `npm run db:seed`
5. `npm run db:test:migrate` — applies migrations to the `thrift_test` database used by `npm test`
6. `npm run dev` — http://localhost:3000

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
