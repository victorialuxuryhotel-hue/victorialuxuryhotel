# Staff access and security

## Roles

| Capability | Front desk | General manager | Owner |
| --- | :-: | :-: | :-: |
| Reservations: create, assign rooms, check in/out, cancel | ✓ | ✓ | ✓ |
| Guests: view and update | ✓ | ✓ | ✓ |
| Record offline payments (after confirming receipt) | ✓ | ✓ | ✓ |
| Room readiness and maintenance status | ✓ | ✓ | ✓ |
| Override payment requirement / extend a hold (reason required, audited) | | ✓ | ✓ |
| Room configuration, categories, rates, photos | | ✓ | ✓ |
| Booking rules (hold times, check-in/out, cancellation policy) | | ✓ | ✓ |
| Revenue summaries, activity log | | ✓ | ✓ |
| Invite staff, change roles, deactivate | | | ✓ |

Defined in [`src/lib/auth/permissions.ts`](../src/lib/auth/permissions.ts) and
enforced in the database. Future departments add a role and a row; nothing else
changes.

## Layers of enforcement

1. **Database (authoritative).** RLS on every table; anon can only read active
   categories, their images and settings. Staff may *read* operational data but
   can only *write* reservations and payments through business functions that
   validate, re-check roles and audit. Activity log and payment events are
   manager-read-only.
2. **Server.** Every page calls `requireStaff()`; every server action calls
   `authorize(permission)`. Both check the account is still **active** staff on
   each request, so deactivation takes effect immediately.
3. **Proxy.** Refreshes the session cookie and redirects signed-out visitors
   from `/app`. A convenience, not a security boundary.
4. **UI.** Hides what a role can't use. Never relied on.

## Accounts

- Public sign-up is **disabled**. Staff accounts are created by the owner from
  Settings → Staff (invite email → set password), or by
  `scripts/create-staff.mts` for the first owner.
- Minimum password length 10. Invite and reset links are single-use and are
  verified server-side (`/auth/confirm`).
- Sign-in gives the same message for unknown email and wrong password.
- Post-sign-in redirects only go to `/app/…` (no open redirects).
- The service-role key is used only by: staff invites (after owner check), the
  Paystack webhook (after signature check), the public booking flow (narrow
  database functions) and scheduled jobs (`CRON_SECRET`).

## Tests

- `pnpm test:db`: `tests/db/access.test.ts` (28 checks via the real API as
  anon, non-staff, deactivated staff, front desk, GM and owner).
- `pnpm test:e2e`: real-browser sign-in, role navigation, direct-URL denial,
  mid-session deactivation, open-redirect attempt, sign-out, and the full
  invite → set password → sign in flow. Requires `pnpm dev` running.
