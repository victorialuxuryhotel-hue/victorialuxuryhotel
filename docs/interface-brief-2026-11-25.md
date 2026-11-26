# Interface brief — what we're borrowing from the best systems

Source: the "Victoria Hotel interface review" (comparison with Cloudbeds, Mews, Little Hotelier, RoomRaccoon, eZee, Loyverse, Square, Toast, Nigerian systems and the reference screenshots). Do this **after** `fix-brief` and `hardware-brief` items marked before go-live. Respect `docs/rules-and-edge-cases.md` in everything: pay first, status from recorded events, money append-only, one next action per guest.

Nothing here adds a module. Everything makes the existing day faster or easier to read.

## Before go-live (small, high value)

### I1. Payments to confirm
The second half of transfer proof: someone checks each transfer and card payment against the bank statement or terminal report.

- Scope: every successful **bank_transfer** and **pos_terminal** payment — desk payments (`payments`), hall payments, and bar orders (`pos_orders`). Online Paystack payments are already verified; cash is covered by closings.
- Data: new append-only table `payment_checks` (id, source_type `payment|hall_payment|pos_order`, source_id, outcome `matched|not_found`, note, checked_by, checked_at). One check per source (unique). No update/delete triggers, like other money tables. Payments themselves are not changed.
- Who: general manager and owner confirm. Finance sees the list read-only **[decide: let finance confirm? default no — finance is read-only in the contract]**.
- Screen: `/app/payments/confirm` — list of unconfirmed items, oldest first: date, who took it, guest/table, method, amount, reference/slip digits. Two buttons per row: **Matches** / **Not found**. "Not found" requires a note and raises an alert (self-check, spec §4) for the manager to correct the payment through the existing correction flow.
- Dashboard: "Needs attention · 5 payments (₦1,815,000) to confirm" linking there. Count and total must equal the list.
- Tests: DB (append-only, one check per source), domain (list excludes cash/Paystack/checked), e2e (confirm, not-found raises alert).

### I2. Available tonight on Today
- Card per room type: "Standard · 16 of 28 free · ₦40,000" with a **New booking** button prefilled with tonight and the type.
- "Free" uses the same availability function as the website and the occupancy rule (checked-in = occupied). Out-of-order rooms excluded. Never disagree with the booking form.
- Hidden when nothing is free: "Fully booked tonight".

### I3. Progress counts on Today
- Section headings: "Arriving today · 13 of 18 arrived", "Leaving today · 35 of 38 left", with a thin progress bar.
- Numbers come from the same queries as the lists (count = rows + done). Unit test that they match.

### I4. Booking source badges
- Small neutral badge on Today rows and the bookings list: Website, Walk-in, Phone, WhatsApp, Staff (`domain/status.ts` `bookingSource`). No colours beyond the existing neutral badge.

### I5. Business day in the sidebar
- Bottom of the sidebar (and the till header strip): "Business day · Tue 24 Nov". Uses the single business-day helper (cut-off from `config/policy.ts`). After midnight it shows the previous date with "(until 06:00)".

## Aftercare (first two weeks), in this order

### I6. Room calendar — `/app/calendar` (first aftercare build)
The screen small-hotel staff reach for first (Little Hotelier, RoomRaccoon, Mews timeline, eZee stay view).

- Grid: rooms down the side grouped by room type (with type availability per night in the header row), 14 days across starting today; buttons for ← 7 days / Today / 7 days →. Must fit 1366×768 and read clearly at 1920×1080.
- Bars: one per booking, guest surname + nights, coloured by status — awaiting payment, confirmed, in house, due out today, overdue (in house past check-out), plus out-of-order blocks. A legend. Use the existing badge tones, not new colours.
- Click a bar → booking side panel (I7). Click an empty cell → New booking prefilled with room type, date and room (assignment still happens after payment).
- **Version 1 is read-only.** No dragging. Moves and extensions happen from the side panel's buttons:
  - **Extend stay**: pick the new check-out → price shown → creates the paid change (spec §2.1) → "Take payment ₦80,000" → applied on payment. If the room isn't free for the extra nights, offer free rooms of the same type.
  - **Change room**: same rules as the booking page (only free, clean rooms; price difference paid first).
- Nav: "Calendar" under Daily work for front desk, hotel manager, GM, owner.
- Performance: one query for the 14-day window; no N+1.

### I7. Booking side panel
- From Today, the calendar and the bookings list, clicking a guest opens a right-hand panel (not a new page): money line (Total · Paid · Owes), stay, the one next action, notes, and "Open full booking". Esc / click outside closes; URL updates (`?booking=VL-…`) so back/refresh work.
- Reuse the booking page's domain "next action" function so the panel, Today and the booking page never disagree.

### I8. Till improvements (`components/management/till.tsx`)
- **Stock on tiles:** "5 left" when at or below the low-stock level, greyed and not tappable at zero (manager can still mark sold out/in from Menu). "Made to order" for items without stock tracking.
- **Notes per line:** tap a line → note (preset chips: No ice, Cold, Well done, No pepper, plus keypad text). Stored on `pos_order_items` (new nullable `note` column), printed on the receipt under the item.
- **Item search** above the menu (opens the on-screen keypad on touch stations).
- **"Same again"** on an open order: adds the last round's lines again (as new lines, same prices as the menu now).
- **Full-screen till:** on the bar station (station setting from H5) or for restaurant & bar roles, hide the sidebar; keep a slim strip with business day, "Signed in as · Switch user", and links to Orders and Closing.
- **Dark mode** option for the till (station setting, default off). High contrast; Pay stays the most prominent element.
- **Bigger Pay:** full-width, at least 56px tall, total in large type.

### I9. Global search
- Header search box on all staff screens except the till: placeholder "Search guests, bookings, rooms…", shortcut `Ctrl K` / `/`.
- Finds guests (name, phone, email), bookings (reference, guest), rooms (number). Results grouped, keyboard-navigable, max 5 per group, opens the side panel for bookings.
- Respects permissions: only shows what the role can open. Server-side query with LIMITs; debounce 200ms.

### I10. Help in each screen
Staff will mostly train each other (most get under two weeks of training).
- A one-line "what this screen is for" under each page title, and a "?" that opens 3–5 short steps for the main task on that screen. Content in one file (`content/help.ts`) using glossary words.
- "Your first day" checklist on the account page per role (front desk: take a walk-in, take a payment, check in, check out, mark a room clean; bar: take an order, cash sale, transfer sale with reference, close the day). Ticks stored per staff member; disappears when done.

### I11. Small visual touches
- Initials avatars next to guest names in Today, lists and the side panel (neutral colours from the palette).
- Progress bars under Arriving/Leaving (with I3).
- Keep navy/gold/ivory. No saturated tiles, no large day-on-day percentages.

## Don't copy (decided)
- Check in on every arrival regardless of payment/room state; "Owes" at check-out.
- Discount box at the till (discounts stay manager-approved promo codes).
- Quantity box + Select button on item tiles.
- Saturated colour tiles; big "vs yesterday" percentages.
- Charge-to-room, kitchen display, expenses, accounting, corporate accounts (out of scope).
- Dragging bookings on the calendar (version 1).

## Done means
- `pnpm check`, `pnpm test:db`, `pnpm test:e2e` pass; new tests per item as listed.
- Screenshots at 1366×768 and 1920×1080 (Today with I2–I5, calendar, side panel, payments to confirm, dashboard) and 1280×720 (till with I8) in `docs/screens/`.
- Today's counts, "available tonight", the calendar's per-night availability and the website's availability agree for the same date (test).
- `docs/qa-2026-11-25.md` and `docs/rules-and-edge-cases.md` updated (add `payment_checks` to the invariants list).
