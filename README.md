# Victoria Luxury Hotel and Apartment: platform

The hotel's public website, online booking and payment, and the private
management application used by hotel staff. One Next.js application backed by
one Supabase (PostgreSQL) database, which is the single source of truth for
rooms, availability, reservations and payments.

> **Status:** foundation in progress. See [docs/progress.md](docs/progress.md)
> for what is built, what is verified, and what is waiting on the hotel.

## Stack

| Concern | Choice |
| --- | --- |
| Web app | Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4 with brand tokens in `src/app/globals.css` |
| Database / auth / files | Supabase: PostgreSQL 17, Supabase Auth, Supabase Storage |
| Payments | Paystack (NGN), verified server-side |
| Email | Resend |
| Hosting | Vercel; DNS via Cloudflare or the hotel's registrar |
| Tests | Vitest: unit tests, plus database integration tests against local Supabase |

## Project layout

```
src/
  app/
    (public)/            website: /, /about, /rooms, /facilities, /gallery, /contact, /book
    (auth)/login/        staff sign-in
    (management)/app/    management app: /app, /app/reservations, /app/rooms, ...
  components/
    ui/                  shared primitives (button, form, card, badge, table, feedback)
    brand/               logo
    public/              website chrome
    management/          management chrome
  config/hotel.ts        hotel facts supplied by the hotel (address, phone, facilities)
  lib/
    env.ts / env.server.ts   validated environment variables (public vs server-only)
    supabase/            server (RLS), browser, and admin (service-role) clients
    errors.ts, logger.ts
  server/                domain services called by server actions and route handlers
  proxy.ts               session refresh + optimistic /app redirect (not authorization)
supabase/
  migrations/            schema, constraints, RLS, business functions (source of truth)
  seed.sql               LOCAL DEV ONLY placeholder categories and rooms
tests/db/                database integration tests
docs/                    architecture, database, business rules, deployment
```

## Local setup

Requirements: Node 22+, pnpm 10, Docker (for local Supabase).

```bash
pnpm install
pnpm db:start                 # starts local Supabase in Docker; prints keys
cp .env.example .env.local    # fill in the publishable + secret keys from `supabase status`
pnpm db:fresh                 # migrations + dev seed + staff accounts + demo bookings
pnpm mock:integrations        # local Paystack + Resend stand-in (port 4010)
pnpm dev                      # http://localhost:3000
```

## Environment variables

See [.env.example](.env.example). `NEXT_PUBLIC_*` values reach the browser; everything
else is server-only. Integration keys (Paystack, Resend) are validated when first
used, so the site runs locally before every external account exists.

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Absolute links in emails and Paystack callbacks |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase access under RLS |
| `SUPABASE_SECRET_KEY` | Server-only privileged access (webhook, booking flow, jobs) |
| `PAYSTACK_SECRET_KEY` | `sk_test_…` until the hotel's live account is verified |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email |
| `CRON_SECRET` | Authenticates the scheduled job that expires unpaid holds |

## Checks

```bash
pnpm typecheck    # generates route types, then tsc
pnpm lint
pnpm test         # unit tests
pnpm test:db      # database integration tests (local Supabase must be running)
pnpm test:e2e     # browser tests (needs pnpm dev; starts the integrations mock)
pnpm build
```
