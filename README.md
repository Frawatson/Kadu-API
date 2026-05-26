# Kadû API — smoke-test backend

Fastify + Prisma + Postgres backend that backs the [Kadû Partners](https://github.com/Frawatson/Kadu-Partners) frontend during local development. Designed as a **smoke-test** companion to the frontend, not a production service — state lives in a mix of Postgres and in-memory per-partner Maps so the dev loop stays fast and resettable.

## Stack

- **Runtime**: Node 20+ (uses `--env-file` flag)
- **Server**: Fastify 5 (CORS, JWT, multipart body parser for photo uploads)
- **DB**: Postgres 16 via Docker Compose (port `5433`)
- **ORM**: Prisma 6 (one model: `Partner`, plus `SettingsGeneral` 1:1)
- **Auth**: bcryptjs password hashing, JWT access + refresh tokens
- **Validation**: zod for request bodies

## Quick start

```bash
# 1. Start Postgres
npm run db:up

# 2. Install + migrate
npm install
npm run prisma:migrate

# 3. Seed the demo partner (info@monroviahardware.lr / Password!23)
npm run prisma:seed

# 4. Run the API (port 3003)
cp .env.example .env   # if you don't already have one
npm run dev
```

The API listens on `http://localhost:3003/api/v1`. Health probe: `GET /api/v1/health`.

## Architecture notes

- **Per-partner data scoping**: Postgres holds the `Partner` row; everything else (catalog items, payout methods, storefront locations, etc.) lives in in-memory `Map<partnerId, T[]>` instances in `src/state/fixtures.ts` and is reachable through helpers in `src/lib/partner-context.ts`. New partners get isolated fixtures; the seeded demo partner (`info@monroviahardware.lr`) shares the canonical mock data so the demo UX stays rich.
- **Lazy storefront seed**: when a partner first patches in `businessName` + `businessAddress`, the next read of `locationsForPartner` materialises a stable first storefront (id `loc-${partnerId}`) so the Shop Profile page never sticks on its empty state.
- **Photo uploads**: smoke-test doesn't actually store binaries — the frontend encodes picked images as data URLs client-side and stores them on the location/item record. The API's `multipart/form-data` parser exists to drain inbound multipart bodies cleanly (so a real upload service could slot in later) but currently echoes a placeholder URL.
- **Process restarts**: `tsx watch` wipes the in-memory Maps on every reload. The lazy-seed pattern means the Shop Profile recovers automatically; per-partner catalog and payout methods do not (acceptable for smoke-test).

## Env vars

See `.env.example`. The repo never commits real `.env` files (gitignored).

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://kadu:kadu@localhost:5433/kadu?schema=public` | Matches `docker-compose.yml`. |
| `JWT_SECRET` | _(required)_ | Any string for dev — set to something proper for any non-local deploy. |
| `PORT` | `3003` | |
| `CORS_ORIGIN` | `http://localhost:3002` | Frontend dev origin. |

## Repo layout

```
prisma/
  schema.prisma            Prisma model + migrations
  seed.ts                  Demo partner + settings
  migrations/              SQL migrations
src/
  server.ts                Fastify bootstrap
  lib/
    envelope.ts            { data, meta } / { error, meta } helpers
    partner-context.ts     Per-partner scoping + lazy-seed helpers
    partner-mapper.ts      Prisma Partner → frontend PartrnerProfile
    prisma.ts              Singleton Prisma client
  routes/                  Route handlers per feature area
  state/fixtures.ts        Demo partner fixtures + per-partner Maps
  types/                   Shared types (mirror the frontend)
```

## Not in scope

- Production-grade persistence beyond `Partner`/`SettingsGeneral`
- File storage (uploads echo a placeholder; frontend uses data URLs)
- Email delivery (forgot-password is stubbed; always 200)
- Multi-store-per-partner with hard FK relations (locations live in-memory)
