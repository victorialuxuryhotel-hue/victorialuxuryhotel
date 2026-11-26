# Station setup — install day

For whoever sets up the computers and printers at the hotel. Two stations: the **restaurant & bar
counter** and the **front desk**. Allow about an hour per station. Do the checks at the end of each
section before you leave.

Site address: **https://victorialuxuryhotel.com/app**. Each person signs in with their own account
(invitations come from the owner).

---

## 1. Restaurant & bar counter

**Equipment:** Windows 11 touchscreen terminal (15.6", touch only, no keyboard or mouse), 80mm USB
thermal printer with auto-cutter, cash drawer on the printer's RJ11 port, UPS, the hotel's
standalone bank / Moniepoint card terminal.

### Windows

1. **Display scaling 100%**: Settings → System → Display → Scale → **100%**. Resolution 1366×768 or
   1920×1080 is fine; the till is built for 1280×720 in full-screen.
2. **Never sleep**: Settings → System → Power → Screen and sleep → **Never** (on power and battery).
3. **Updates outside opening hours**: Settings → Windows Update → Advanced options → Active hours
   **10:00 to 02:00**, so Windows doesn't restart during service.
4. Plug the terminal, printer and router into the **UPS**.

### Printer and cash drawer

1. Install the printer's Windows driver (from the box or the maker's site). Print the Windows test
   page.
2. In the driver's preferences set the paper to the **80mm roll** (often "80 × 3276mm" or
   "Receipt"), and turn on **cut at end of document** (or "paper reduction" / "cut after each
   page"), so each receipt stops and cuts after the last line.
3. Plug the cash drawer into the printer's **RJ11 / DK port** (not the computer). In the driver turn
   on **open cash drawer before / after printing** ("drawer kick"). The drawer then opens on every
   receipt. The system never controls the drawer itself.
4. Set this printer as the **Windows default printer**: Settings → Bluetooth & devices → Printers →
   the thermal printer → Set as default. Turn **off** "Let Windows manage my default printer".

### Chrome

1. Install Google Chrome. Sign in to the site once in a normal window as the bar manager to check it works.
2. In Chrome's print settings turn **Headers and footers** off (print any page with Ctrl+P → More
   settings → untick Headers and footers → Print or Cancel; Chrome remembers it).
3. Create the till shortcut on the desktop. Right-click → New → Shortcut, target:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing https://victorialuxuryhotel.com/app/sales
   ```

   Name it **Till**. `--kiosk` fills the screen with no browser bars; `--kiosk-printing` prints to
   the default printer straight away, with no print dialog.
4. Optional: put the shortcut in the Startup folder (Win+R → `shell:startup`) so the till opens when
   the terminal starts.
5. To leave kiosk mode (to change settings), press **Alt+F4**.

### In the app

1. Open the till, sign in, then in the bottom-left staff card choose **This station**:
   - Counter the till opens on: **Bar** (or Restaurant).
   - Printing: **80mm receipt printer**.
   - Print the receipt as soon as a payment is taken: **on**.
2. These settings are saved on this computer only. If Chrome's site data is cleared, set them again.

### Checks before you leave

- [ ] Make a ₦100 test sale paid in **Cash**: the receipt prints by itself, cuts, and the drawer opens.
- [ ] The receipt is full width, black, and nothing is cut off on the right.
- [ ] Make a test **POS / card** sale: the till asks for the last 4 digits of the slip on the number pad. The Windows touch keyboard does not open.
- [ ] Make a test **Transfer** sale: it asks for the reference and the "checked the bank app" tick.
- [ ] Leave the till alone for 10 minutes: it locks ("Locked · Signed in as …"). Continue brings back the order.
- [ ] Ask the manager to void the test sales (Orders & receipts → the sale → Void, reason "Install test").

---

## 2. Front desk

**Equipment:** Windows 10/11 all-in-one (21.5–24"), keyboard and mouse, A4 mono laser printer, UPS.
No thermal printer at the desk.

1. Install Google Chrome. Use a **normal Chrome window** (not kiosk), so the print dialog shows
   and the receptionist can choose copies.
2. Set the **A4 printer** as the Windows default.
3. Open https://victorialuxuryhotel.com/app/today, sign in, and pin the tab (right-click → Pin) or
   add it to the taskbar.
4. Staff card → **This station** → Printing: **A4 printer**; auto-print **off**.
5. Chrome print settings: **Headers and footers** off.

### Checks before you leave

- [ ] Open a booking → Guest bill → Print: one A4 page, no URL or date in the corners.
- [ ] Open Payments → a receipt → Print: one A4 page.
- [ ] Press `/` on Today: the cursor jumps to Find a booking.

---

## 3. Network

- Two Wi-Fi networks: **staff** (the terminals, the desk, managers' devices) and **guests**. Guests
  must never be on the staff network.
- Main internet line plus an **automatic 4G failover** router (dual-SIM, or the main line + a 4G modem).
- Test the failover: unplug the main line while making a test sale. The till may show **"No internet
  connection. Your last action may not have saved. Don't take payment until this clears."** for a few
  seconds. When it clears, check in Orders & receipts that the sale was saved once.

---

## 4. When things go wrong

| Problem | What to do |
|---|---|
| Printer out of paper or offline | The sale still completes and is saved. Fix the printer, then reprint from **Orders & receipts** → the sale → Print (it says **COPY**). |
| No internet | The banner says so and payment buttons are off. Wait for it to come back. If it's down for long, use the paper procedure in `docs/restaurant-bar-offline.md` and enter the sales afterwards. |
| "This computer's browser is too old" | Update Google Chrome (Menu → Help → About Google Chrome), or the computer is on Windows 7/8 and needs replacing. |
| Receipt prints tiny or cut off | Check display scaling is 100%, the driver paper is 80mm, and This station says 80mm. |
| Two receipts for one sale | Not possible from the till (one print per receipt). Check that the driver isn't set to print 2 copies. |
| Card terminal | It's standalone: wait for "Approved" on the terminal, then confirm the sale on the till with the slip's last 4 digits. The system never talks to the terminal. |
