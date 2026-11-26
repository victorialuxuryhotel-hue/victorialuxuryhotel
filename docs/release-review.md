# Release review: security, roles and migrations 0012–0026

Nothing on this page has been run against production. Each step needs your review first. Run the steps in this order.

## 1. Database migrations 0012 and 0013

The live database is at migration 0011. Two migrations are waiting:

| File | SHA-256 |
|---|---|
| `migrations/0012_restaurant_bar.sql` | `b3533ce608f164767fb7da34c2a8999a7d1e591d56d11c2f35dc834ac5efdbe7` |
| `migrations/0013_room_change_and_24h_cancellation.sql` | `468c0ae10aaa05f82ed9acb4d7c943310e0e838bb2a99f7bd4a09993dad495a5` |

Check the files you review are the ones that will run: `shasum -a 256 migrations/0012_*.sql migrations/0013_*.sql`.

### What 0012 changes

| Statement | Effect on existing data |
|---|---|
| `ALTER TABLE staff_profiles ADD COLUMN department_lead` (default 0) and 3 triggers | Adds a column. Existing staff get 0 (not a manager). No rows changed. |
| `ALTER TABLE menu_items ADD COLUMN category`, `is_available` | Adds columns. Then 3 `UPDATE`s set the category: restaurant items become meals; bar items become alcoholic or soft drinks by name. Names and prices are not touched. |
| `CREATE TABLE menu_item_stock` | New, empty. |
| `ALTER TABLE stock_items ADD COLUMN category` | Adds a column (default "other"). Quantities are not touched. |
| `CREATE TABLE pos_counters`, `pos_orders`, `pos_order_items`, `pos_closings` and their triggers | New tables. Only `pos_counters` gets 2 starting rows. |
| Rebuild of `stock_moves`: create `stock_moves_v2`, copy every row, drop the old table, rename, recreate the index and triggers | All rows are copied with the same ids, values and dates. The trigger that adjusts stock is created **after** the copy, so quantities are not applied twice. New rules: kinds can also be wasted, sold or returned, and sold/returned rows are linked to an order. The no-edit and no-delete rules stay. |
| Rebuild of `expenses`: same pattern | All rows are copied. The department `restaurant_bar` becomes `restaurant`. The void-only and no-delete rules stay, and editing the department is now refused too. The expense screens are removed from the app; the table is kept as agreed. |

### What 0013 changes

| Statement | Effect on existing data |
|---|---|
| `ALTER TABLE reservations ADD COLUMN room_change_kobo` (default 0) | Adds a column. Existing bookings get 0, so their totals don't change. |
| `UPDATE hotel_settings SET free_cancel_hours = 24` | Changes one setting from its current value to 24. This can be changed afterwards in Booking rules. |
| Recreate the 3 staff manager triggers | Allows the Hotel Manager role (a front-desk record marked as manager). No rows changed. |

### What 0014 changes (added 25 Nov, after the QA pass)

`migrations/0014_occupied_until_checked_out.sql`

| Statement | Effect on existing data |
|---|---|
| Recreate `reservations_no_room_overlap_insert/update` | A checked-in guest now holds their room until they are checked out, even after their check-out date. No rows changed. |
| Recreate `reservations_capacity_insert/update` | The same guest also counts against their room type, so the website can't sell it again. No rows changed. |

These are rules checked on new writes only. If the live data already has two live bookings in one room
(an overstayer plus a new arrival), nothing fails on migration: the front desk sees the clash on the room
board and must move one of them. Check first:

```sql
SELECT a.reference, b.reference, a.room_id FROM reservations a JOIN reservations b
  ON a.room_id = b.room_id AND a.id < b.id
 WHERE a.status = 'checked_in' AND b.status IN ('confirmed', 'pending_payment', 'checked_in')
   AND b.check_in < max(a.check_out, date('now', '+1 hour', '+1 day'));
```

### What 0015 changes (the invariants in docs/rules-and-edge-cases.md, section 3)

`migrations/0015_invariants.sql`. Every statement is a new rule on new writes, plus one new empty column. No existing rows are changed.

| Rule | Statement | Effect on existing data |
|---|---|---|
| I3 | `reservations_paid_before_check_in_out` | Check-in and check-out are refused by the database while money is owed (the app already refused). None. |
| I4 | `reservations_no_room_before_payment_insert/update` | A booking awaiting payment can't be given a room; payment assigns one. Unpaid bookings that already hold a room keep it. |
| I7 | `payments_complete_insert/update`, `hall_payments_transfer_reference` | A successful payment needs its method and the staff member (desk) or verification (online); a bank transfer needs its reference or the sender's name. None. |
| I9 | `hall_bookings_confirmed_paid_insert/update` | A hall booking becomes confirmed only when it has a price and is paid in full (the app now confirms it automatically on the last payment). Existing confirmed bookings stay confirmed. |
| I10 | `ALTER TABLE pos_orders ADD COLUMN transfer_reference`, `pos_orders_transfer_reference` | Adds an empty column. A transfer at the till needs a reference. Past orders are not touched. |
| I13 | `sales_retired` | Nothing may write to the retired `sales` table (charge to room). The app hasn't written to it since 0012. |

Read-only checks to run first. Each lists rows that already break a rule, so staff can resolve them after go-live (the rule only stops new ones):

```sql
-- I3: checked in or out with money owed
SELECT reference, status FROM reservations r WHERE status IN ('checked_in', 'checked_out')
  AND (SELECT coalesce(sum(CASE WHEN kind = 'payment' THEN amount_kobo ELSE -amount_kobo END), 0) FROM payments
       WHERE reservation_id = r.id AND status = 'successful') < total_amount_kobo + extras_kobo + room_change_kobo - discount_kobo;
-- I4: awaiting payment with a room
SELECT reference FROM reservations WHERE status = 'pending_payment' AND room_id IS NOT NULL;
-- I9: hall bookings confirmed but not paid in full
SELECT id, title FROM hall_bookings h WHERE status = 'confirmed'
  AND (price_kobo = 0 OR (SELECT coalesce(sum(amount_kobo), 0) FROM hall_payments WHERE booking_id = h.id) < price_kobo);
-- I13: anything in the retired sales table
SELECT count(*) FROM sales;
```

### What 0016 changes

`migrations/0016_check_in_any_time.sql`: `UPDATE hotel_settings SET check_in_time = '00:00'`. One setting.
00:00 means "check in any time on the arrival day" (decided 25 Nov). The free-cancellation window
then counts back from midnight starting the arrival day, and the website, emails and calendar file
say "any time". Check-out stays by 12:00. The hotel can change either time in Booking rules.

### What 0017 changes

`migrations/0017_pending_changes.sql`: a new table, `reservation_changes`, and its rules. No existing rows change.
A room upgrade or move, or extra nights, that costs more on a paid booking is stored here with its price and only
takes effect when that payment is taken (in the same step). Rows are never deleted; each is decided once (applied
or cancelled); applying one before payment needs the General Manager or Owner and a reason.

### What 0018 changes

`migrations/0018_vat_on_receipts.sql`: adds `hotel_settings.vat_on_receipts` (default 0, off). The rate is kept (7.5%).

### What 0019 changes

`migrations/0019_tax_id.sql`: adds `hotel_settings.tax_id` (empty) and a rule that VAT can't be switched on without it.
Receipts and bills print "TIN …" with the VAT line. **VAT stays off until Tobi confirms the hotel's TIN:**
then enter it in Booking rules and tick "Show VAT on receipts and reports".

### What 0020 changes

`migrations/0020_payment_references.sql` (hardware brief H1, H2). No existing rows change.

| Statement | Effect |
|---|---|
| `ALTER TABLE pos_orders RENAME COLUMN transfer_reference TO payment_reference` | Same data, a name that fits transfers and POS slips. |
| `pos_orders_payment_reference` (replaces `pos_orders_transfer_reference`) | I15: a bar sale by POS/card needs the last 4 digits of the slip; a transfer still needs its reference. |
| `payments_pos_slip` | I16: a desk payment by POS/card needs the slip's last 4 digits (new payments only). |
| Recreate `payments_provider_reference_key` without POS slips | A repeated transfer reference is still refused; POS slips (4 digits) may repeat between genuine payments. Paystack references stay unique. |

### What 0021 changes

`migrations/0021_payment_checks.sql`: a new append-only table, `payment_checks` (interface brief I1). The General
Manager or Owner marks each transfer and POS payment Matches or Not found against the bank statement or terminal
report; one check per payment, never changed or deleted, "Not found" needs a note. Payments are not changed.
No existing rows change. Every existing transfer and POS payment starts in the "to confirm" list.

### What 0022 changes

`migrations/0022_tonight_business_date.sql`: recreates the two room-type capacity triggers
(`reservations_capacity_insert` / `_update`) with one difference. They check nights from the business date
(Lagos time less the 06:00 cut-off) instead of the calendar date. Before 06:00, last night can still be
booked (decision of 25 Nov: a 2am walk-in books and pays for the night they arrive in), and the
database now guards that night's stock too. Between 06:00 and midnight nothing changes. No rows change.

### What 0023 changes

`migrations/0023_no_minimum_rate.sql`: drops the ₦40,000 minimum room rate (the two triggers from 0007).
A room type costs exactly what the hotel sets; the rate must still be above zero. Bookings keep their
agreed rate. No rows change.

### What 0024 changes

`migrations/0024_preferred_room.sql`: a new nullable column, `reservations.preferred_room_id`, the room asked for
when a booking is started from an empty night on the room calendar. Rooms are still assigned on payment (rule I4);
payment gives this room if it's still free, otherwise the usual choice. A trigger refuses a room of another type.
No existing rows change.

### What 0025 changes

`migrations/0025_till_notes_and_rounds.sql`: two new nullable columns. `pos_order_items.note` (up to 60 characters,
"No ice") and `pos_orders.last_round` (JSON: the lines added at the order's latest save, for the till's "Same
again"). Neither changes an amount; prices come from the menu at the time. No existing rows change.

### What 0026 changes

`migrations/0026_first_day.sql`: a new table, `staff_first_day`, for the "Your first day" ticks on the account page
(one row per staff member and job). No money or bookings involved. No existing rows change.

### Proof that data is kept

On 24 Nov 2026 a read-only export of the live database was loaded into a local SQLite copy. Both migrations were applied to it with foreign keys on, matching D1. Before and after:

- Row counts were the same for every existing table, including activity_log (166), reservations, payments, guests, staff_profiles, rooms, menu_items, stock_items and stock_moves (8). The only new rows are the 2 in `pos_counters`.
- Stock quantities were the same for every item.
- Every stock movement had the same id, item, change, kind, note, staff and date.
- `PRAGMA foreign_key_check` found no problems, and `PRAGMA integrity_check` returned "ok".
- The 176 database tests pass against these migrations.

### Recovery

D1 Time Travel can restore the database to any minute in the last 30 days.

1. Immediately before applying, record the restore point:
   ```
   npx wrangler d1 time-travel info victoria-hotel-db
   ```
   Write the bookmark down (it's also kept in `backups/README.txt`). The bookmark on 24 Nov 2026 at review time was `00000223-00000002-0000512d-39fdbba2dc4eab7037b6d0e7ee21f981`. Take a fresh one on the day.
2. Apply:
   ```
   npx wrangler d1 migrations apply victoria-hotel-db --remote
   ```
3. Check: `npx wrangler d1 migrations list victoria-hotel-db --remote` should show nothing left to apply.
4. If anything is wrong, restore:
   ```
   npx wrangler d1 time-travel restore victoria-hotel-db --bookmark=<the bookmark from step 1>
   ```
   This puts the whole database back to that moment. Anything written after it (bookings, payments) is lost, so restore quickly, or note what came in after the bookmark first. The Worker still running the old version keeps working with the restored database.

Order: apply the migrations **before** deploying the new app version, because the new version needs them. The current live version keeps working on the migrated database, with one exception: recording an expense for "Restaurant & bar" would be refused, because that department is now split. There are 0 expenses on the live site. Deploy straight after migrating so the gap is short.

## 2. Secrets

### What changed in the code

- The build now removes all secrets from the Worker. OpenNext used to copy every `.env` value into it, including the Clerk, Resend and Paystack secret keys. `pnpm cf:build` now strips them and scans the Worker and browser files. If any secret value or key pattern is found, the build fails. The browser files contain only `NEXT_PUBLIC_*` values.
- So in production, these must be **Cloudflare secrets**, or the site loses them on the next deploy:
  `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `PAYSTACK_SECRET_KEY`, `CRON_SECRET`, `VIEW_AS_SECRET`, `RATE_LIMIT_SALT`, `ALERT_WEBHOOK_URL` (if used).
  The Worker already has `CRON_SECRET`, `PAYSTACK_SECRET_KEY`, `RATE_LIMIT_SALT` and `VIEW_AS_SECRET`. **`CLERK_SECRET_KEY`, `RESEND_API_KEY` and `ALERT_WEBHOOK_URL` are new.**

### Rotation (in your own terminal; never paste keys into chat)

1. **Clerk:** in the production instance, go to API keys and create a new secret key, then run `npx wrangler secret put CLERK_SECRET_KEY`. Revoke the old development secret key in the development instance.
2. **Resend:** go to API Keys, create a key with sending access only, and run `npx wrangler secret put RESEND_API_KEY`. Delete the old key.
3. **Paystack (test):** go to Settings → API Keys & Webhooks and generate new test keys, then run `npx wrangler secret put PAYSTACK_SECRET_KEY`. The live key waits for your approval.
4. **Alerts webhook (if used):** run `npx wrangler secret put ALERT_WEBHOOK_URL`.
5. Put the new development keys in `.env.local` for local work only.
6. Check: `npx wrangler secret list` shows the names (never the values).

## 3. Clerk production settings

In the **production** instance for victorialuxuryhotel.com:

1. **Sign-up:** restricted (invitation only). **Password:** at least 10 characters.
2. **Multi-factor:** turn on **Authenticator application** and **Backup codes**. Leave SMS off.
3. **Sessions → Customize session token:** add
   ```json
   { "totp": "{{user.totp_enabled}}" }
   ```
   With this, the app checks two-step sign-in without calling Clerk on every page. Without it, the app still works, but it asks Clerk on every request for these four roles. If Clerk won't accept this line, skip this step.
4. Use the production publishable key in `.env.production.local` as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. This is a public value and is built into the pages.

## 4. Two-step sign-in (Owner, General Manager, Hotel Manager, Finance)

- After the password, these roles must enter a code from an authenticator app. A backup code works if the phone is lost.
- Until they set one up, every page and action sends them to **Two-step sign-in**. The page walks them through adding the app. If they added the app but this session didn't use it, it asks them to sign in again.
- Front desk and restaurant & bar staff are not affected.
- **On hold for testing (decided by Tobi, 25 Nov).** It is enforced only when the Worker has `TWO_STEP_ENFORCED=1` (a plain variable, not a secret). Until then these roles sign in with a password, can still add an app under Manage sign-in, and the owner and general manager see a reminder on the Dashboard.
- **Before go-live:** turn on authenticator apps and backup codes in the Clerk production instance (section 3), then set `TWO_STEP_ENFORCED=1` in the Cloudflare dashboard (or `wrangler.jsonc` vars) and deploy. Check: the reminder is gone and a finance account is asked for its code.
- On a developer's own machine, `TWO_STEP_OPTIONAL=1` (localhost site URL only) still skips it.

## 5. Removing a staff member's access

- **Remove access** sets the account inactive. Every page and every action checks that on each request, so the next click is refused, even in a browser that's already signed in. The same step bans the user in Clerk, which ends all their Clerk sessions.
- If they never signed in, their invitation is cancelled instead.
- **Restore access** lifts the ban. For someone who never signed in, use **Send the invitation again** (the old link stops working).
- Role changes take effect on their next click.

## 6. Roles: what changed

- **Hotel Manager** (new): runs the hotel side. That covers bookings, rooms, rates, room types, booking rules, hall bookings, holding a room longer, and hotel-only reports and activity. Their reports show room income only. They can't see restaurant & bar sales, other departments' income, or staff management.
- **Corrections, refunds and free upgrades:** only the General Manager or the Owner.
- **Finance:** read-only. They can view, filter and download, but can't record, correct, cancel, hold or resolve anything. Action buttons are hidden from them, and the server refuses the actions anyway.
- **No manager can confirm a booking without full payment.** The leftover "Confirm anyway" buttons are gone.

## 7. Waiting for the hotel's confirmation

These are deliberately **not final** in the app:

- **No-show:** the booking closes and the room is released. The payment is neither kept nor refunded automatically; the booking is flagged for the General Manager to decide. The guest-facing policy no longer says a no-show forfeits the booking.
- **Late cancellation:** the 24-hour window is a setting (Booking rules). The share charged inside the window (`late_cancel_fee_pct`) is also a setting. Any refund is flagged for the General Manager, never paid automatically. Confirm the percentage with management before treating it as final.

## 8. Cutover order (after you've reviewed all of the above)

1. Rotate keys and set the Cloudflare secrets (section 2).
2. Set up the Clerk production instance (section 3). Two-step sign-in stays on hold until you set `TWO_STEP_ENFORCED=1` (section 4); do that before go-live.
3. Record the Time Travel bookmark, then apply 0012 to 0026 (section 1).
4. Build (`pnpm cf:build`; it must report no secrets), upload, compare `wrangler versions view` secrets, remove `EMAIL_ALLOWLIST` if inherited, and deploy.
5. In the app: deactivate the 3 demo staff (they're linked to development Clerk users). Create the first owner with `scripts/create-owner.mts`. Sign in and set up the authenticator app. Then invite the real staff.
6. Remove the demo data from the live site: `npx wrangler d1 execute victoria-hotel-db --remote --file db/demo-live-undo.sql` (switches off the demo extras, the WELCOME10 promo code, demo menu and stock items, and clears the demo room descriptions). Check it first: it only switches things off, it deletes nothing.
7. Run the checks in `docs/deployment-cloudflare.md` → "Checks after each deploy".
