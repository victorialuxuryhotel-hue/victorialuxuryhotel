# Database

Cloudflare D1 (SQLite). The schema and the hard business rules live in
[`migrations/`](../migrations) and are the source of truth: rules that protect money
and bookings are database triggers, so they hold for every caller, including a bug
in the app. Words on screen follow [glossary.md](glossary.md); the names below are the
database's own (a *booking* is a row in `reservations`, a *room type* is a `room_categories` row).

Money is integer **kobo** everywhere. Stay dates are hotel-local `YYYY-MM-DD` strings
(Africa/Lagos). The restaurant & bar trading day runs 5am to 5am.

## Tables

| Area | Tables | Key rules |
| --- | --- | --- |
| Settings | `hotel_settings` | One row: check-in/out times, hold lengths, free-cancellation hours, late-cancellation fee %, VAT rate |
| Staff | `staff_profiles` | Linked to a Clerk user on first sign-in. Role is stored as role + department + manager flag (seven roles). Deactivate, never delete; at least one active owner |
| Rooms | `room_categories`, `rooms`, `room_category_images`, `site_photos` | Rate ≥ ₦40,000 a night; no deletes (deactivate); photo files live in R2 |
| Guests | `guests`, `guest_login_codes` | Email optional (walk-ins); one-time codes for guest sign-in |
| Bookings | `reservations`, `reservation_status_history`, `reservation_extras`, `extras`, `promo_codes`, `calendar` | See below |
| Payments | `payments`, `payment_events`, `receipt_counters`, `email_outbox` | Immutable once successful; corrections are separate linked rows |
| Hall | `hall_bookings`, `hall_payments` | No overlapping confirmed events; payments can't exceed the price |
| Restaurant & bar | `menu_items`, `menu_item_stock`, `pos_counters`, `pos_orders`, `pos_order_items`, `pos_closings` | Paid orders are frozen; voids by a manager with a reason; daily closing counts cash |
| Stock | `stock_items`, `stock_moves` | Moves are append-only and never take stock below zero |
| Audit | `activity_log` | Append-only for everyone |
| Other | `rate_limit_hits` | Website abuse limits |
| Retired | `sales`, `sale_items`, `expenses` | Kept from removed features (room charges, expense tracking); the app no longer writes to them. A clean-up migration should drop them and their triggers after go-live, once the live tables are confirmed empty |

## Rules that protect the business

- **No double-booked rooms** (`reservations_no_room_overlap_*`): one live booking per room per night. One guest can leave and the next arrive on the same day.
- **No overselling** (`reservations_capacity_*`): bookings per room type never exceed its rooms in service on any night.
- **Valid lifecycle only** (`reservations_guard_status`): awaiting payment → confirmed → checked in → checked out, plus cancelled, expired and no-show. A booking is confirmed only when paid in full.
- **Closed stays are frozen** (`reservations_guard_closed`), and in-house stays can only change their check-out date (`reservations_guard_in_house`).
- **Payments** get a sequential receipt number (`RCT-YYYY-NNNNNN`) and can't be edited or deleted; mistakes are fixed with a correction.
- **Two staff at once**: every important row has a `version`; a stale write is refused and retried or reported.
- **Audit**: staff, settings, rooms and photos changes are logged by trigger; the log can't be changed.

## Commands

```bash
pnpm db:fresh                          # local dev database: migrations + seed + demo data
pnpm db:migrate                        # local: apply new migrations
pnpm test:db                           # database tests on their own local D1 (.tmp/test-d1)
npx wrangler d1 migrations list victoria-hotel-db --remote    # what production is missing
```

Production migrations follow [release-review.md](release-review.md): record a Time Travel
bookmark first, then `pnpm db:migrate:remote`.

`db/seed.sql` and `db/demo.sql` are **local only**. `db/starter.sql` is the production
starting point (room types, rates, rooms). `db/demo-live.sql` put demo extras, a promo code,
room descriptions, menu and stock on the live site; `db/demo-live-undo.sql` removes them
before go-live.
