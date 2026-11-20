# Progress

Last updated 18 Nov 2026 (photos and public room pages). "Verified" means covered by automated tests that pass,
and for database safeguards, mutation-checked (removing the safeguard makes its
tests fail).

| Phase | Status | Verification |
| --- | --- | --- |
| 1 Foundation | Done | typecheck, lint, production build |
| 2 Design system and all screens | Done | Every screen designed; desktop + phone screenshots, no horizontal overflow; preview at `/preview` (404 in production) |
| 3 Database and domain model | Done | `tests/db/schema.test.ts`, mutation-checked |
| 4 Authentication, RLS, roles | Done | `tests/db/access.test.ts` (API as each role), mutation-checked; browser: sign-in, roles, deactivation, invites |
| 5 Room management | Done | Room board, readiness, maintenance, categories, rates, add rooms; DB + browser tests |
| 6 Reservation engine | Done | Availability, holds, concurrency (12 requests → 3 rooms), assignment, upgrades, check-in/out, cancel, no-show, override, expiry; mutation-checked |
| 8 Guest & reservation management | Done (core) | Lists, search, filters, detail, guest profiles and edits |
| 9 Front desk | Done (core) | Arrivals, departures, in house, room board actions; browser-tested end to end |
| 10 Dashboard | Done (basic) | Operational counts; revenue split into received / booked value / outstanding |
| 12 Public website | Done (pending the hotel's photos and wording) | Room types, rates, amenities and photos come from the database; a page per room type; all photos managed by staff; booking end to end |
| 7 Payments (Paystack, offline, receipts) | Done (test mode, mocked) | 21 DB tests (mutation-checked) + 33 browser checks: success, failed, abandoned, duplicate/forged/lost webhooks, tampered amount, late payment, offline, receipts. **Real Paystack test keys not yet used** |
| 11 Audit | Done (core) | Every business action and configuration change logged; append-only |
| 13 Email (Resend) | Done (mocked) | Confirmation, payment received, cancellation; sent exactly once; real Resend key not yet used |
| 14 Future departments doc | Not started | |
| 15 QA | Ongoing | 10 unit, 111 database, 91 browser checks |
| 16 Deployment | Ready for Cloudflare | OpenNext build; full browser suite passes against the local Workers runtime; steps in docs/deployment-cloudflare.md. Not yet deployed |

## Known gaps

- Database and browser tests share the local database with the dev site and
  leave test records behind. Run `pnpm db:fresh` (and restart `pnpm dev` to
  clear its page cache) to get back to the clean demo data. A separate test
  database would remove this.

- Refunds are flagged for staff, not processed in the app (policy pending).
- Dev-mode only: Next's instant-navigation validator logs a redirect warning
  for `/app` when signed out. Production behaviour is correct.

## Waiting on the hotel

Room rates and the split of rooms across categories, cancellation policy
wording (24–48 h window), photography (see
[photography-brief.md](photography-brief.md)), original logo file, Paystack
account verification, domain.
