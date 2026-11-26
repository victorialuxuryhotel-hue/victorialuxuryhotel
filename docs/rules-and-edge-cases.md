# Rules and edge cases — the operating contract of the system

**Status:** draft 1, 25 Nov 2026. Owner: Tobi. Read with `docs/fix-brief-2026-11-25.md` and `docs/ux-brief-2026-11-25.md`.

This is the source of truth for how the system behaves. Every rule here is enforced in the **database or the domain layer**, never only on a screen, and every rule and edge case has a test. When a screen and this document disagree, this document wins; when this document and the hotel's real practice disagree, ask Tobi and update this document first.

Legend: **[exists]** already enforced · **[new]** to build · **[decide]** needs a decision from Tobi/the hotel (default given; build the default).

---

## 1. Principles

1. **Status comes from recorded events, never from dates.** A date passing changes nothing by itself; it creates a job on someone's work list.
2. **Money first.** Nothing is given (room, key, extension, upgrade, hall, drink) until it is paid in full. Nobody owes money at any point the hotel controls.
3. **Money is append-only.** Payments, refunds, closings, sales and activity are never edited or deleted. Mistakes are fixed with a new correcting entry that references the original, with a reason and the person.
4. **Every move has an owner.** Each state change records who, when, and (for anything unusual) why.
5. **Impossible states are impossible.** If a state must never exist, a DB constraint or trigger rejects it. The UI just explains the rejection in plain words.
6. **The system checks itself.** A scheduled job looks for rule breaks and alerts; it never silently "fixes" money.
7. **One business day per closing.** The hotel's business day runs 06:00 → 05:59 Africa/Lagos **[default built: 06:00, in src/config/policy.ts]**. All "today", closings and reports use the business day, and screens say so.

---

## 2. States and allowed moves

Anything not listed is rejected by the database.

### 2.1 Booking (`reservations.status`)

| From | To | Who | Conditions |
|---|---|---|---|
| (new) | pending_payment | guest (website), front desk | hold_expires_at set **[exists]**; website holds rate-limited **[exists]** |
| pending_payment | confirmed | system on verified payment | paid in full (successful payments ≥ total) **[exists via payment]**; room auto-assigned **[exists]** |
| pending_payment | expired | system (cron) | hold passed and no successful payment **[exists]** |
| pending_payment | cancelled | front desk, guest | — |
| expired | confirmed | system | a payment that started before expiry succeeds late; room must still be free, else flag "Paid but no room" **[new: flag + alert]** |
| confirmed | checked_in | front desk | balance = 0 **[exists]**; room assigned, room `ready` and not occupied **[new: ready + not occupied]**; check-in date ≤ today **[new]** |
| confirmed | no_show | front desk / manager | check-in date < today **[new]**; refund decision per policy, approved by GM/Owner **[exists: GM decides]** |
| confirmed | cancelled | front desk, guest | cancellation policy applied; refund recorded as a refund request **[exists]** |
| checked_in | checked_out | front desk | balance = 0 **[exists]**; sets room `needs_cleaning` **[new if missing]** |
| undo (within the undo window, reason "Undone") | checked_in→confirmed, checked_out→checked_in, no_show→confirmed | same person | **[exists]** |

Rules on a booking **[new unless marked]**:
- A room may be assigned or changed only when status is `confirmed` or `checked_in`. Not `pending_payment`. **[exists — 0015; staff no longer pick a room when creating a booking]**
- Any change that increases the total (extra night, upgrade, extra guest, extra) on a `confirmed` or `checked_in` booking does **not** take effect until paid: it is created as a pending change with its own price; payment applies it. **[exists — 0017 for room moves/upgrades and extra nights; GM/Owner can apply one before payment with a reason, and the guest pays before check-out]**
- Any change that decreases the total creates a refund request for GM/Owner approval; it never silently reduces "paid".
- `checked_in` bookings: dates/category frozen **[exists: in_house_frozen]** except via the paid change above.

### 2.2 Room occupancy (derived, not stored)

A room is **occupied** if and only if there is a booking in `checked_in` with that room. Dates do not matter. **[new; migration 0014 started]**

Room board status, in priority order:
1. **Out of order** — `service_status = maintenance`
2. **Occupied** — has a checked-in booking (sub-label "Due out" if check-out ≤ today, "Overdue" if < today)
3. **To clean** — `readiness` = needs_cleaning / cleaning_in_progress
4. **Arriving** — a confirmed booking assigned to it with check-in = today
5. **Ready**

Room moves: `ready → needs_cleaning` (automatic on check-out, or staff) · `needs_cleaning → cleaning_in_progress → ready` (staff) · any → maintenance (manager, with reason) · maintenance → needs_cleaning (manager). A room in maintenance or occupied can't be assigned to a new arrival. A room put into maintenance while occupied asks for the guest to be moved (room change, no charge, manager reason).

### 2.3 Payment (`payments`)

| From | To | Who/what |
|---|---|---|
| (new) pending | successful | Paystack verified server-side (webhook or callback, idempotent on reference) **[exists]**; desk payment confirmed by staff with method, reference (transfer: required **[exists — 0015]**) and the "money is in the account" tick **[exists for desk]** |
| pending | failed / abandoned | Paystack verify / timeout **[exists]** |
| successful | — | final. Never changed **[exists: payments_guard_final]**. Corrections are new entries **[exists: payments_correction_shape]** |

Refund: a `kind = refund` entry created only after GM/Owner approval of a refund request; the actual payout happens outside (Paystack dashboard / bank) and its outcome (reference, date) is recorded **[exists in part — verify the full flow]**.

### 2.4 Hall booking

`enquiry → confirmed` only when paid in full **[exists — 0015; confirmed automatically by the payment that completes it]** · `enquiry → cancelled` · `confirmed → cancelled` (refund request) · no overlap of confirmed bookings **[exists]**; enquiries may overlap but show a warning **[new]**.

### 2.5 Bar/restaurant order (`pos_orders`)

`open → paid` (method + for transfer a reference and confirmed tick **[exists — 0015]**) · `open → cancelled` (reason required, visible to the manager in Sales reports **[exists]**) · `paid → void` (manager only, reason ≥ 3 chars **[exists]**, stock returned **[verify]**). Items editable only while open **[exists]**. Prices are captured on the line at the time of adding **[verify]**; later menu price changes don't alter open orders' existing lines.

Legacy: the old `sales` table from 0009 still allows `status = 'room_charge'` and has a `sales_room_charge_in_house` trigger. **Charge-to-room is out of scope.** Nothing writes to `sales` any more; inserts are blocked by a trigger and the leftover error mappings are removed **[exists — 0015]**.

### 2.6 Closing (bar now; front desk **[new]**)

`(none) → counted` (blind: expected amount not shown until submitted, and the first count is final **[exists]**; over/short ≠ 0 requires a reason **[exists]**) → `verified` by manager **[exists: pos_closings_only_verify]**. Closings are never deleted or edited **[exists]**. One closing per person per business day per counter **[verify]**. Sales after a person's closing for that day go to a new closing, not the old one **[verify]**.

### 2.7 Staff access

Invite → active → removed. Removing access ends sessions immediately **[verify]**. There must always be at least one owner **[exists]**. Two-step sign-in for owner, GM, hotel manager, finance **[exists; on hold for testing until TWO_STEP_ENFORCED=1, to be set before go-live — Tobi, 25 Nov]**. Owner phone lost: recovery via backup codes, documented in the staff guide **[new: doc]**.

---

## 3. Invariants — the database must make these impossible

| # | Never true | Status |
|---|---|---|
| I1 | Two `checked_in` bookings on the same room | **[exists — 0014]** |
| I2 | A room assigned to a booking whose stay (effective end = max(check_out, tomorrow) while checked in) overlaps another active booking on that room | **[exists, extended by 0014]** |
| I3 | Booking `checked_in` or `checked_out` with balance > 0 at the moment of the move | **[exists — DB rule added in 0015]** |
| I4 | Booking `pending_payment` with a room assigned | **[exists — 0015]** |
| I5 | More active bookings in a category than rooms in service for any night | **[exists: capacity, extended by 0014; counts from the business date until 06:00 since 0022]** |
| I6 | A successful payment changed or deleted | **[exists]** |
| I7 | A payment without method, amount > 0, person (desk) or verified reference (online) | **[exists; transfer reference added in 0015]** |
| I8 | Total paid on a booking > total + approved refunds owing (overpayment) without a refund request | **[exists: flagged for a refund, not blocked]** |
| I9 | Hall booking `confirmed` with paid < price, or price null | **[exists — 0015]** |
| I10 | Bar order `paid` by transfer without a reference | **[exists — 0015]** |
| I11 | Closing edited or deleted; second closing for the same person/day/counter | **[exists; verified per person and business day]** |
| I12 | Activity, status history or any money record deleted | **[exists]** |
| I13 | Insert into legacy `sales` (charge-to-room) | **[exists — 0015]** |
| I14 | Zero owners | **[exists]** |
| I15 | Bar order `paid` by POS/card without the last 4 digits of the terminal slip | **[exists — 0020]** (hardware brief H1) |
| I16 | Desk payment by POS/card without the last 4 digits of the slip (from 0020 on; slips may repeat, transfers may not) | **[exists — 0020]** (H2) |
| I17 | A payment check (Matches / Not found against the statement or terminal) changed, deleted, made twice for one payment, made by anyone but the GM/Owner, or "Not found" without a note | **[exists — 0021]** (interface brief I1) |
| I18 | A room asked for on a booking (from the calendar, `preferred_room_id`) that isn't of the booking's room type. It is only a preference: rooms are still given on payment (I4) | **[exists — 0024]** (interface brief I6) |

Each invariant gets a DB test in `tests/db` that tries to break it and expects the specific error.

---

## 4. Nightly self-check (and every 10 minutes for urgent ones)

Run from the existing cron. Never changes money; only alerts (email to GM/Owner + shows on the Dashboard "Anything wrong?").

**Built (26 Nov):** `src/server/domain/self-check.ts`, run by the scheduled job; alerts go to `ALERT_WEBHOOK_URL`, at most once a day per problem
(migration 0027), and the Dashboard shows the live list. Built: in house and owing, online payment pending over an hour, paid with no room,
overpaid, two guests checked in to one room, unpaid with a room (every 10 minutes); overdue check-out, not arrived, closing not verified after
24 h, room out of order over 3 days, transfer/POS payments unconfirmed after 3 days (daily, after 06:00). Cash over/short alerts on submit (closings).
**Not yet:** the Paystack daily reconcile (needs their transaction list API) and refund outcomes (no refund workflow yet).

| Check | When | Alert text (example) |
|---|---|---|
| Booking checked in with balance > 0 | 10 min | "Ibrahim Musa (Room 402) is in house and owes ₦1,080,000." |
| Checked in past check-out date | 06:00 daily | "Grace Adeyemi should have left Room 107 on Sun 22 Nov." |
| Confirmed, check-in date passed, not checked in | 06:00 daily | "Chioma Eze was due Tue 24 Nov and hasn't arrived." |
| Online payment pending > 60 min | 10 min | "Online payment for VL-DCBSAU has been pending for an hour — check Paystack." |
| Paid but no room (late payment after expiry, room gone) | 10 min | "VL-… paid ₦75,000 but no Standard room is free. Call the guest." |
| Paystack says successful, we don't have it (daily reconcile via Paystack list API) | 06:00 | "Paystack shows 2 payments we haven't recorded." |
| Overpayment / duplicate payment on a booking | 10 min | "VL-… has been paid twice. Raise a refund." |
| Closing not verified after 24 h | 06:00 | "Bisi's bar closing for Tue 24 Nov is waiting for sign-off." |
| Cash over/short at any closing | on submit | "Bar closing Tue 24 Nov: ₦2,000 short (reason: …)." |
| Refund approved but outcome not recorded after 72 h | 06:00 | "Refund for VL-… approved 3 days ago; record how it was paid." |
| Room in maintenance > 3 days | 06:00 | "Room 303 has been out of order since …" |
| Any invariant check query returns rows (belt and braces) | 06:00 | "Data check failed: …" + alert webhook |

---

## 5. Edge cases — what happens

Each row: expected behaviour + a test (unit, DB or e2e). "Today" means the business day.

### 5.1 Arrivals and stays

| Case | Expected |
|---|---|
| Guest arrives, room not clean yet | Can't check in; Today shows "Room 204 being cleaned · Mark clean". Option to move to another ready room of the same type (no charge). |
| Guest arrives early | Check-in is any time on the arrival day once the room is ready; no early check-in fee. Check-out is by 12:00. **[decided by Tobi, 25 Nov]** |
| Walk-in after midnight, before 06:00 | Books the night that's still running (business date): at 2am on the 26th, 25th → 26th, paid and checked in straight away. Last night's arrivals stay in "Arriving today" until 06:00; they're not no-shows yet. **[decided by Tobi, 25 Nov]** |
| Guest arrives a day late, booking still confirmed | Allowed. Missed night isn't refunded (no-show policy for that night) **[decide]**. Check-out date unchanged. |
| Paid guest never arrives | Shows in "Didn't arrive" from the next business day. Front desk marks no-show; GM/Owner decides refund per policy. Room released for resale from the moment of no-show. |
| Guest wants to extend while in house | Creates a pending extension with price; applied when paid. If the room isn't free for the new nights, offer another room (room change on the extension date). |
| Guest stays past check-out without extending | Stays occupied; "Overdue" on Today and the self-check. Extra night charged via an extension that must be paid before end of day **[decide: charge from 12:00 next day? late check-out fee?]**. |
| Guest leaves early | Check out; unused nights → refund request per policy (GM/Owner decides) **[decide]**. Never auto-refund. |
| Guest changes room mid-stay (upgrade) | Price difference for remaining nights is a pending change; applied when paid. Old room → needs_cleaning. Same-category move with no price change: immediate, reason recorded. |
| Room breaks while guest is in it | Manager sets maintenance with reason; Today shows "Move guest from 303"; move is free. |
| Walk-in when no room of that type is free | New booking shows only types with availability tonight; no overbooking. |
| Two staff assign the last room simultaneously | Second gets "Room 107 was just taken — choose another" (DB overlap trigger + optimistic version) **[exists: version; verify message]**. |
| Two staff edit the same booking | Optimistic version check; second save gets "This booking changed — reload" **[exists: reservations_version; verify UI]**. |
| Guest books twice by mistake | Allowed (could be two rooms); front desk cancels one → refund request. Self-check flags same email + same dates twice **[new: soft flag]**. |
| Group: 3 rooms, one payer | Three bookings; one payment can't span bookings today. **[decide: add "group" later; for now take three payments]** |
| Arrival at 02:00 | Belongs to the previous business day's arrivals; check-in allowed. |
| Guest count above room maximum | Blocked **[exists]**. |

### 5.2 Money

| Case | Expected |
|---|---|
| Paystack charged, webhook never arrived | Callback page verifies; if the guest closed the browser, cron verifies pending payments with Paystack **[verify exists]**; daily reconcile catches the rest. |
| Webhook arrives twice / callback + webhook both | Idempotent on reference; one payment **[exists; keep test]**. |
| Payment succeeds after the hold expired | Booking → confirmed if a room of that type is still free; else "Paid but no room" alert and booking kept as confirmed-unassigned for the front desk to resolve (call guest / refund). |
| Guest pays twice (two tabs) | Second successful payment recorded (it's real money); overpayment flag → refund request. |
| Partial payment | Not possible online (Paystack amount fixed). At the desk, amount is fixed to the balance **[exists]**. |
| Wrong desk payment recorded (wrong method/amount) | Correction entry with reason by a manager; original stays visible **[exists]**. |
| Transfer turns out fake after the guest left | Manager records a correction ("transfer not received") → balance reappears → shows in self-check; the person who confirmed is on record. |
| Refund needed after check-out | Refund request → GM/Owner approve → paid outside → outcome recorded. Never deleted payments. |
| Cash drawer short | Blind count records the shortage with reason; manager sees it on sign-off and Dashboard. |
| Paystack is down | Website shows "Online payment is unavailable right now — call +234… to book" instead of failing silently; desk takes cash/transfer/POS as usual. **[new]** |
| Price/rate changed after booking | Existing bookings keep their price **[verify]**. |
| Promo code used up mid-checkout | Rejected at hold with a clear message **[exists]**. |

### 5.3 Restaurant and bar

| Case | Expected |
|---|---|
| Customer leaves without paying an open order | Order stays open; at closing "Unpaid orders: 1" must be resolved (paid or cancelled with reason) before the closing can be submitted **[new]**. Cancelled-unpaid shows to manager. |
| Item sells out mid-service | Manager marks sold out; tile greys out on all tills; an open order keeps the line but can't add more. Stock can't go below zero without a manager adjustment: the sale is blocked **[decided by Tobi, 25 Nov: block; exists]**. |
| Price change with orders open | Existing lines keep their price. |
| Void after receipt printed | Manager only, reason, receipt reprinted marked VOID; stock returned. |
| Shift change with a table still open | Order can be handed to another salesperson (records both); the closing belongs to whoever takes payment **[new: hand over]**. |
| Sale at 01:30 | Belongs to the previous business day; closing and receipt say so. |
| Power cut mid-sale | Order is saved on each add (server) **[verify]**; on reload the open order is still there. Payment confirm is idempotent (double-click/retry can't double-charge) **[verify: idempotency key on pay]**. |
| Internet down at the bar | Paper procedure (`docs/restaurant-bar-offline.md`); catch-up entry afterwards marked "entered late", by whom **[new: catch-up flag]**. |

### 5.4 Staff and access

| Case | Expected |
|---|---|
| Staff forgets to sign out on a shared laptop | Idle lock after N minutes **[new; decide N: 10]**; "Signed in as … · Switch user" strip always visible. |
| Staff member leaves | Owner removes access → sessions end; their records keep their name. |
| Manager away, closing needs sign-off | GM or Owner can sign off any closing. |
| Owner loses phone (two-step) | Backup codes at setup; second owner/GM can't reset owner — documented recovery via Clerk dashboard by GREAM Business Solutions **[doc]**. |
| Role changed mid-shift | Takes effect on next page load. |

### 5.5 Infrastructure

| Case | Expected |
|---|---|
| Internet down 5 min | Pages show a clear "No connection — your last action may not have saved" banner; forms keep values; retry is safe (idempotent actions) **[new: banner + idempotency check]**. |
| Internet down for hours | Downtime plan (section 6). |
| Laptop dies | Any other laptop + sign-in works; nothing stored locally. |
| Clerk down | Already-signed-in sessions continue until expiry **[verify]**; new sign-ins fail → downtime plan. |
| Resend down | Emails queued and retried **[exists: email queue; verify retry]**; booking still confirmed. |
| Cloudflare D1 problem | Restore with Time Travel to the last good point; tested before go-live **[new: restore drill]**. |
| Clock/timezone | All business-day logic uses Africa/Lagos (UTC+1, no DST) in one helper; no `new Date()` in components **[fix]**. |

---

## 6. Downtime plan (hotel staff version goes in the staff guide)

**Prepare (every day):**
- 06:00 the system emails the GM a one-page PDF: arrivals, departures, in-house with room and balance, rooms out of order. Front desk prints it at shift start **[new]**.
- A mobile-data router (or a phone hotspot) is kept charged at the front desk and the bar.
- Paper forms in a folder: room rack (room / guest / status / time), payment slip, bar sales sheet.

**During:**
- Try the hotspot first. If the system works on the hotspot, carry on.
- Otherwise: front desk works from the printed sheet; every payment and check-in/out goes on a paper slip with time and name. Bar uses the paper sales sheet. No refunds or cancellations during downtime.
- Online bookings continue on the website (it's hosted, not on the hotel's internet); they appear when the desk is back.

**Recover:**
- Enter paper records via the Catch-up screen (marked "entered late", original time, person) **[new]**.
- Run the self-check; resolve every alert.
- Manager signs a short "downtime recovered" note in the activity log.

---

## 7. Decisions needed (defaults in brackets — build the default)

1. Business-day cut-off time (06:00). **Decided:** before the cut-off, "tonight" is the business date (25 Nov). A guest
   arriving at 2am on the 26th books 25th → 26th and pays that night. The same date governs booking validation (staff
   and website), Today's "available tonight" and arrivals, check-in, and the capacity triggers (`tonight()` in
   `src/lib/hotel-date.ts`; migration 0022). The cut-off hour is `policy.businessDayStartHour`.
2. Overstay: when does an extra night start, and is there a late check-out fee (extra night from 12:00 + 2h grace; no fee).
3. No-show and late-arrival refund policy (first night kept, rest refunded; GM/Owner decides).
4. Early departure refund (unused nights refunded on request; GM/Owner decides).
5. Early check-in fee (none). **Decided:** check-in any time on the arrival day, check-out by 12:00; the free-cancellation window counts back from the start of the arrival day (00:00 hotel time), not from a check-in hour (25 Nov).
6. Stock below zero at the bar — **decided: block** (25 Nov).
7. Idle lock time on shared laptops (10 minutes).
8. Groups / one payer for several rooms (not now; separate payments).
9. VAT on receipts — **off until Tobi confirms the hotel's Tax ID (TIN)** (25 Nov). A Booking rules setting (migration 0018) with the TIN (0019); the database refuses VAT without a TIN, and receipts and bills print the TIN with the VAT line.

---

## 8. How to build against this

- Implement in this order: invariants (section 3) → booking moves (2.1) → room status (2.2) → payments and transfers (2.3, 2.5) → closings (2.6) → self-check (4) → edge cases (5) → downtime support (6).
- Every **[new]** and **[verify]** item ends with a test: DB tests for invariants, domain unit tests for moves and Today, e2e for the flows. Name tests after the rule (`I1 two checked-in bookings on one room is rejected`).
- Error messages follow the three-part pattern from the wording audit: what happened, why, what to do.
- When a **[decide]** default is built, leave it in one settings place so the hotel's answer is a config change, not a code change.
- Keep this document current: when behaviour changes, change this file in the same commit.
