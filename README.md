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
