# Hardware readiness brief — build for the recommended stations

**Revised 25 Nov 2026 (replaces the earlier version of this file).** Do the go-live items after `docs/fix-brief-2026-11-25.md`. Read `docs/rules-and-edge-cases.md` for the rules these screens must respect.

The hotel has no existing software. We are recommending one standard setup and building for exactly that, while the system keeps working on any modern computer with Chrome.

## The standard stations

| | Restaurant & bar counter | Front desk |
|---|---|---|
| Device | Windows 11 touchscreen terminal, **15.6" widescreen**, capacitive touch, 8GB, SSD. Touch only, no keyboard or mouse | Windows 10/11 all-in-one 21.5–24" (1366×768 to 1920×1080), keyboard + mouse. The hotel's existing all-in-one if it meets this |
| Browser | Chrome full-screen kiosk: `--kiosk --kiosk-printing`, Windows display scaling **100%** → **1280×720 usable, no browser toolbars** | Normal Chrome window with the print dialog. **No `--kiosk-printing`** |
| Printing | 80mm USB thermal, auto-cutter, silent printing | A4 mono laser (bills, payment receipts, hall invoices). No thermal at the desk |
| Cash | Cash drawer on the printer's RJ11 port, opened by the printer driver ("open drawer on print") | — |
| Cards | Standalone bank / Moniepoint terminal. Staff wait for "Approved", then record the sale with the slip number | Same |
| Other | One terminal serves both counters (Restaurant/Bar switch). A second identical kit only if the hotel confirms two counters | Managers/owner/finance use their own laptops or phones |

Shared: UPS on each station and the router; main internet + automatic 4G failover; guests on a separate Wi-Fi network. None of this needs code.

**Never build:** software control of the printer or cash drawer, card terminal integration, barcode scanners, kitchen printing, full offline mode.

## Already done (verify, don't redo)

- Till: three columns (unpaid · menu · order) at ≥1280px; two columns below. Best sellers, slim receipt, unpaid-orders search (`components/management/till.tsx`, commit 183f037).
- Touch: `pointer-coarse:size-12` on +/−/remove; chips `min-h-11`.
- Draft order saved to localStorage (`till.tsx` ~42–50).
- Transfer reference + "checked in the bank app" tick required (UI and `server/domain/pos.ts`).
- `safeAction` shows the offline message when an action fails (`lib/safe-action.ts`).
- Print: `@page { size: A4 }` default and `@page thermal` (80mm) for receipts (`app/globals.css` ~121–151).
- Screenshots in `docs/screens/` at 1024×768, 1280×620, 1366×668.

## Work items

### Before go-live (money and accountability)

**H1. Slip number for POS / card payments — bar.**
- Selecting "POS / card" on the till requires the last 4 digits of the terminal slip (number pad, see H4). Same rule on the server.
- Store it on the order. Today `pos_orders.transfer_reference` is only kept for `bank_transfer` (`server/domain/pos.ts` ~215). Either rename to a general `payment_reference` (migration; keep old data) or add `pos_reference`. Show it on the receipt, in Orders & receipts, and in the sales reports so the manager can check it against the terminal's own report.
- DB check: a paid `pos_terminal` order without a reference is rejected (new invariant; add to section 3 of the rules spec).

**H2. References required on desk payments — front desk.**
- `server/payments.ts` ~20: `reference` is optional for every method. Make it required for `bank_transfer` (narration or last 4 of the reference) and `pos_terminal` (last 4 of the slip); optional for cash.
- Update the field hint and error messages (three-part wording). DB check as H1 for desk payments made after this migration.

**H3. Idle lock and Switch user — both stations.**
- `config/policy.ts` has `idleLockMinutes: 10` but nothing uses it. After N minutes without input, cover the screen with "Locked · Signed in as Bisi · Continue / Switch user". Continue needs no password within the Clerk session; Switch user signs out and goes to sign-in.
- Never lose an open till draft on lock or switch: drafts are keyed by staff member, and the next person doesn't see the previous person's draft.
- A slim "Signed in as <name> (<role>) · Switch user" strip always visible on the till and Today.

### Before the new equipment is installed

**H4. On-screen number pad — bar.**
- Every number the bar enters uses an in-app keypad, so the Windows touch keyboard never opens: cash received (keep Exact / quick amounts), transfer reference, POS slip digits, daily closing count.
- Table: quick chips (T1…T12 and "Bar", configurable later) instead of typing; free-text name stays optional.
- Cancel reason: a few preset reasons ("Customer left", "Wrong item", "Duplicate order") plus "Other" (free text).
- Inputs keep working with a physical keyboard (front desk and laptops).

**H5. Station settings — both.**
- New page `/app/station` ("This station"), reachable from the staff card. Stored in localStorage (per browser), no server state:
  - Counter default: Restaurant / Bar (till only).
  - Print layout: 80mm receipt / A4 / don't print.
  - Print the receipt automatically after payment: on/off (default on when print layout is 80mm).
- Till, receipt pages and desk payment confirmation read these settings. Auto-print calls `window.print()` once after the paid result arrives, never on re-render or retry.
- Wrap localStorage reads/writes in try/catch; sensible defaults if storage is unavailable.

**H6. Both print layouts for every document.**
- Bar receipt, desk payment receipt, guest bill, hall invoice each have an 80mm and an A4 layout; the station setting chooses. Default by context: till → 80mm, everything else → A4.
- 80mm: black on white, nothing lighter than #333, monospace, ≥3mm side padding, long names wrap, no clipped totals. Reprints marked "COPY".
- Check with print-to-PDF at both sizes; save PDFs to `docs/screens/print/`.

**H7. Screen target 1280×720 full-screen.**
- Add screenshots of the till, payment step, closing and receipt at **1280×720** (kiosk, no browser chrome) and the front desk screens at **1366×768** and **1920×1080**.
- At 1280×720 the till must fit with no page scroll; only the menu and unpaid-orders columns scroll inside themselves. Pay always visible.
- Remove the 1024×768 comments in `till.tsx` (~198, ~299) — that's no longer the target; keep the two-column fallback for smaller screens.

**H8. Browser check — both.**
- On sign-in and on the management layout: if the browser is not a current Chromium-based browser, or the OS is Windows 7/8, show a clear banner: "This computer's browser is too old for the system. Use Google Chrome on Windows 10 or 11." Don't block sign-in; warn.
- Log the user agent once per staff session to the activity log for support.

**H9. Always-visible connection banner — both.**
- Listen to `online`/`offline` events; show "No internet connection. Your last action may not have saved. Don't take payment until this clears." Disable Pay / Take payment / Check in / Check out while offline; re-enable on reconnect.
- Keep `safeAction`'s message for failed requests.

**H10. Keyboard shortcuts — front desk.**
- `/` focuses search on Bookings, Guests and Today; Enter confirms the primary action in the payment form; Esc closes dialogs. Show the shortcut as a small hint in the search field. Don't add shortcuts on the till.

**H11. Station setup guide — `docs/station-setup.md`.**
For install day, written for whoever sets up the hardware:
- Bar terminal: Windows display scaling 100%; sleep/screen-off disabled; Windows updates outside 10:00–02:00; Chrome shortcut `chrome.exe --kiosk --kiosk-printing https://victorialuxuryhotel.com/app/sales`; thermal printer set as Windows default; driver set to open the cash drawer on print; Chrome headers/footers off; how to exit kiosk (Alt+F4); set this station to 80mm + auto-print on `/app/station`.
- Front desk: normal Chrome, A4 default printer, app pinned, station set to A4.
- Network: guest Wi-Fi separate from staff; test failover by unplugging the main line while a test sale is made.
- Printer out of paper / offline: the sale still completes; reprint from Orders & receipts.

### Aftercare (first two weeks)

**H12. Digital receipt link.**
- Public, token-based receipt page for desk payments and bar sales (like the existing guest booking receipt), shown as a QR code and a "Send on WhatsApp" link after payment. Used when the printer is down or the customer wants it on their phone.

## Go-live config to confirm (not code)

- **VAT on receipts** is switched on (commit 755887e: "the hotel is VAT-registered"). A VAT receipt needs the hotel's Tax ID (TIN); there is none in the system. Add a `taxId` setting shown on every receipt and bill when VAT is on. Until Tobi confirms the TIN with the hotel, **leave VAT off**.
- **Two-step sign-in** is on hold until `TWO_STEP_ENFORCED=1` (`docs/release-review.md` §4). It must be set at cut-over.

## Done means

- `pnpm check`, `pnpm test:db`, `pnpm test:e2e` pass. New DB tests for H1/H2 invariants; unit tests for station settings defaults and auto-print firing once; e2e for idle lock (draft survives) and offline banner (Pay disabled).
- Screenshots at 1280×720 (till, payment, closing) and 1366×768 / 1920×1080 (Today, booking, room board) in `docs/screens/`; print PDFs at 80mm and A4 in `docs/screens/print/`.
- A 10-order run on the till at 1280×720 using only taps: no page scroll, no Windows keyboard, every POS sale has a slip number, every transfer a reference.
- `docs/station-setup.md` exists; `docs/rules-and-edge-cases.md` and `docs/qa-2026-11-25.md` updated.
