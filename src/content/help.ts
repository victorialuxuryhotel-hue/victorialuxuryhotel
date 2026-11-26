// Help on each screen (interface brief I10). Most staff learn from each other in under two weeks, so
// each screen says in one line what it's for, and "?" gives the 3–5 steps of its main task. Words
// follow docs/glossary.md (the unit test checks the words it says not to use).

import type { StaffRole } from "@/domain/status";

export type ScreenHelp = { purpose: string; task: string; steps: string[] };

/** By path; a [id] segment matches any value. */
export const screenHelp: Record<string, ScreenHelp> = {
  "/app/today": {
    purpose: "What needs doing at the desk today: who owes money, who's arriving and leaving, and what's free tonight.",
    task: "Start the day at the desk",
    steps: [
      "Work down Needs you now from the top: payments owed and overdue check-outs first.",
      "Check in today's arrivals once they've paid and their room is ready.",
      "Check out today's departures after taking anything owed.",
      "Use Available tonight to answer walk-ins, then New booking.",
    ],
  },
  "/app/reservations": {
    purpose: "Every booking, with what's owed. Find one by reference, guest name or phone.",
    task: "Find a booking",
    steps: ["Type the reference (VL-…), the guest's name or phone number in the search box.", "Use the tabs for upcoming, in house, awaiting payment or needs attention.", "Click a guest to see the booking without leaving the list."],
  },
  "/app/reservations/new": {
    purpose: "A booking taken at the desk, on the phone or on WhatsApp.",
    task: "Take a walk-in",
    steps: [
      "Type the guest's phone number first: a returning guest comes up to choose.",
      "Check the dates (tonight is filled in) and pick a room type that has rooms free.",
      "Choose how it was booked: walk-in, phone or WhatsApp.",
      "Save, then take payment. The room is given when it's paid.",
    ],
  },
  "/app/reservations/[id]": {
    purpose: "One booking: the stay, what's paid and owed, and the one next step.",
    task: "Move a booking on",
    steps: ["Do the button at the bottom: take payment, check in or check out.", "Change dates or room under Change dates or room; a higher price waits for its payment.", "Print the guest bill for the guest when they leave."],
  },
  "/app/calendar": {
    purpose: "Every room for the next two weeks: who's in each room, and what's free each night.",
    task: "Read the calendar",
    steps: ["Each row is a room; each column a night. The colour is the booking's state (see the key).", "The grey row under each room type says how many are free that night.", "Click a booking to see it; click an empty night to start a booking for that room."],
  },
  "/app/rooms": {
    purpose: "Every room right now: occupied, ready, needs cleaning or under maintenance.",
    task: "Mark a room clean",
    steps: ["Find the room (the chips at the top filter by state).", "When housekeeping has finished, mark it ready.", "If something's broken, put it under maintenance with the reason: it can't be sold until it's back."],
  },
  "/app/guests": {
    purpose: "Everyone who has stayed or booked, with their stays and what they owe.",
    task: "Find a guest",
    steps: ["Search by name, phone or email.", "Open the guest to see every stay and payment.", "Correct a phone number or email there; bookings keep the change."],
  },
  "/app/guests/[id]": {
    purpose: "One guest: contact details, every stay and every payment.",
    task: "Update a guest's details",
    steps: ["Change the phone number or email and save.", "Open any stay from the list to work on that booking.", "What the guest owes across stays shows at the top."],
  },
  "/app/payments": {
    purpose: "Payments taken: today's at the desk, with receipts.",
    task: "Find a receipt",
    steps: ["Search by receipt number (RCT-…), reference or guest.", "Open the receipt to print it again (it says COPY).", "A wrong payment is fixed by a manager with a correction, never edited."],
  },
  "/app/payments/record": {
    purpose: "Take payment for a booking: cash, transfer or POS.",
    task: "Take payment",
    steps: [
      "Check the amount owed at the top.",
      "Choose cash, transfer or POS.",
      "Transfer: type the reference and tick that you've seen it in the hotel's bank app. POS: type the slip's last 4 digits.",
      "Confirm. The receipt number shows when it's saved.",
    ],
  },
  "/app/payments/confirm": {
    purpose: "Transfer and POS payments for the general manager or owner to check against the bank and the terminal.",
    task: "Confirm payments",
    steps: ["Open the bank statement and the terminal's report for the same days.", "Matches: tick it off.", "Not found: say what you checked. The booking is flagged for a correction."],
  },
  "/app/events": {
    purpose: "Hall bookings: enquiries, confirmed events and what's owed.",
    task: "Book the hall",
    steps: ["New hall booking with the customer, date and times.", "Take the deposit or full payment.", "Print the invoice for the customer."],
  },
  "/app/sales": {
    purpose: "The till: orders and payments at the restaurant and the bar.",
    task: "Take an order",
    steps: [
      "Tap items on the menu (search if you can't see it). Tap a line to add a note like No ice.",
      "Pick the table or type a name.",
      "Take payment now, or Save as unpaid to keep the tab open.",
      "Cash: tap what the customer gave and give the change shown. Transfer: reference and the bank-app tick. POS: the slip's last 4 digits.",
    ],
  },
  "/app/sales/orders": {
    purpose: "Every order and receipt from the restaurant and bar.",
    task: "Print a receipt again",
    steps: ["Search by receipt number or order number.", "Open the sale and Print: it says COPY.", "A wrong sale is voided by a manager with a reason."],
  },
  "/app/sales/closing": {
    purpose: "Close your day: count your cash before you see what's expected.",
    task: "Close the day",
    steps: ["Count the cash in your drawer.", "Type the total and submit your count.", "If it doesn't match, say what happened. The manager checks every closing."],
  },
  "/app/sales/menu": {
    purpose: "What the restaurant and bar sell, at what price, and what's available today.",
    task: "Change the menu",
    steps: ["Add or edit an item with its price and counter.", "Mark an item unavailable today when it runs out in the kitchen.", "Link drinks to stock so the till counts them down."],
  },
  "/app/sales/reports": {
    purpose: "Restaurant and bar sales by day, counter, item and payment method.",
    task: "Check yesterday's sales",
    steps: ["Choose the day or range.", "Compare cash with the closings and transfers with the bank.", "Best sellers and voids are below; download the CSV for the accountant."],
  },
  "/app/stock": {
    purpose: "Drinks and supplies in stock, with every delivery and count.",
    task: "Record a delivery",
    steps: ["Find the item.", "Record the delivery with the quantity.", "Count regularly; a difference is recorded with a reason."],
  },
  "/app": {
    purpose: "How the hotel is doing today, and what needs a manager.",
    task: "Read the dashboard",
    steps: ["Start with Needs attention: payments to confirm and flagged bookings.", "Today's money and occupancy are below.", "Reports has the detail by day and month."],
  },
  "/app/reports": {
    purpose: "Money and occupancy by day and month, for managers and finance.",
    task: "Get this month's figures",
    steps: ["Choose the month or range.", "Read income by department and method.", "Download the CSV for the accountant."],
  },
  "/app/rooms/categories": {
    purpose: "Room types and their nightly rates, photos and rooms.",
    task: "Change a rate",
    steps: ["Open the room type.", "Change the nightly rate and save. Bookings already made keep their rate.", "Add photos guests will see on the website."],
  },
  "/app/settings": {
    purpose: "The hotel's booking rules: hold times, cancellation, extras and promo codes.",
    task: "Change a booking rule",
    steps: ["Find the rule: hold times, cancellation, extras or promo codes.", "Change it and save.", "New bookings follow it at once; bookings already made keep theirs."],
  },
  "/app/staff": {
    purpose: "Who can sign in, and what each person's role lets them do.",
    task: "Add a staff member",
    steps: ["Invite them by email with their role.", "They sign up from the email.", "When someone leaves, remove their access the same day."],
  },
};

export function helpFor(pathname: string): ScreenHelp | null {
  if (screenHelp[pathname]) return screenHelp[pathname]!;
  for (const [pattern, help] of Object.entries(screenHelp)) {
    if (!pattern.includes("[")) continue;
    const re = new RegExp(`^${pattern.replace(/\[[^\]]+\]/g, "[^/]+")}$`);
    if (re.test(pathname)) return help;
  }
  return null;
}

/** "Your first day" on the account page: the main jobs for the role, ticked off as each is done once. */
export type FirstDayItem = { key: string; label: string; how: string; href: string };

const desk: FirstDayItem[] = [
  { key: "walk_in", label: "Take a walk-in", how: "New booking, type the phone number, pick a room type.", href: "/app/reservations/new" },
  { key: "payment", label: "Take a payment", how: "From the booking, Take payment, then cash, transfer or POS.", href: "/app/today" },
  { key: "check_in", label: "Check a guest in", how: "On Today, once they've paid and the room is ready.", href: "/app/today" },
  { key: "check_out", label: "Check a guest out", how: "On Today, after taking anything owed.", href: "/app/today" },
  { key: "room_clean", label: "Mark a room clean", how: "Rooms, find the room, mark it ready.", href: "/app/rooms" },
];
const bar: FirstDayItem[] = [
  { key: "order", label: "Take an order", how: "Tap items on the till, pick the table.", href: "/app/sales" },
  { key: "cash_sale", label: "Take a cash sale", how: "Take payment, Cash, tap what the customer gave.", href: "/app/sales" },
  { key: "transfer_sale", label: "Take a transfer with its reference", how: "Transfer, the reference, and the bank-app tick.", href: "/app/sales" },
  { key: "close_day", label: "Close your day", how: "Daily closing, count your cash first.", href: "/app/sales/closing" },
];

export const firstDay: Partial<Record<StaffRole, FirstDayItem[]>> = {
  front_desk: desk,
  restaurant_bar: bar,
  restaurant_bar_manager: bar,
};
