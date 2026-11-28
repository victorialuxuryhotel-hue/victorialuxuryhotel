# Release review: security, roles and migrations 0012–0027

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

### What 0027 changes

`migrations/0027_self_check.sql`: a new table, `self_check_state`, used by the self-check in the scheduled job to remember
when each alert was last sent (at most once a day per problem) and when the daily checks last ran. Housekeeping only.
No existing rows change.

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

## Go-live record (26 Nov 2026)

- Time Travel bookmark before the migrations, 16:32 UTC: `000003d8-00000000-0000512f-76939b9dbf2eaf0541e7add39142c7f8`.
  To undo the migrations: `npx wrangler d1 time-travel restore victoria-hotel-db --bookmark=000003d8-00000000-0000512f-76939b9dbf2eaf0541e7add39142c7f8`
  (and redeploy the previous Worker version, `17869f3d-54ed-42e0-963b-e9e3ea8fd655`).
- Migrations 0012–0026 applied to the live database (checksums of 0012 and 0013 matched section 1). Bookings, payments and room types intact.
- Worker version `084478b4-9986-4fac-9af8-ac03e8be7b58` deployed at 100%. Secrets present, no `EMAIL_ALLOWLIST`, two-step on hold (no `TWO_STEP_ENFORCED`).
- Checks: `/api/health` ok; `/`, `/rooms`, `/book`, `/gallery`, `/about` 200; `/app` redirects to sign-in with the live Clerk key; new room rates showing.
- Hotel photos added to the live site (26 Nov, 17:3x UTC): 28 files in the R2 bucket under the app's own keys, and the matching rows (7 page photos, 12 gallery, 9 room type photos with one cover each) plus one activity entry. Worker version `bab7c30e-18c2-47a3-acb4-2bf5d1e2fee2` deployed with the fix that lets stored photos load on Cloudflare (they skip the image optimiser, which can't read R2).
- Still to do: delete the old Clerk secret key (it was exposed); remove the two secrets named after old keys; steps 5–6 below.

## 8. Cutover order (after you've reviewed all of the above)

1. Rotate keys and set the Cloudflare secrets (section 2).
2. Set up the Clerk production instance (section 3). Two-step sign-in stays on hold until you set `TWO_STEP_ENFORCED=1` (section 4); do that before go-live.
3. Record the Time Travel bookmark, then apply 0012 to 0027 (section 1).
4. Build (`pnpm cf:build`; it must report no secrets), upload, compare `wrangler versions view` secrets, remove `EMAIL_ALLOWLIST` if inherited, and deploy.
5. In the app: deactivate the 3 demo staff (they're linked to development Clerk users). Create the first owner with `scripts/create-owner.mts`. Sign in and set up the authenticator app. Then invite the real staff.
6. Remove the demo data from the live site: `npx wrangler d1 execute victoria-hotel-db --remote --file db/demo-live-undo.sql` (switches off the demo extras, the WELCOME10 promo code, demo menu and stock items, and clears the demo room descriptions). Check it first: it only switches things off, it deletes nothing.
7. Run the checks in `docs/deployment-cloudflare.md` → "Checks after each deploy".

## Release 2026-11-27: DevOps, guest website v3, finance access

- Includes: self-check alerts and heartbeat, robots on staging, migration 0027, and contributor PRs #4–#7
  (Windows test/build fixes, cron route kept out of the build, finance read-only booking page, guest website v3).
- Staging first: version `5a647cbc-dd5b-493a-899e-a9fc8cd50d51`, smoke test passed.
- Production database restore point (before 0027): `00000472-00000000-00005130-22d23cd14b6c082df2ad3730285741b5`.
- Previous live version: `bab7c30e-18c2-47a3-acb4-2bf5d1e2fee2`. New live version: `53359e80-7972-4d0d-90de-c1e3550feaf3`.
- Smoke test passed; photos, robots.txt and booking rates checked on the live site.

## Release 2026-11-27 (2): screen help by role

- Every staff page was opened as each of the seven roles: no errors, and no links to a page the role can't open.
  The only gap: Confirm payments, Stock and Daily closing showed finance and the general manager help for a job
  they have no button for. Fixed with a view-only version of that help (no database change).
- Staging `2639c2cf-9894-4f82-8280-c27b62f8375f`, smoke test passed.
- Previous live version: `53359e80-7972-4d0d-90de-c1e3550feaf3`. New live version: `e0129ea1-d506-4cb6-9564-7d011d86c194`. Smoke test passed.

## 0028_card_photos

- **What:** the home page's On site cards become Pool, Lounge, Restaurant and Club (client, 2026-11-27). Adds the
  Lounge and Club photo places; Pool, Lounge, Restaurant and Club hold up to 4 photos each (trigger
  `site_photos_card_limit`), shown split in one frame. Every other place still holds one.
- **How:** `site_photos` is rebuilt (SQLite can't change a CHECK) with every row copied; indexes and the two audit
  triggers are recreated as in 0004.
- **Existing rows:** unchanged. **Previous Worker:** keeps working; uploading to a card place replaces its photos with
  one, as before.

## Release 2026-11-27 (3): client website changes, GM without technical alerts

- Migration 0028 (On site card places). Restore point before it: `000004e2-00000002-00005130-3c21650b772d6ce409cf150a7493689f`.
- Data (by hand, after 0028): 6 photos copied to the Pool (2nd), Lounge (4) and Club (1) places; Standard and Deluxe
  bedroom photos swapped (covers kept); Apartment rate ₦230,000 → ₦280,000 (bookings already made keep their price).
- Staging `82cfe0ac-7f52-442a-8edf-cf400d1c28dc`. Previous live `e0129ea1-d506-4cb6-9564-7d011d86c194`,
  new live `5b426b23-7b33-4bb5-8e10-dde7cb30ad91`. Smoke test passed; home cards, room photos and rates checked live.

## Release 2026-11-27 (4): each role sees only what it acts on

- Dashboard *Anything wrong?* filtered per role (`AUDIENCE` in `self-check.ts`): finance gets money problems, owner and
  GM also the desk's; the data checks go only to the maintainer's alert channel. Two-step testing banner removed.
- No database change. Staging `24751070-47b4-46bd-b7ec-a10dbe609d2c`. Previous live `5b426b23-7b33-4bb5-8e10-dde7cb30ad91`,
  new live `7063df50-a51c-46fe-91dd-23c192dce6e5`. Smoke test passed.

## 0029_stations_pins

- **What:** staff sign-in by name and PIN on a shared station (FUNCTIONALITY.md section 1; agreement, Schedule A).
  New tables `stations`, `staff_sessions` and `pin_attempts`; `staff_profiles.pin_hash` and `pin_must_change`;
  `hotel_settings.idle_lock_till_minutes` (5) and `idle_lock_desk_minutes` (10).
- **Rules in the database:** deactivating someone ends their sessions; revoking a station ends every session on it;
  a station's token and type never change, a revoked station stays revoked, an ended session never restarts; none of
  these rows can be deleted.
- **Secrets:** `PIN_PEPPER` (random, set with `wrangler secret put PIN_PEPPER`) is mixed into every PIN hash. Set it
  before any PIN is created; changing it later makes every PIN invalid (the owner then resets them).
- **Existing rows:** unchanged; nobody has a PIN until the owner sets one. **Previous Worker:** unaffected.

## Step 1a: sign-in by name and PIN (S1, S2, S3)

- The owner or GM sets a computer up as a station in *This station* (desk, bar, restaurant or office). Their own
  Clerk sign-in on it then ends. Staff whose role fits the station tap their name and enter their PIN; the session
  carries their name on everything they do.
- Lock (button or idle: 5 minutes on tills, 10 at the desk) ends the session on the server and shows the name grid
  over the page, so an open order stays. The next person to sign in carries on with it under their own name.
- Only the owner sets or resets PINs (Staff & access → the person → PIN). The person chooses their own at their
  first sign-in. 5 wrong PINs lock that person on that station for 15 minutes; a station pauses after 15 wrong PINs
  in 15 minutes. Lockouts and revoked stations appear in the owner's and GM's *Anything wrong?*.
- Owner, GM and finance keep signing in with Clerk on their own devices; that idle lock is unchanged.
- New permissions (section 14): `pos.void.approve`, `refunds.request`, `stations.manage`, `paylinks.create`,
  `bills.manage`.

## 0030_payment_details

- **What:** payments at the desk and the till (FUNCTIONALITY.md sections 0 and 2). `payments` and `pos_orders` get
  `sender_name`, `slip_last4`, `terminal` and `seen_in_bank_app`; `hotel_settings` gets `bank_name`,
  `bank_account_number`, `bank_account_name` (empty = placeholders) and `terminals` (JSON list, default
  "Front desk terminal", "Bar terminal"). New table `payment_issues` for "declined but the guest was debited".
- **Rules in the database (new rows only):** a transfer needs the reference or the sender's name and the bank-app
  tick; POS needs 4 slip digits and a terminal (desk: `payments_complete_insert` replaced, `payments_pos_slip`
  dropped; till: `pos_orders_payment_reference` replaced). `payment_checks_not_own`: nobody confirms a payment they
  recorded (error `payment_check_own_payment`). A payment issue is closed once, never by its reporter, never deleted.
- **Changed on purpose:** a repeated desk transfer reference is no longer refused by the database; the screens warn
  and ask "Record anyway" (section 2, duplicate guard). Paystack references stay unique.
- **Existing rows:** unchanged. **Previous Worker:** a POS payment from the old screens has no slip column or
  terminal and would be refused, so deploy the Worker straight after the migration.

## Step 1b: payments at the desk (X4, X5) and the till (X6, X7)

- Cash, Transfer or POS / card. Transfer: reference or sender's name, the hotel's bank details (placeholders until
  set in Booking rules → Payment details), and "I've seen ₦X arrive in the hotel's bank app". POS: last 4 slip digits
  and the terminal. Every payment records who took it and gets a numbered receipt.
- **Part payments at the desk** (decided 28 Nov): any payment confirms an unpaid booking so the room isn't released
  with money taken; the rest shows as owed; check-in still needs it paid or a manager's override. Overpaying is
  blocked (cash: record what's owed and give change). A change waiting for payment is still paid in one go.
- "Declined but debited" records nothing and puts the item under Payments to confirm → *Check with the bank* for the
  GM and owner, who close it with the receipt of the payment once the money arrives, or with what the bank said.
- Payments to confirm: your own payment shows "another manager or the owner confirms it".
- Shared staff components restyled to design R1 (Inter, filled navy primary button, 60/44/36px sizes, badges,
  Segmented/Tabs/Chip/KPI tile, ₦ money field). The serif stays on the wordmark only.

## 0031_void_approval

- **What:** `pos_orders.void_approved_by`, `void_reason_code` (rung up wrongly, customer changed mind, item
  unavailable, other) and `void_cash_returned`. Trigger `pos_orders_void_approved`: a new void needs an active
  restaurant & bar manager, GM or owner who isn't the seller, a reason code, and for cash the cash-returned tick
  (error `void_needs_manager`). `pos_orders_payment_frozen`: 0030's payment details can't change once an order is
  paid. **Existing rows:** old voids unchanged. **Previous Worker:** its void (manager only, free-text reason) is
  refused by the new trigger, so deploy the Worker with the migration.

## Step 1c: void with a manager PIN at the counter (X9)

- Any salesperson can start a void from Orders & receipts → the sale → Void sale: reason, note, "cash returned".
  On a station a manager who didn't make the sale picks their name and enters their PIN there; that doesn't change who
  is signed in. Both names go in the log and on the order. Off a station the signed-in manager approves.
- 3 wrong manager PINs refuse the void; the manager sees it in a banner at their next sign-in, and the owner and GM
  in *Anything wrong?*. Stock comes back; the closing's expected cash drops (only paid sales count).

## 0032_front_desk

- **What:** `hotel_settings.walkin_hold_hours` (6); `guest_registrations` (one card per stay; `id_last4` is exactly 4
  letters or digits, never the full number); `reservations.left_owing_by/at/reason`; `refund_requests` (decided
  once, never by the requester, never deleted). Rule I3 (`reservations_paid_before_check_in_out`) is recreated with
  one exception: a check-out a manager leaves owing (same update). **Existing rows:** unchanged. **Previous
  Worker:** unaffected (it never sets the new columns).

## Step 1d: walk-in (X1), check-in with a registration card (X2), check-out (X3)

- **Walk-in** (Today → Walk-in): phone lookup (returning guests fill in), tonight's free room types and ready rooms,
  the registration card, then *Take ₦X and check in*: guest, booking, payment and receipt, room, check-in and card in
  one database write; if anything fails nothing is created, and a room taken by another desk at the same moment gets
  "Room 103 was just taken". *Save without paying* holds the room type for 6 hours (setting `walkin_hold_hours`).
  Phones are stored as +234…
- **Check-in** opens a drawer with the registration card (ID type, ID number, home address, coming from,
  nationality, purpose, house-rules tick), all required. Only the last 4 characters of the ID leave the screen and
  are stored; a returning guest's last card is offered. *Print registration card* prints an A5 card with a
  signature line. Still blocked while money is owed (existing rule I3).
- **Check-out** drawer: charges, paid, balance; *Key returned* (required); the room goes to cleaning; send the receipt
  by Print, Email (opens the staff member's mail app) or WhatsApp (a wa.me link; the server sends nothing). A balance
  must be paid, or a manager with override leaves it owing with a reason. A guest in credit gets *Ask for a refund*
  (limit: paid less the nights used); the GM or owner decides in Approvals (next step); nothing is paid at the desk.

## Step 1e: the till restyled (R2, R3) and the calculator (X8)

- Dark till bar: Victoria, Restaurant | Bar, business day, my sales, Orders, Close my day, who's signed in, Lock (gold,
  on a station). Open orders are a row of chips above the menu (a name tab shows amber); Find an item… with
  Calculator; categories are tabs; items are 4 to a row with price and stock left; best sellers come first on All.
- Order panel: lines, Total, *Table or name* is a dropdown (Bar counter, Table 1–12, Type a name…), then the one
  primary button *Take payment · ₦X* and *Keep order open*; *Cancel this order* (with a reason) when an open order is
  open. Payment (R3): *Take payment · Table 4*, the amount, ← Back to order, Cash | Transfer | POS / card, and
  *Confirm ₦X paid* with "Prints the receipt and opens the cash drawer".
- Calculator: + − × ÷ and C on screen only; it saves nothing and sends nothing (no eval; × and ÷ first).

## Step 1f (part 1): Today (R4) and the shared look

- Today: title, business day, *Find a booking*, Walk-in and the one primary *New booking*; chips for Overdue,
  Arriving, Leaving and To clean; groups with a count and Hide/Show (Overdue, Needs you now, Arriving today, Leaving
  today, In house); each row has initials, "Name · Room", what's happening and the next action. Right column: *Free
  tonight* per room type and *Rooms to clean* with the room numbers.
- Every staff screen picks up the R1 components from step 1b (Inter, filled primary buttons, badges, fields). The
  screen-by-screen layouts for R101–R109, R201–R205 and R301–R305 follow after go-live, most-used first.

## Release 2026-11-28: stations and PINs, payments, void approval, front desk, till and Today

- Migrations 0029–0032. Restore point before them: `00000505-00000000-00005131-ca96121db207b8096785ff354b1864d1`.
- Secret `PIN_PEPPER` set on staging and live (random, never displayed).
- Staging `cf271798-6c83-4f75-8d39-a6269d7ea85f`. Previous live `10fffa0a-3ad4-4fc4-91c9-7d3aed18569b` (the 27 Nov code
  `7063df50` plus the new secret), new live `88491cb0-fba2-423a-9a24-9edf21f2e092`. Smoke test passed on both; a forged
  station cookie is sent to sign-in.
- Rollback: `wrangler versions deploy 10fffa0a-3ad4-4fc4-91c9-7d3aed18569b@100%`. The migrations stay (forward-only);
  the old code ignores the new tables, but its POS payments and voids are refused by the new rules (see 0030/0031).

## 0033_step_two

- **What:** `refund_requests.source` (desk, no_show); `reservations.owing_decided_by/at`, `owing_decision` (agreed,
  chase), `owing_decision_note`; `stock_moves.supplier`, `cost_kobo`; `bills` and `bill_counter` (B-0001…);
  `pay_links` (random code, booking or bill, expiry). Bills and pay links can't be deleted or changed once issued
  (cancel and reissue). **Existing rows:** unchanged. **Previous Worker:** unaffected.

## Step 2: Approvals (X10)

- *Approvals* (GM and owner, `payments.approve`): Waiting · N | Approved | Declined. Refunds asked for at the desk,
  a no-show's unused nights (marking a no-show now puts everything after the first night forward), changes waiting
  for payment, and guests let go owing at check-out. *Review* opens the facts (paid, used, policy) with the amount,
  how it's paid back and a required reason.
- A refund can't be more than what was paid less what was used; the requester can't approve their own. Approving
  writes a refund payment; a refund by transfer appears under Payments to confirm for the other manager. Card bookings
  are refunded by transfer until Paystack refunds are built (step 3).

## Step 2: payment links (X14), the guest's pay page (M14), waiting for a transfer (G12)

- Booking page → *Send a payment link* (front desk and up, `paylinks.create`): makes `/pay/<random code>` for what's
  owed, with a ready message; *Send on WhatsApp* (wa.me), *Send by email* (the staff member's mail app), *Copy link*.
  The server sends nothing. A new link replaces the old one. It ends with the hold for an unpaid booking, after 3 days
  for a part-paid one, or as soon as the booking is paid.
- `/pay/<code>`: the booking, what's owed, the hold time, and *Pay ₦X* through Paystack (same verify and webhook flow).
  A guest without an email gives one first (Paystack needs it). Paid links go to the booking's confirmation.
- Part-paid bookings (a deposit at the desk) can now be paid online too.
- Waiting for your transfer: checks every 10 seconds; "You don't need to pay again"; *Send my booking to WhatsApp*.
- Never release a room with a payment in flight: a hold that ends while an online payment started in the last 2 hours
  is still pending gets 30 minutes more, once, and the booking says why (the desk sees it).
- Company bills (P3) can't be paid by link yet: they're paid at the desk (see the bill step).

## Step 2: company bills (P3)

- *Company bills* (front desk and up, `bills.manage`): choose unpaid bookings, the company, attention and valid-until
  (on or before the first arrival). Numbered B-0001…; lines per room type and extra; the bookings are held until the
  valid-until date, then released by the usual expiry (logged).
- The A4 bill shows bank details from settings (or "Ask the front desk for the account details" while they're empty),
  reference = the bill number, and "This is a bill, not a receipt". *Record payment* splits a payment across the
  bookings in order; each booking gets its own receipt. Bills can't be edited; cancel and make a new one.
- Not yet: paying a bill by online link (bills are paid by transfer or at the desk for now).

## Step 2: owner's phone dashboard (X13)

- *Owner's view* (`/app/owner`, owner only), laid out for a phone and view only: tonight's occupancy, money taken today
  (rooms, bar and restaurant, hall), bar and restaurant today, overdue guests and what they owe, *Anything wrong?*
  (payments to confirm, overdue guests, closings to check, guests in house owing, declined-but-debited, approvals
  waiting, PIN lockouts and revoked stations) and takings for the last 7 days by business date. Refreshes when opened.
