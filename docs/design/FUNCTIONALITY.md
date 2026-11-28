# What each new screen must do

This file goes with the designs in this folder. The designs show how each screen looks. This file says what each screen saves, the rules it enforces, who can use it, and what happens when something goes wrong. Where the two disagree, this file wins for behaviour and the design wins for layout and wording.

It is written against the current schema (migrations 0001–0028). It reuses what already exists and names each new column or table. All money is in kobo. Money records are never updated or deleted; a correction is a new record (see 0005, 0010, 0015).

---

## 0. Things every flow relies on

**Who did it.** Every money action stores the staff member who did it. On a shared station that is the person who signed in with their PIN (section 1), not whoever is signed in to Clerk.

**Receipts.** Every successful payment gets a numbered receipt from `receipt_counters`, as today. Nothing is written to `payments` until the method's checks pass.

**Not confirming your own payment.** A `payment_checks` row can't be written by the person who recorded that payment (`payments.recorded_by`, `pos_orders.paid_by`, `hall_payments` equivalent). Enforce this with a trigger, not only in the UI. Error code: `payment_check_own_payment`.

**Bank details** (hotel bank, account number, account name) come from `hotel_settings`. Add `bank_name`, `bank_account_number` and `bank_account_name`, nullable. While they are empty, the screens show "[HOTEL BANK]" and so on, and the company bill and pay-link message say "Ask the front desk for the account details".

**Permissions.** Check every action on the server with `can()`. The new permissions are listed in section 12.

---

## 1. Staff sign-in by name and PIN (S1, S2, S3)

Agreement, Schedule A: a shared operational login with each person's own name and PIN.

**How it works**
- A computer is set up once as a **station** by the owner or GM, signed in through Clerk. The station has a name ("Front desk 1", "Bar till") and a type: `desk`, `restaurant`, `bar` or `office`. The browser keeps a station token in a long-lived, httpOnly, secure cookie.
- On a station, staff tap their name and enter a 4–6 digit PIN. That starts a **staff session** on that station.
- An idle lock comes on after the time set in settings (default 5 minutes on tills, 10 at the desk), and also when someone taps Lock. The lock returns to the name grid; open orders and forms stay as they were.
- A station only lists staff whose role fits it: till stations show restaurant_bar staff and their managers, desk stations show front desk and above.
- Owner, GM and finance can still sign in with their own Clerk account on their own devices, as today.

**New**
- `stations` table: `id`, `name`, `type`, `token_hash`, `created_by`, `created_at`, `revoked_at`.
- `staff_profiles.pin_hash`: PBKDF2 or scrypt with a per-user salt. Never store or log the PIN itself.
- `staff_sessions` table: `id`, `station_id`, `staff_id`, `started_at`, `last_seen_at`, `ended_at`, `end_reason` (lock, idle, switch, revoked).
- `pin_attempts` table, or reuse `rate_limit_hits`.

**Rules**
- 5 wrong PINs lock that person on that station for 15 minutes, and the owner and GM see an alert.
- Only the owner sets or resets PINs (`staff.manage`). The first sign-in forces a PIN change.
- A deactivated staff member's sessions end at once.
- The owner can revoke a station from Settings. Revoking it signs everyone out of it.

**Tests:** right PIN, wrong PIN, lockout after 5 tries, idle lock, switching user mid-order keeps the order, a revoked station, and a deactivated user.

---

## 2. Payments at the desk (X4, X5) and at the till (X6, X7)

Methods: cash, bank transfer and POS. These map to the existing `method` values `cash`, `bank_transfer` and `pos_terminal`.

| Method | Required | Optional | Rule |
|---|---|---|---|
| Cash | amount | cash received (till) | Till works out change. |
| Transfer | amount, reference *or* sender's name, "seen in the hotel's bank app" ticked | the other of the two | Can't save without the tick. Goes into Payments to confirm. |
| POS | amount, last 4 digits of the slip (exactly 4 digits), terminal | — | Only after the terminal prints APPROVED. Goes into Payments to confirm. |

**New columns**
- `payments` and `pos_orders`: `sender_name`, `slip_last4`, `terminal`, `seen_in_bank_app` (0/1).
- `pos_orders.payment_reference` already exists; desk payments use `provider_reference` for the transfer reference.
- Add a `terminals` list to settings so the terminal is a dropdown, not free text.

**"Declined but the guest was debited"** records **no payment**. It creates a `payment_issues` row (`id`, `source_type`, `source_id`, `amount_kobo`, `terminal`, `slip_last4`, `note`, `reported_by`, `reported_at`, `resolved_by`, `resolved_at`, `outcome`) and shows the GM and owner a "Check with the bank" item. When the bank confirms the money did arrive, the manager records it as a payment against the original booking or order, linked to the issue.

**Duplicate guard.** Warn, without blocking, if the same reference or the same last-4 digits plus amount were used in the last 7 days.

**Desk.** Partial payments are allowed; the balance updates. Overpaying is blocked; offer "record ₦X and give change" for cash only.

**Till.** "Confirm ₦X paid" closes the order (`status = 'paid'`), issues the receipt, prints, and opens the cash drawer for cash only.

**Tests:** a transfer can't be saved without the tick; POS needs exactly 4 digits; nobody can confirm their own payment; declined-but-debited writes nothing to payments; the duplicate warning; receipt numbers stay sequential under concurrent saves.

---

## 3. Void at the counter with a manager PIN (X9)

- Only a **paid** order can be voided; an open order is cancelled, as today. `status = 'void'`, `close_reason` is required (already enforced).
- The staff member picks a reason from a list (Rung up wrongly, Customer changed mind, Item unavailable, Other) and may add a note. For cash, they tick "cash returned to the customer".
- A manager (restaurant_bar_manager, general_manager or owner) picks their name on the same screen and enters their PIN. Checking the PIN does **not** switch the station's session.
- New on `pos_orders`: `void_approved_by` (must differ from `paid_by` and must hold `pos.void.approve`), `void_reason_code`, `void_cash_returned`.
- The void puts stock back with `stock_moves` of kind `returned`, which already needs `order_id`.
- It is shown in the daily closing: expected cash drops by the voided cash amount.
- 3 wrong manager PINs and the void is refused; the manager is told on their next sign-in.

**Tests:** can't void without a manager PIN; a manager can't approve a void of a sale they made themselves; stock comes back; expected cash is adjusted.

---

## 4. Walk-in (X1)

One server action does it all, in one D1 batch: find or create the guest by phone, create the reservation, assign the room, optionally take payment, and check in.

- Guest lookup by phone as the person types (normalise to +234…). A match fills in the name and shows past stays.
- Only room types and rooms free for tonight show, using the same availability query as the website. A room must be clean and ready.
- **Pay and check in:** payment (section 2 rules) + `checked_in` status in one go. If the payment fails, nothing is created.
- **Save without paying:** creates the booking as unpaid with a 6-hour hold (setting `walkin_hold_hours`, default 6). The self-check job releases it when the hold runs out and tells the desk. Checking in without payment needs `payments.override`, as today.
- Two desks picking the same room at the same moment: the second gets "Room 103 was just taken" and the list refreshes. Use the existing invariants.

---

## 5. Check-in with a registration card (X2)

Required before "Check in": ID type, ID number, home address, coming from, nationality, purpose of stay and the house-rules tick. Card photos (0028) stay optional.

**New table `guest_registrations`** (one per stay): `reservation_id` (unique), `id_type` (nin, passport, drivers_licence, voters_card, other), `id_last4`, `address`, `coming_from`, `nationality`, `purpose`, `rules_accepted_at`, `recorded_by`, `created_at`.
- **Store only the last 4 digits of the ID number.** The full number is never saved, logged or sent anywhere.
- A returning guest's last registration is filled in by default; staff confirm it.
- "Print registration card" prints an A5 card with the guest's details, the room, dates, house rules and a signature line.
- Check-in is blocked if the booking has an unpaid balance, unless someone with `payments.override` allows it (existing rule).

---

## 6. Check-out (X3)

- Shows charges, paid and balance from the existing calculation.
- If there is a balance: "Take payment" (section 2) or "Leave owing", which needs `payments.override` and a reason and shows in Overdue/Owed.
- If guest credit is over ₦0: a refund request (section 7); it is not paid out at the desk.
- Ticks: "Key returned" and "Room goes to cleaning". The second sets the room's status to dirty, as the existing check-out does.
- "Send the receipt" by print, email (existing outbox) or WhatsApp (a wa.me link with the receipt text and link; nothing is sent by the server).

---

## 7. Approvals: refunds and exceptions (X10)

One list for the GM and owner (`payments.approve`). Each item can be approved or declined with a reason; both are kept.

| Kind | Where it comes from | Approve does |
|---|---|---|
| Refund | Desk asks from the booking or at check-out | Creates a `payments` row of `kind = 'refund'`. |
| Unpaid change | `reservation_changes` with status `pending` (existing) | Applies the change, as today. |
| No-show | Self-check job marks it at the cut-off | Keeps the first night per policy and refunds or releases the rest. |
| Leave owing | Check-out | Marks it agreed; it stays in Owed. |

**New table `refund_requests`**: `id`, `reservation_id`, `amount_kobo`, `method` (bank_transfer, cash), `reason`, `requested_by`, `requested_at`, `decided_by`, `decided_at`, `decision` (approved, declined), `decision_note`, `payment_id`.

**Rules**
- A refund can't be more than what was paid minus what was used (nights stayed + extras + any cancellation fee). Show the limit on the form.
- The approver can't be the requester.
- A refund paid by transfer goes through Payments to confirm like any other transfer.
- Paystack card refunds come later (part 3 of the prompt). Until then, a card booking is refunded by bank transfer and marked as such.

---

## 8. Daily closings review (X11)

- Uses `pos_closings`, which already exists, including `verified_by`, `verified_at` and `verify_note`.
- Difference = counted − expected. Show it in red when short, amber when over and green when nil.
- "Mark checked" sets `verified_by` and `verified_at`; a note is required when the difference isn't zero. A manager can't check their own closing.
- "Not closed": staff who sold on a business date and have no closing by 10:00 the next day. They show here and in the owner's "Anything wrong?".
- This week's short and over totals are worked out from the closings, not stored.

---

## 9. Record a delivery (X12)

- Writes a `stock_moves` row of kind `received` with a positive change, the staff member, and a note holding the supplier and invoice.
- New optional columns on `stock_moves`: `supplier`, `cost_kobo`.
- The form shows "Stock goes from X to Y" before saving.
- Needs `inventory.manage`.

---

## 10. Payment links and the guest's pay page (X14, M14, G12)

- From an unpaid or part-paid booking (or a company bill, section 11), the desk creates a link: `/pay/<code>`. The code is random, not the booking reference alone, and it expires when the hold ends.
- **New table `pay_links`**: `code` (unique), `reservation_id` or `bill_id`, `amount_kobo`, `expires_at`, `created_by`, `created_at`, `paid_payment_id`, `cancelled_at`.
- "Send on WhatsApp" opens a wa.me link with a ready message. Email goes through the existing outbox. "Copy link" copies it. The server doesn't send WhatsApp messages itself.
- The pay page shows the booking summary and the hold time, and pays through Paystack with the existing verify and webhook flow. Once paid, the booking is confirmed by itself and the link stops working.
- **Waiting for your transfer (G12):** shown when Paystack reports a pending bank transfer. It checks every 10 seconds until paid, failed or the hold ends. The guest is told not to pay again. If the payment is still pending when the hold ends, keep the room for 30 more minutes and alert the desk; never release a room with a payment in flight.
- "Send to WhatsApp" on the confirmation pages (G7, M8) is a wa.me share link with the booking reference, dates and the "My booking" link.

---

## 11. Company bill, paid before arrival (P3)

- A bill covers one or more bookings for a company. **New table `bills`**: `id`, `number` (B-0001…, its own counter), `company_name`, `attention`, `reservation_ids` (json), `lines` (json), `total_kobo`, `valid_until`, `created_by`, `created_at`, `cancelled_at`.
- It prints on A4 and can be sent as a pay link. It says clearly that it is **not a receipt**.
- A payment against a bill is split across its bookings in order, and each booking gets its own receipt.
- Bookings on a bill are held until `valid_until`. After that the self-check releases them and tells the desk.

---

## 12. Owner's phone dashboard (X13)

- The owner's existing sign-in on a phone opens this screen. It is view only: no buttons that change anything.
- Tiles: occupancy tonight, money taken today (all outlets), bar today, and overdue guests with what they owe.
- "Anything wrong?" lists: payments to confirm, overdue guests, short closings, not-closed staff, payment issues, failed PIN lockouts and a station revoked.
- Takings for the last 7 days come from successful payments and paid POS orders, by business date.
- The screen refreshes when opened and on pull-down; no live updates are needed.

---

## 13. Till calculator (X8)

Only on the screen: plus, minus, times, divide, clear. It saves nothing and sends nothing.

---

## 14. New permissions

| Permission | Who |
|---|---|
| `pos.void.approve` | restaurant_bar_manager, general_manager, owner |
| `refunds.request` | front_desk, hotel_manager, general_manager, owner |
| `stations.manage` | owner, general_manager |
| `paylinks.create` | front_desk and up (same as `payments.record`) |
| `bills.manage` | front_desk and up |

`payments.approve` (existing) covers approvals and refunds. `pos.manage` covers the closings review.

---

## 15. Order of build

Follows the prompt:
- **By 1 Dec:** sections 1, 2, 3, 4, 5, 6 and 13, plus the restyle.
- **Straight after:** 7, 8, 9, 10, 11 and 12.
- **Later:** Paystack card refunds and split payments, to be planned first.

Each new table gets a forward-only migration, no-update/no-delete triggers where it holds money, and tests in `tests/`.
