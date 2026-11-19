# Database

PostgreSQL 17 on Supabase. The schema, constraints, RLS policies and business
functions live in [`supabase/migrations/`](../supabase/migrations) and are the
source of truth. Regenerate TypeScript types after any migration with
`pnpm db:types`.

## Tables

| Table | Purpose | Key rules |
| --- | --- | --- |
| `hotel_settings` | Single row of configurable booking rules | Check-in/out times, website hold (min), direct-booking hold (h), cancellation policy text |
| `staff_profiles` | One row per staff member, keyed to `auth.users` | Role `owner \| general_manager \| front_desk`; deactivate, never delete; ≥ 1 active owner always |
| `room_categories` | What guests book: Standard, Deluxe, Suite, Apartment | Rate in kobo > 0; occupancy 1–20; deactivate instead of delete |
| `room_category_images` | Photos in the `room-images` storage bucket | One cover per category |
| `rooms` | Physical rooms staff assign | Unique room number; `service_status` (in service / maintenance); `readiness` (needs cleaning / cleaning / ready) |
| `guests` | Guest contact records | Email optional (walk-ins), unique case-insensitively when present |
| `reservations` | One stay in one category, optionally assigned a room | See below |
| `reservation_status_history` | Every status change, written by trigger | Who, when, optional reason |
| `payments` | Money against a reservation | Separate from reservations; immutable once successful |
| `payment_events` | Raw Paystack notifications | Deduplicated by payload hash |
| `activity_log` | Append-only audit trail | No update/delete for anyone |

## Relationships

```
staff_profiles ──┐ created_by / recorded_by / actor_id
                 ▼
guests ──< reservations >── room_categories ──< rooms
                 │   └──────────── room_id (optional) ──────┘
                 ├──< payments
                 └──< reservation_status_history
```

A guest books a **category**; staff assign a **room**. An assigned room counts
against its own category's inventory (so an upgrade consumes the right stock).

## Constraints that protect the business

- **No double-booked rooms.** Exclusion constraint `reservations_no_room_overlap`
  on `(room_id, daterange(check_in, check_out, '[)'))` for live statuses
  (pending payment, confirmed, checked in). `[)` lets one guest leave and the
  next arrive on the same day. Holds even under concurrent writes.
- **Valid lifecycle only.** Trigger `reservations_guard_status` rejects any
  transition not in `is_valid_reservation_transition()` for every caller,
  including privileged server code. New reservations start as
  `pending_payment` or `confirmed`.
- **Price integrity.** `total_amount_kobo = nightly_rate_kobo × nights`;
  NGN only; rate is a snapshot, so later rate changes don't alter bookings.
- **Room before check-in.** `checked_in` / `checked_out` require `room_id`.
- **Closed stays are frozen.** Dates, room, category, amount and guest count
  can't change once checked out, cancelled, expired or no-show.
- **Payments.** Successful payments need `verified_at` and `paid_at`, get a
  sequential receipt number (`RCT-YYYY-NNNNNN`) and become immutable. Offline
  payments must name the staff member who recorded them. Provider references
  are unique per provider.
- **Audit log is append-only**, enforced by trigger.

Money is integer **kobo** everywhere. Stay dates are hotel-local `DATE`s;
`hotel_today()` gives "today" in Africa/Lagos.

## Migrations

```bash
pnpm db:reset        # local: rebuild from migrations + dev seed
pnpm db:seed-staff   # local: owner / gm / front desk accounts
pnpm db:types        # regenerate src/lib/supabase/database.types.ts
supabase db push     # production: apply new migrations (see deployment docs)
```

`supabase/seed.sql` is **local development only**: placeholder categories, rates
and a 29-room split invented for testing. Production data is entered by staff.

## Tests

- `tests/db/schema.test.ts`: constraints, lifecycle, payments, audit (superuser SQL).
- `tests/db/access.test.ts`: RLS and grants through the real API as each caller.

Both suites have been mutation-checked: disabling a safeguard makes the tests
guarding it fail.
