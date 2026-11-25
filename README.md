# Victoria Luxury Hotel and Apartment: platform

The hotel's public website, online booking and payment, and the private
management app used by hotel staff: front desk, restaurant & bar, stock,
finance and management. One Next.js app on Cloudflare Workers, with one
Cloudflare D1 (SQLite) database as the single source of truth for rooms,
availability, bookings, payments and sales.

See [docs/progress.md](docs/progress.md) for what is built and verified,
[docs/glossary.md](docs/glossary.md) for the words used on screen, and
[docs/release-review.md](docs/release-review.md) before any production change.

## Stack

| Concern | Choice |
| --- | --- |
| Web app | Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4, brand tokens in `src/app/globals.css` |
| Database | Cloudflare D1 (SQLite); hard business rules enforced by triggers in `migrations/` |
| Photos | Cloudflare R2 (`PHOTOS` binding), served through `/media/…` |
| Staff sign-in | Clerk (invitation only; owner, managers and finance use an authenticator app) |
| Guest accounts | Emailed one-time codes, no passwords |
| Payments | Paystack (NGN), verified server-side before a booking is confirmed |
| Email | Resend |
| Hosting | Cloudflare Workers via OpenNext; see [docs/deployment-cloudflare.md](docs/deployment-cloudflare.md) |
| Tests | Vitest (unit and database), Puppeteer browser tests |

## Project layout

```
src/
  app/
    (public)/              website and booking: /, /rooms, /book, /account, ...
    (auth)/                staff sign-in, two-step set-up, invitation acceptance
    (management)/app/      management app: /app/today, /app/reservations, /app/sales, ...
    api/                   Paystack webhook and callback, scheduled job, health check
  components/              ui/ primitives, public/ website, management/ staff screens, booking/
  domain/                  pure rules shared by screens and server (status, next step, pricing)
  server/
    domain/                business logic over D1 (bookings, payments, restaurant & bar, stock, reports)
    queries/               read models for pages
    *.ts                   server actions: check the role, call the domain, translate errors
  lib/                     formatting, dates (Africa/Lagos), env, logging, Excel export
  proxy.ts                 redirects signed-out visitors (authorisation happens on every request server-side)
migrations/                schema and business rules (source of truth)
db/                        seed.sql + demo.sql (local only), starter.sql (production start), demo-live*.sql
tests/db/                  database tests against a local D1
tests/e2e/                 browser tests against the dev server and the Clerk development instance
scripts/                   create-owner, build secret check
docs/                      decisions, database, payments, access control, deployment, glossary
```

## Local setup

Requirements: Node 22+, pnpm 10, Google Chrome (for the browser tests).

```bash
pnpm install
cp .env.example .env.local        # Clerk development keys, Paystack test key (or the mock's), etc.
pnpm db:fresh                     # local D1: migrations + seed + demo data
pnpm mock:integrations            # local Paystack + Resend stand-in (port 4010)
pnpm dev                          # http://localhost:3000
```

Two-step sign-in is required for owner, general manager, hotel manager and finance.
On your own machine only, `TWO_STEP_OPTIONAL=1 pnpm dev` skips it (it is ignored
unless the site URL is localhost). It cannot be switched off on the live site.

Test accounts for each role are listed in the git-ignored `.test-accounts.local`.

## Environment variables

See [.env.example](.env.example). `NEXT_PUBLIC_*` values reach the browser; everything
else is server-only and, in production, a Cloudflare secret (`pnpm cf:build` fails if a
secret ends up in the build).

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Absolute links in emails and Paystack callbacks |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Staff sign-in |
| `PAYSTACK_SECRET_KEY` | `sk_test_…` until the hotel's live account is approved |
| `RESEND_API_KEY`, `EMAIL_FROM`, `HOTEL_NOTIFY_EMAIL` | Email to guests and the hotel |
| `CRON_SECRET` | The scheduled job that expires unpaid holds and settles late payments |
| `ALERT_WEBHOOK_URL` | Optional: alerts for payments needing attention |
| `RATE_LIMIT_SALT`, `VIEW_AS_SECRET` | Rate limiting; the owner's "view as front desk" |

## Checks

```bash
pnpm typecheck     # route types, then tsc
pnpm lint
pnpm test          # unit tests
pnpm test:db       # database tests (own local D1, separate from the dev site's)
pnpm test:e2e      # browser tests (needs pnpm dev; starts the integrations mock)
pnpm cf:build      # Cloudflare build + secret scan
pnpm cf:preview    # serve the Worker locally (workerd) on :3000
```
