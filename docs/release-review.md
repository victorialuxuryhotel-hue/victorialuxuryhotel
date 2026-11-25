# Release review: security, roles and migrations 0012–0013

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
- It can be switched off only on a developer's own machine (`TWO_STEP_OPTIONAL=1` with a localhost site URL). It can't be switched off on the live site.

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
2. Set up the Clerk production instance (section 3).
3. Record the Time Travel bookmark, then apply 0012, 0013 and 0014 (section 1).
4. Build (`pnpm cf:build`; it must report no secrets), upload, compare `wrangler versions view` secrets, remove `EMAIL_ALLOWLIST` if inherited, and deploy.
5. In the app: deactivate the 3 demo staff (they're linked to development Clerk users). Create the first owner with `scripts/create-owner.mts`. Sign in and set up the authenticator app. Then invite the real staff.
6. Remove the demo data from the live site: `npx wrangler d1 execute victoria-hotel-db --remote --file db/demo-live-undo.sql` (switches off the demo extras, the WELCOME10 promo code, demo menu and stock items, and clears the demo room descriptions). Check it first: it only switches things off, it deletes nothing.
7. Run the checks in `docs/deployment-cloudflare.md` → "Checks after each deploy".
