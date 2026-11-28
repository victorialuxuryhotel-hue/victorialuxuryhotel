import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/format";
import { addDays, BUSINESS_DAY_START_HOUR, businessDate, businessDayStart, hotelInstant } from "@/lib/hotel-date";
import { dbErrorToken } from "../db-errors";
import { can } from "@/lib/auth/permissions";
import { checkDetails, duplicateError, duplicateWarning, type Details } from "./payment-details";
import { ROLE } from "./admin";
import { checkPin, type Station } from "./stations";
import {
  activity,
  activityIfChanged,
  all,
  first,
  POS_MANAGERS,
  POS_SELLERS,
  POS_VIEWERS,
  requireRole,
  uuid,
  writeBatch,
  type Actor,
  type Db,
  type StaffRole,
} from "../db";

export type Outlet = "restaurant" | "bar";
export type PayMethod = "cash" | "bank_transfer" | "pos_terminal";
export type MenuCategory = "meals" | "snacks" | "soft_drinks" | "alcoholic_drinks" | "other";
export type OrderStatus = "open" | "paid" | "cancelled" | "void";

export const OUTLETS: Record<Outlet, string> = { restaurant: "Restaurant", bar: "Bar" };
export const PAY_METHODS: Record<PayMethod, string> = { cash: "Cash", bank_transfer: "Bank transfer", pos_terminal: "POS / card" };
export const MENU_CATEGORIES: Record<MenuCategory, string> = {
  meals: "Meals", snacks: "Snacks", soft_drinks: "Soft drinks", alcoholic_drinks: "Alcoholic drinks", other: "Other",
};
export const ORDER_STATUS: Record<OrderStatus, string> = { open: "Unpaid", paid: "Paid", cancelled: "Cancelled", void: "Voided" };

const ALL_POS = [...new Set([...POS_SELLERS, ...POS_VIEWERS])] as StaffRole[];
const naira = (k: number) => formatNaira(k).replace(/\s/g, "");
const dayStart = (d: string) => businessDayStart(d);

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export type MenuItem = {
  id: string; name: string; outlet: Outlet; category: MenuCategory; price_kobo: number; is_active: number; is_available: number;
  /** How many can be sold from stock; null = made to order (no stock tracked). */
  stock_left: number | null;
  /** A stock item behind it is at or below its reorder level (the till shows "N left"). */
  low: boolean;
  links: { stockItemId: string; name: string; unit: string; quantity: number }[];
};

export async function listMenu(db: Db, actor: Actor, opts: { includeInactive?: boolean } = {}): Promise<MenuItem[]> {
  requireRole(actor, ALL_POS);
  const [items, links] = await Promise.all([
    all<Omit<MenuItem, "links" | "stock_left">>(
      db,
      `SELECT id, name, outlet, category, price_kobo, is_active, is_available FROM menu_items
       ${opts.includeInactive ? "" : "WHERE is_active = 1"} ORDER BY outlet, is_active DESC, sort_order, name`,
    ),
    all<{ menu_item_id: string; stock_item_id: string; name: string; unit: string; quantity: number; on_hand: number; min_quantity: number }>(
      db,
      `SELECT l.menu_item_id, l.stock_item_id, s.name, s.unit, l.quantity, s.quantity AS on_hand, s.min_quantity
       FROM menu_item_stock l JOIN stock_items s ON s.id = l.stock_item_id ORDER BY s.name`,
    ),
  ]);
  return items.map((m) => {
    const mine = links.filter((l) => l.menu_item_id === m.id);
    return {
      ...m,
      links: mine.map((l) => ({ stockItemId: l.stock_item_id, name: l.name, unit: l.unit, quantity: l.quantity })),
      stock_left: mine.length ? Math.min(...mine.map((l) => Math.floor(l.on_hand / l.quantity))) : null,
      low: mine.some((l) => l.on_hand <= l.min_quantity),
    };
  });
}

export async function saveMenuItem(
  db: Db,
  actor: Actor,
  v: { id?: string; name: string; outlet: Outlet; category: MenuCategory; priceKobo: number; available: boolean; active: boolean },
): Promise<string> {
  requireRole(actor, POS_MANAGERS);
  const name = v.name.trim();
  if (name.length < 2 || name.length > 80) throw new AppError("VALIDATION", "Enter the item's name.");
  if (!Number.isInteger(v.priceKobo) || v.priceKobo <= 0 || v.priceKobo > 1_000_000_000) throw new AppError("VALIDATION", "Enter a price.");
  if (!(v.outlet in OUTLETS) || !(v.category in MENU_CATEGORIES)) throw new AppError("VALIDATION", "Choose where it's sold and its category.");
  const id = v.id ?? uuid();
  const flags = [v.available ? 1 : 0, v.active ? 1 : 0] as const;
  const [r] = await writeBatch(db, actor, [
    v.id
      ? db
          .prepare(
            `UPDATE menu_items SET name = ?1, outlet = ?2, category = ?3, price_kobo = ?4, is_available = ?5, is_active = ?6 WHERE id = ?7
               AND (name IS NOT ?1 OR outlet IS NOT ?2 OR category IS NOT ?3 OR price_kobo IS NOT ?4 OR is_available IS NOT ?5 OR is_active IS NOT ?6)`,
          )
          .bind(name, v.outlet, v.category, v.priceKobo, ...flags, id)
      : db.prepare("INSERT INTO menu_items (id, name, outlet, category, price_kobo, is_available, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, name, v.outlet, v.category, v.priceKobo, ...flags),
    activityIfChanged(
      db,
      v.id ? "menu.item_changed" : "menu.item_added",
      "menu_item",
      id,
      `${OUTLETS[v.outlet]} menu: ${name}, ${naira(v.priceKobo)}${v.active ? (v.available ? "" : " (unavailable today)") : " (taken off the menu)"}`,
    ),
  ]);
  if (v.id && !r?.meta.changes && !(await first(db, "SELECT 1 FROM menu_items WHERE id = ?", id))) throw new AppError("NOT_FOUND", "Menu item not found.");
  return id;
}

export async function setMenuItemStock(db: Db, actor: Actor, menuItemId: string, links: { stockItemId: string; quantity: number }[]): Promise<void> {
  requireRole(actor, POS_MANAGERS);
  if (links.length > 20) throw new AppError("VALIDATION", "Link at most 20 stock items.");
  const seen = new Set<string>();
  for (const l of links) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 1000) throw new AppError("VALIDATION", "Each stock quantity must be a whole number from 1.");
    if (seen.has(l.stockItemId)) throw new AppError("VALIDATION", "Each stock item can be linked once.");
    seen.add(l.stockItemId);
  }
  const item = await first<{ name: string }>(db, "SELECT name FROM menu_items WHERE id = ?", menuItemId);
  if (!item) throw new AppError("NOT_FOUND", "Menu item not found.");
  const names = links.length
    ? await all<{ id: string; name: string; unit: string }>(db, `SELECT id, name, unit FROM stock_items WHERE id IN (${links.map(() => "?").join(",")})`, ...links.map((l) => l.stockItemId))
    : [];
  if (names.length !== links.length) throw new AppError("VALIDATION", "Choose stock items from the list.");
  const label = links.map((l) => { const s = names.find((n) => n.id === l.stockItemId)!; return `${l.quantity} ${s.unit} ${s.name}`; }).join(", ");
  try {
    await writeBatch(db, actor, [
      db.prepare("DELETE FROM menu_item_stock WHERE menu_item_id = ?").bind(menuItemId),
      ...links.map((l) => db.prepare("INSERT INTO menu_item_stock (menu_item_id, stock_item_id, quantity) VALUES (?, ?, ?)").bind(menuItemId, l.stockItemId, l.quantity)),
      activity(db, "menu.stock_linked", "menu_item", menuItemId, links.length ? `${item.name} uses ${label}` : `${item.name} no longer takes stock`),
    ]);
  } catch (err) {
    if (err instanceof AppError && dbErrorToken(err.cause) === "foreign_key") throw new AppError("VALIDATION", "Choose stock items from the list.");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** One line of an order. The same item with a different note ("No ice") is a separate line. */
export type OrderLine = { menuItemId: string; quantity: number; note?: string | null };

type Priced = { menuItemId: string; name: string; category: MenuCategory; unitKobo: number; quantity: number; note: string | null };

const cleanNote = (n: string | null | undefined) => n?.trim().replace(/\s+/g, " ").slice(0, 60) || null;
const lineKey = (l: { menuItemId: string; note?: string | null }) => `${l.menuItemId}\u0001${cleanNote(l.note) ?? ""}`;

async function price(db: Db, outlet: Outlet, lines: OrderLine[]): Promise<{ priced: Priced[]; totalKobo: number }> {
  if (!lines.length) throw new AppError("VALIDATION", "Add at least one item.");
  if (lines.length > 50) throw new AppError("VALIDATION", "That's too many lines for one order.");
  // Same item and same note: one line. Same item, different notes: separate lines.
  const merged = new Map<string, { menuItemId: string; note: string | null; quantity: number }>();
  const perItem = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new AppError("VALIDATION", "Quantities must be whole numbers from 1.");
    const k = lineKey(l);
    const m = merged.get(k) ?? { menuItemId: l.menuItemId, note: cleanNote(l.note), quantity: 0 };
    m.quantity += l.quantity;
    merged.set(k, m);
    perItem.set(l.menuItemId, (perItem.get(l.menuItemId) ?? 0) + l.quantity);
  }
  const ids = [...perItem.keys()];
  const menu = await all<{ id: string; name: string; outlet: Outlet; category: MenuCategory; price_kobo: number; is_active: number; is_available: number }>(
    db,
    `SELECT id, name, outlet, category, price_kobo, is_active, is_available FROM menu_items WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  for (const id of ids) {
    const m = menu.find((x) => x.id === id);
    if (!m || !m.is_active) throw new AppError("VALIDATION", "An item is no longer on the menu. Remove it and try again.");
    if (!m.is_available) throw new AppError("VALIDATION", `${m.name} is unavailable today.`);
    if (m.outlet !== outlet) throw new AppError("VALIDATION", `${m.name} is on the ${OUTLETS[m.outlet].toLowerCase()} menu.`);
    if (perItem.get(id)! > 99) throw new AppError("VALIDATION", `At most 99 × ${m.name} in one order.`);
  }
  const priced = [...merged.values()].map((l) => {
    const m = menu.find((x) => x.id === l.menuItemId)!;
    return { menuItemId: l.menuItemId, name: m.name, category: m.category, unitKobo: m.price_kobo, quantity: l.quantity, note: l.note };
  });
  return { priced, totalKobo: priced.reduce((s, p) => s + p.unitKobo * p.quantity, 0) };
}

/** Names the first stock item that can't cover these lines, so the attendant sees why. */
async function checkStock(db: Db, lines: { menuItemId: string; quantity: number }[]): Promise<void> {
  if (!lines.length) return;
  const need = await all<{ stock_item_id: string; name: string; unit: string; on_hand: number; per: number; menu_item_id: string }>(
    db,
    `SELECT l.stock_item_id, s.name, s.unit, s.quantity AS on_hand, l.quantity AS per, l.menu_item_id
     FROM menu_item_stock l JOIN stock_items s ON s.id = l.stock_item_id WHERE l.menu_item_id IN (${lines.map(() => "?").join(",")})`,
    ...lines.map((l) => l.menuItemId),
  );
  const total = new Map<string, { name: string; unit: string; on_hand: number; need: number }>();
  // An item can be on several lines (different notes): count them all.
  const qtyOf = new Map<string, number>();
  for (const l of lines) qtyOf.set(l.menuItemId, (qtyOf.get(l.menuItemId) ?? 0) + l.quantity);
  for (const n of need) {
    const qty = qtyOf.get(n.menu_item_id)!;
    const t = total.get(n.stock_item_id) ?? { name: n.name, unit: n.unit, on_hand: n.on_hand, need: 0 };
    t.need += n.per * qty;
    total.set(n.stock_item_id, t);
  }
  for (const t of total.values()) {
    if (t.need > t.on_hand) throw new AppError("VALIDATION", `Not enough ${t.name} in stock: ${t.on_hand} ${t.unit} left, ${t.need} needed. A manager can record the delivery or fix the count.`);
  }
}

async function assertNotClosed(db: Db, staffId: string): Promise<void> {
  if (await first(db, "SELECT 1 FROM pos_closings WHERE staff_id = ? AND business_date = ?", staffId, businessDate())) {
    throw new AppError("CONFLICT", "You've already closed today's sales. Ask a manager if you need to sell more today.");
  }
}

const orderInsert = (db: Db, id: string, outlet: Outlet, totalKobo: number, note: string | null, staffId: string) => [
  db.prepare("UPDATE pos_counters SET value = value + 1 WHERE name = 'order'"),
  db
    .prepare("INSERT INTO pos_orders (id, number, outlet, total_kobo, note, created_by) VALUES (?, (SELECT value FROM pos_counters WHERE name = 'order'), ?, ?, ?, ?)")
    .bind(id, outlet, totalKobo, note, staffId),
];

const lineInserts = (db: Db, id: string, priced: Priced[]) =>
  priced.map((p, i) =>
    db
      .prepare("INSERT INTO pos_order_items (order_id, line, menu_item_id, name, category, unit_price_kobo, quantity, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, i + 1, p.menuItemId, p.name, p.category, p.unitKobo, p.quantity, p.note),
  );

function payStatements(db: Db, id: string, staffId: string, method: PayMethod, totalKobo: number, cashReceivedKobo: number | null, d: Details) {
  return [
    db.prepare("UPDATE pos_counters SET value = value + 1 WHERE name = 'receipt'"),
    db
      .prepare(
        `UPDATE pos_orders SET status = 'paid', method = ?, paid_by = ?, cash_received_kobo = ?, payment_reference = ?, sender_name = ?, slip_last4 = ?, terminal = ?,
           seen_in_bank_app = ?, paid_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           receipt_number = 'RB-' || strftime('%Y', 'now', '+1 hour') || '-' || printf('%06d', (SELECT value FROM pos_counters WHERE name = 'receipt'))
         WHERE id = ? AND status = 'open' AND total_kobo = ?`,
      )
      .bind(method, staffId, cashReceivedKobo, d.reference, d.senderName, d.slipLast4, d.terminal, d.seenInBankApp ? 1 : 0, id, totalKobo),
    db.prepare("INSERT INTO _guard (ok) SELECT 0 WHERE changes() = 0"),
    db
      .prepare(
        `INSERT INTO stock_moves (item_id, change, kind, order_id, staff_id)
         SELECT l.stock_item_id, -sum(l.quantity * i.quantity), 'sold', ?1, ?2
         FROM pos_order_items i JOIN menu_item_stock l ON l.menu_item_id = i.menu_item_id
         WHERE i.order_id = ?1 GROUP BY l.stock_item_id`,
      )
      .bind(id, staffId),
  ];
}

function validCash(method: PayMethod, totalKobo: number, cashReceivedKobo: number | null | undefined): number | null {
  if (method !== "cash" || cashReceivedKobo == null) return null;
  if (!Number.isInteger(cashReceivedKobo) || cashReceivedKobo < totalKobo) throw new AppError("VALIDATION", `The customer must give at least ${naira(totalKobo)}.`);
  if (cashReceivedKobo > totalKobo + 100_000_000) throw new AppError("VALIDATION", "Check the amount the customer gave.");
  return cashReceivedKobo;
}

async function payFailed(db: Db, err: unknown, lines: { menuItemId: string; quantity: number }[]): Promise<never> {
  const token = err instanceof AppError ? dbErrorToken(err.cause) : null;
  if (token === "check") {
    await checkStock(db, lines);
    throw new AppError("VALIDATION", "Not enough stock for this order. A manager can record the delivery or fix the count.");
  }
  if (err instanceof Error && err.name === "StaleStateError") throw new AppError("CONFLICT", "This order was just changed or paid by someone else. Reload and check it.");
  throw err;
}

const isUnique = (err: unknown) => err instanceof AppError && dbErrorToken(err.cause) === "unique";

async function orderState(db: Db, id: string) {
  return first<{ status: OrderStatus; outlet: Outlet; total_kobo: number }>(db, "SELECT status, outlet, total_kobo FROM pos_orders WHERE id = ?", id);
}

/** The lines added since the order was last saved: "Same again" repeats them. */
export function addedLines(before: OrderLine[], after: OrderLine[]): OrderLine[] {
  const had = new Map<string, number>();
  for (const l of before) had.set(lineKey(l), (had.get(lineKey(l)) ?? 0) + l.quantity);
  const out: OrderLine[] = [];
  for (const l of after) {
    const k = lineKey(l);
    const extra = l.quantity - (had.get(k) ?? 0);
    had.set(k, Math.max(0, (had.get(k) ?? 0) - l.quantity));
    if (extra > 0) out.push({ menuItemId: l.menuItemId, quantity: extra, note: cleanNote(l.note) });
  }
  return out;
}

const replaceLines = (db: Db, id: string, priced: Priced[], totalKobo: number, note: string | null) => [
  db.prepare("DELETE FROM pos_order_items WHERE order_id = ?").bind(id),
  ...lineInserts(db, id, priced),
  db.prepare("UPDATE pos_orders SET total_kobo = ?, note = ? WHERE id = ? AND status = 'open'").bind(totalKobo, note, id),
  db.prepare("INSERT INTO _guard (ok) SELECT 0 WHERE changes() = 0"),
];

/**
 * Save an unpaid order. The till makes the order's id when the order starts, so
 * saving again (or a retry after a dropped connection) updates the same order.
 */
export async function saveOrder(
  db: Db,
  actor: Actor,
  v: { id: string; outlet: Outlet; lines: OrderLine[]; note?: string | null },
): Promise<{ id: string; number: number; totalKobo: number }> {
  requireRole(actor, POS_SELLERS);
  await assertNotClosed(db, actor.id);
  const { priced, totalKobo } = await price(db, v.outlet, v.lines);
  await checkStock(db, priced);
  const note = v.note?.trim().slice(0, 120) || null;
  const update = async () => {
    const cur = await orderState(db, v.id);
    if (!cur) throw new AppError("NOT_FOUND", "Order not found.");
    if (cur.status === "paid") throw new AppError("CONFLICT", "This order is already paid.");
    if (cur.status !== "open") throw new AppError("INVALID_TRANSITION", "This order was cancelled.");
    if (cur.outlet !== v.outlet) throw new AppError("VALIDATION", "An order stays with the counter it was opened at.");
    const before = await all<OrderLine>(db, "SELECT menu_item_id AS menuItemId, quantity, note FROM pos_order_items WHERE order_id = ?", v.id);
    const round = addedLines(before, priced);
    await writeBatch(db, actor, [
      ...replaceLines(db, v.id, priced, totalKobo, note),
      ...(round.length ? [db.prepare("UPDATE pos_orders SET last_round = ? WHERE id = ? AND status = 'open'").bind(JSON.stringify(round), v.id)] : []),
    ]).catch((err) => payFailed(db, err, priced));
  };
  if (await orderState(db, v.id)) await update();
  else {
    try {
      await writeBatch(db, actor, [
        ...orderInsert(db, v.id, v.outlet, totalKobo, note, actor.id),
        ...lineInserts(db, v.id, priced),
        db.prepare("UPDATE pos_orders SET last_round = ? WHERE id = ?").bind(JSON.stringify(addedLines([], priced)), v.id),
        activity(db, "pos.order_opened", "pos_order", v.id, `${OUTLETS[v.outlet]} order opened: ${naira(totalKobo)} (unpaid)`),
      ]);
    } catch (err) {
      if (!isUnique(err)) throw err;
      await update();
    }
  }
  const row = await first<{ number: number }>(db, "SELECT number FROM pos_orders WHERE id = ?", v.id);
  return { id: v.id, number: row!.number, totalKobo };
}

export type PaidOrder = { id: string; number: number; receiptNumber: string; totalKobo: number; changeKobo: number | null; alreadyPaid: boolean };

async function paidResult(db: Db, id: string, alreadyPaid: boolean): Promise<PaidOrder> {
  const r = await first<{ number: number; receipt_number: string; total_kobo: number; cash_received_kobo: number | null }>(
    db,
    "SELECT number, receipt_number, total_kobo, cash_received_kobo FROM pos_orders WHERE id = ? AND status IN ('paid', 'void')",
    id,
  );
  if (!r) throw new AppError("CONFLICT", "This order was just changed. Reload and check it.");
  return { id, number: r.number, receiptNumber: r.receipt_number, totalKobo: r.total_kobo, changeKobo: r.cash_received_kobo == null ? null : r.cash_received_kobo - r.total_kobo, alreadyPaid };
}

/**
 * Take payment for the order with this id. With `lines`, the order is created or
 * updated to exactly those lines at today's prices first (what the screen shows),
 * in the same step. Paying the same id again returns the first receipt: a retry
 * after a dropped connection never records a second sale.
 */
export async function payOrder(
  db: Db,
  actor: Actor,
  v: {
    id: string; outlet?: Outlet; lines?: OrderLine[]; note?: string | null; method: PayMethod; cashReceivedKobo?: number | null;
    /**
     * Transfer: the reference or the sender's name (either), plus the "seen in the hotel's bank app" tick.
     * POS / card: exactly the last 4 digits of the slip and the terminal, to match the terminal's own report.
     */
    paymentReference?: string | null; senderName?: string | null; transferChecked?: boolean; slipLast4?: string | null; terminal?: string | null;
    /** Record even though the same reference or slip was used in the last 7 days. */
    duplicateOk?: boolean;
  },
): Promise<PaidOrder> {
  requireRole(actor, POS_SELLERS);
  if (!(v.method in PAY_METHODS)) throw new AppError("VALIDATION", "Choose how the customer paid.");
  const details = await checkDetails(db, { method: v.method, reference: v.paymentReference, senderName: v.senderName, slipLast4: v.slipLast4, terminal: v.terminal, seenInBankApp: v.transferChecked });
  const cur = await orderState(db, v.id);
  if (cur?.status === "paid" || cur?.status === "void") return paidResult(db, v.id, true);
  if (cur?.status === "cancelled") throw new AppError("INVALID_TRANSITION", "This order was cancelled.");
  await assertNotClosed(db, actor.id);

  let totalKobo: number;
  let lines: { menuItemId: string; quantity: number }[];
  const stmts = [];
  const note = v.note?.trim().slice(0, 120) || null;
  if (v.lines) {
    const outlet = cur?.outlet ?? v.outlet;
    if (!outlet) throw new AppError("VALIDATION", "Choose the counter.");
    if (cur && v.outlet && v.outlet !== cur.outlet) throw new AppError("VALIDATION", "An order stays with the counter it was opened at.");
    const p = await price(db, outlet, v.lines);
    totalKobo = p.totalKobo;
    lines = p.priced;
    stmts.push(...(cur ? replaceLines(db, v.id, p.priced, totalKobo, note) : [...orderInsert(db, v.id, outlet, totalKobo, note, actor.id), ...lineInserts(db, v.id, p.priced)]));
  } else {
    if (!cur) throw new AppError("NOT_FOUND", "Order not found.");
    totalKobo = cur.total_kobo;
    lines = await all<{ menuItemId: string; quantity: number }>(db, "SELECT menu_item_id AS menuItemId, quantity FROM pos_order_items WHERE order_id = ?", v.id);
    if (!lines.length) throw new AppError("VALIDATION", "Add at least one item.");
  }
  await checkStock(db, lines);
  const cash = validCash(v.method, totalKobo, v.cashReceivedKobo);
  if (!v.duplicateOk) {
    const dup = await duplicateWarning(db, v.method, details, totalKobo);
    if (dup) throw duplicateError(dup);
  }
  stmts.push(
    ...payStatements(db, v.id, actor.id, v.method, totalKobo, cash, details),
    activity(db, "pos.order_paid", "pos_order", v.id, `Sale ${naira(totalKobo)} paid by ${PAY_METHODS[v.method].toLowerCase()}`, { method: v.method, total_kobo: totalKobo }),
  );
  try {
    await writeBatch(db, actor, stmts);
  } catch (err) {
    const now = await orderState(db, v.id);
    if (now?.status === "paid" || now?.status === "void") return paidResult(db, v.id, true);
    if (isUnique(err)) throw new AppError("CONFLICT", "This order was just changed. Try again.");
    await payFailed(db, err, lines);
  }
  return paidResult(db, v.id, false);
}

/** Drop an unpaid order. It stays on record as cancelled. */
/** Cancel an unpaid order. A reason is required (rules 2.5); the manager sees it in Sales reports. */
export async function cancelOrder(db: Db, actor: Actor, id: string, reason: string | null): Promise<void> {
  requireRole(actor, POS_SELLERS);
  const why = reason?.trim() ?? "";
  if (why.length < 3) throw new AppError("VALIDATION", "Say why the order is cancelled. The manager sees this.");
  const [r] = await writeBatch(db, actor, [
    db
      .prepare("UPDATE pos_orders SET status = 'cancelled', closed_by = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), close_reason = ? WHERE id = ? AND status = 'open'")
      .bind(actor.id, why.slice(0, 200), id),
    activityIfChanged(db, "pos.order_cancelled", "pos_order", id, `Unpaid order cancelled: ${why}`),
  ]);
  if (!r?.meta.changes) throw new AppError("INVALID_TRANSITION", "Only unpaid orders can be cancelled.");
}

/** A manager reverses a paid sale: reason recorded, stock put back, original kept. */
export const VOID_REASONS = {
  rung_up_wrongly: "Rung up wrongly",
  customer_changed_mind: "Customer changed mind",
  item_unavailable: "Item unavailable",
  other: "Other",
} as const;
export type VoidReason = keyof typeof VOID_REASONS;

/** Who can approve a void at the counter: restaurant & bar manager, general manager, owner (pos.void.approve). */
export async function voidApprovers(db: Db): Promise<{ id: string; fullName: string }[]> {
  const roles = (["restaurant_bar_manager", "general_manager", "owner"] as const).filter((r) => can(r, "pos.void.approve"));
  return all<{ id: string; fullName: string }>(
    db,
    `SELECT id, full_name AS fullName FROM (SELECT id, full_name, ${ROLE} AS role FROM staff_profiles WHERE is_active = 1 AND pin_hash IS NOT NULL)
     WHERE role IN (${roles.map(() => "?").join(", ")}) ORDER BY full_name`,
    ...roles,
  );
}

/**
 * Void a paid sale at the counter (FUNCTIONALITY.md section 3, design X9). The salesperson picks a reason (a note
 * for Other) and, for cash, ticks that the money went back; a manager who didn't make the sale approves:
 * - on a shared station, by picking their name and entering their PIN there (it doesn't change who is signed in);
 *   3 wrong PINs refuse the void and the manager is told at their next sign-in;
 * - off a station (a manager signed in with their own account), the signed-in manager is the approver.
 * Stock is put back; the closing's expected cash drops because only paid sales count.
 */
export async function voidOrder(
  db: Db,
  actor: Actor,
  v: { id: string; reasonCode: VoidReason; note?: string | null; cashReturned?: boolean; approver?: { staffId: string; pin: string } | null },
  ctx: { station?: Station | null; pepper?: string } = {},
): Promise<{ approvedBy: string }> {
  if (!actor || !can(actor.role, "pos.sell") && !can(actor.role, "pos.void.approve")) throw new AppError("FORBIDDEN", "Your role can't do this. Ask the General Manager or the Owner.");
  if (!(v.reasonCode in VOID_REASONS)) throw new AppError("VALIDATION", "Choose why the sale is being voided.", { fieldErrors: { reasonCode: ["Choose a reason"] } });
  const note = v.note?.trim().slice(0, 160) || null;
  if (v.reasonCode === "other" && (!note || note.length < 3)) throw new AppError("VALIDATION", "Say what happened.", { fieldErrors: { note: ["Say what happened"] } });
  const o = await first<{ status: OrderStatus; total_kobo: number; receipt_number: string | null; method: PayMethod | null; paid_by: string | null }>(
    db,
    "SELECT status, total_kobo, receipt_number, method, paid_by FROM pos_orders WHERE id = ?",
    v.id,
  );
  if (!o) throw new AppError("NOT_FOUND", "Order not found.");
  if (o.status !== "paid") throw new AppError("INVALID_TRANSITION", o.status === "open" ? "This order isn't paid: cancel it instead." : "Only paid sales can be voided.");
  if (o.method === "cash" && v.cashReturned !== true) throw new AppError("VALIDATION", "Give the customer their cash back first, then tick the box.", { fieldErrors: { cashReturned: ["Tick once the cash is returned"] } });

  let approver: { id: string; name: string };
  if (ctx.station) {
    if (!v.approver) throw new AppError("VALIDATION", "A manager picks their name and enters their PIN to approve.", { fieldErrors: { approver: ["Manager's PIN needed"] } });
    if (!(await voidApprovers(db)).some((a) => a.id === v.approver!.staffId)) throw new AppError("FORBIDDEN", "That person can't approve voids.");
    if (v.approver.staffId === o.paid_by) throw new AppError("FORBIDDEN", "The manager who approves can't be the person who made the sale. Ask another manager.");
    const who = await checkPin(db, ctx.station, v.approver.staffId, v.approver.pin, "approve", ctx.pepper ?? "", 3);
    approver = { id: who.id, name: who.full_name };
  } else {
    if (!can(actor.role, "pos.void.approve")) throw new AppError("FORBIDDEN", "A void needs a manager's approval. Open it on the till so a manager can enter their PIN.");
    if (actor.id === o.paid_by) throw new AppError("FORBIDDEN", "You made this sale, so another manager approves the void.");
    const me = await first<{ full_name: string }>(db, "SELECT full_name FROM staff_profiles WHERE id = ?", actor.id);
    approver = { id: actor.id, name: me?.full_name ?? "Manager" };
  }
  const seller = await first<{ full_name: string }>(db, "SELECT full_name FROM staff_profiles WHERE id = ?", actor.id);
  const why = `${VOID_REASONS[v.reasonCode]}${note ? `: ${note}` : ""}`;
  const [r] = await writeBatch(db, actor, [
    db
      .prepare(
        `UPDATE pos_orders SET status = 'void', closed_by = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), close_reason = ?,
           void_approved_by = ?, void_reason_code = ?, void_cash_returned = ? WHERE id = ? AND status = 'paid'`,
      )
      .bind(actor.id, why.slice(0, 200), approver.id, v.reasonCode, o.method === "cash" ? 1 : v.cashReturned ? 1 : 0, v.id),
    db
      .prepare(
        `INSERT INTO stock_moves (item_id, change, kind, order_id, staff_id, note)
         SELECT item_id, -sum(change), 'returned', ?1, ?2, 'Sale voided' FROM stock_moves WHERE order_id = ?1 AND kind = 'sold' AND changes() > 0 GROUP BY item_id`,
      )
      .bind(v.id, actor.id),
    activity(db, "pos.order_voided", "pos_order", v.id, `Sale ${o.receipt_number} (${naira(o.total_kobo)}) voided by ${seller?.full_name ?? "staff"}, approved by ${approver.name}: ${why}`, {
      approved_by: approver.id,
      reason: v.reasonCode,
    }),
  ]);
  if (!r?.meta.changes) throw new AppError("CONFLICT", "This sale was just changed. Reload and check it.");
  return { approvedBy: approver.name };
}

// ---------------------------------------------------------------------------
// Reading orders
// ---------------------------------------------------------------------------

export type OrderRow = {
  id: string; number: number; outlet: Outlet; status: OrderStatus; total_kobo: number; method: PayMethod | null; payment_reference: string | null; receipt_number: string | null;
  note: string | null; created_at: string; paid_at: string | null; taken_by: string | null; created_by_name: string | null; items: string;
};

const ORDER_SELECT = `SELECT o.id, o.number, o.outlet, o.status, o.total_kobo, o.method, coalesce(o.payment_reference, o.slip_last4, o.sender_name) AS payment_reference, o.receipt_number, o.note, o.created_at, o.paid_at,
  p.full_name AS taken_by, c.full_name AS created_by_name,
  (SELECT group_concat(i.quantity || ' × ' || i.name || coalesce(' (' || i.note || ')', ''), ', ') FROM pos_order_items i WHERE i.order_id = o.id) AS items
  FROM pos_orders o LEFT JOIN staff_profiles p ON p.id = o.paid_by LEFT JOIN staff_profiles c ON c.id = o.created_by`;

const sees = (actor: NonNullable<Actor>) => (POS_VIEWERS as readonly StaffRole[]).includes(actor.role);

/** The till's favourites row: each counter's 8 best sellers by quantity over the last 30 days. */
export async function topSellers(db: Db, actor: Actor, days = 30, limit = 8): Promise<Record<Outlet, string[]>> {
  requireRole(actor, ALL_POS);
  const rows = await all<{ outlet: Outlet; menu_item_id: string }>(
    db,
    `SELECT outlet, menu_item_id FROM (
       SELECT o.outlet, i.menu_item_id, sum(i.quantity) AS qty,
              row_number() OVER (PARTITION BY o.outlet ORDER BY sum(i.quantity) DESC, i.menu_item_id) AS rank
       FROM pos_order_items i JOIN pos_orders o ON o.id = i.order_id
       WHERE o.status = 'paid' AND o.paid_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
       GROUP BY o.outlet, i.menu_item_id)
     WHERE rank <= ? ORDER BY outlet, rank`,
    `-${days} days`,
    limit,
  );
  const out: Record<Outlet, string[]> = { restaurant: [], bar: [] };
  for (const r of rows) out[r.outlet].push(r.menu_item_id);
  return out;
}

export type OpenOrder = OrderRow & { lines: OrderLine[]; lastRound: OrderLine[] };

export async function openOrders(db: Db, actor: Actor): Promise<OpenOrder[]> {
  requireRole(actor, POS_SELLERS);
  const [orders, lines] = await Promise.all([
    all<OrderRow & { last_round: string | null }>(db, `${ORDER_SELECT.replace("o.note, o.created_at", "o.note, o.last_round, o.created_at")} WHERE o.status = 'open' ORDER BY o.created_at`),
    all<{ order_id: string; menuItemId: string; quantity: number; note: string | null }>(
      db,
      "SELECT i.order_id, i.menu_item_id AS menuItemId, i.quantity, i.note FROM pos_order_items i JOIN pos_orders o ON o.id = i.order_id WHERE o.status = 'open' ORDER BY i.line",
    ),
  ]);
  const round = (json: string | null): OrderLine[] => {
    try {
      return json ? (JSON.parse(json) as OrderLine[]) : [];
    } catch {
      return [];
    }
  };
  return orders.map(({ last_round, ...o }) => ({
    ...o,
    lines: lines.filter((l) => l.order_id === o.id).map(({ menuItemId, quantity, note }) => ({ menuItemId, quantity, note })),
    lastRound: round(last_round),
  }));
}

export type OrderFilter = { from: string; to: string; method?: PayMethod; status?: OrderStatus; staffId?: string; outlet?: Outlet; q?: string };

export async function listOrders(db: Db, actor: Actor, f: OrderFilter, limit = 200): Promise<OrderRow[]> {
  requireRole(actor, ALL_POS);
  const where = ["o.created_at >= ?", "o.created_at < ?"];
  const params: unknown[] = [dayStart(f.from), dayStart(addDays(f.to, 1))];
  if (!sees(actor)) {
    where.push("(o.paid_by = ? OR o.created_by = ?)");
    params.push(actor.id, actor.id);
  }
  if (f.method) { where.push("o.method = ?"); params.push(f.method); }
  if (f.status) { where.push("o.status = ?"); params.push(f.status); }
  if (f.outlet) { where.push("o.outlet = ?"); params.push(f.outlet); }
  if (f.staffId) { where.push("(o.paid_by = ? OR (o.paid_by IS NULL AND o.created_by = ?))"); params.push(f.staffId, f.staffId); }
  const q = f.q?.trim();
  if (q) {
    const n = Number(q.replace(/^#/, ""));
    where.push(`(o.receipt_number LIKE ? OR ${Number.isInteger(n) && n > 0 ? "o.number = ? OR" : ""} EXISTS (SELECT 1 FROM pos_order_items i WHERE i.order_id = o.id AND i.name LIKE ?))`);
    params.push(`%${q.toUpperCase()}%`, ...(Number.isInteger(n) && n > 0 ? [n] : []), `%${q}%`);
  }
  return all<OrderRow>(db, `${ORDER_SELECT} WHERE ${where.join(" AND ")} ORDER BY o.created_at DESC LIMIT ${Math.min(limit, 20_000)}`, ...params);
}

export type OrderDetail = OrderRow & {
  lines: { line: number; name: string; category: MenuCategory; unit_price_kobo: number; quantity: number; note: string | null }[];
  cash_received_kobo: number | null; closed_by_name: string | null; closed_at: string | null; close_reason: string | null;
  paid_by: string | null; void_approved_by_name: string | null;
};

export async function getOrder(db: Db, actor: Actor, id: string): Promise<OrderDetail | null> {
  requireRole(actor, ALL_POS);
  const o = await first<OrderDetail & { paid_by: string | null; created_by: string }>(
    db,
    `SELECT o.id, o.number, o.outlet, o.status, o.total_kobo, o.method, coalesce(o.payment_reference, o.slip_last4, o.sender_name) AS payment_reference, o.receipt_number, o.note, o.created_at, o.paid_at, o.cash_received_kobo,
            o.closed_at, o.close_reason, o.paid_by, o.created_by,
            p.full_name AS taken_by, c.full_name AS created_by_name, x.full_name AS closed_by_name, a.full_name AS void_approved_by_name, '' AS items
     FROM pos_orders o LEFT JOIN staff_profiles p ON p.id = o.paid_by LEFT JOIN staff_profiles c ON c.id = o.created_by
     LEFT JOIN staff_profiles x ON x.id = o.closed_by LEFT JOIN staff_profiles a ON a.id = o.void_approved_by WHERE o.id = ?`,
    id,
  );
  if (!o) return null;
  if (!sees(actor) && o.paid_by !== actor.id && o.created_by !== actor.id && o.status !== "open") return null;
  const lines = await all<OrderDetail["lines"][number]>(db, "SELECT line, name, category, unit_price_kobo, quantity, note FROM pos_order_items WHERE order_id = ? ORDER BY line", id);
  return { ...o, lines };
}

// ---------------------------------------------------------------------------
// Daily closing
// ---------------------------------------------------------------------------

export type ClosingSummary = {
  sales: number; salesKobo: number; byMethod: Record<PayMethod, number>; voids: number; voidsKobo: number; openOrders: number;
};

export async function closingSummary(db: Db, actor: Actor, staffId: string, date = businessDate()): Promise<ClosingSummary> {
  requireRole(actor, ALL_POS);
  if (staffId !== actor.id && !sees(actor)) throw new AppError("FORBIDDEN", "You can only close your own sales.");
  const from = dayStart(date);
  const to = dayStart(addDays(date, 1));
  const [paid, voided, open] = await Promise.all([
    all<{ method: PayMethod; n: number; kobo: number }>(
      db,
      "SELECT method, count(*) AS n, sum(total_kobo) AS kobo FROM pos_orders WHERE status = 'paid' AND paid_by = ? AND paid_at >= ? AND paid_at < ? GROUP BY method",
      staffId, from, to,
    ),
    first<{ n: number; kobo: number }>(
      db,
      "SELECT count(*) AS n, coalesce(sum(total_kobo), 0) AS kobo FROM pos_orders WHERE status = 'void' AND paid_by = ? AND paid_at >= ? AND paid_at < ?",
      staffId, from, to,
    ),
    first<{ n: number }>(db, "SELECT count(*) AS n FROM pos_orders WHERE status = 'open' AND created_by = ?", staffId),
  ]);
  const byMethod: Record<PayMethod, number> = { cash: 0, bank_transfer: 0, pos_terminal: 0 };
  for (const p of paid) byMethod[p.method] = p.kobo;
  return {
    sales: paid.reduce((s, p) => s + p.n, 0),
    salesKobo: paid.reduce((s, p) => s + p.kobo, 0),
    byMethod,
    voids: voided?.n ?? 0,
    voidsKobo: voided?.kobo ?? 0,
    openOrders: open?.n ?? 0,
  };
}

export type CloseResult = { closed: true; id: string } | { closed: false; expectedKobo: number; countedKobo: number };

/**
 * Blind cash count (rules 2.6). The salesperson counts without seeing the expected cash. The first
 * count of the business day is recorded at once and is final: seeing the expected figure afterwards
 * can't change it. If it matches, the day is closed; if not, they give a reason and the day closes
 * with that first count.
 */
export async function closeDay(db: Db, actor: Actor, v: { countedCashKobo: number; explanation: string | null }): Promise<CloseResult> {
  requireRole(actor, POS_SELLERS);
  const date = businessDate();
  const s = await closingSummary(db, actor, actor.id, date);
  if (s.openOrders) throw new AppError("VALIDATION", `${s.openOrders === 1 ? "1 order is" : `${s.openOrders} orders are`} still unpaid. Take payment or cancel ${s.openOrders === 1 ? "it" : "them"} first.`);
  if (!Number.isInteger(v.countedCashKobo) || v.countedCashKobo < 0 || v.countedCashKobo > 10_000_000_000) throw new AppError("VALIDATION", "Enter the cash you counted.");
  if (await first(db, "SELECT 1 FROM pos_closings WHERE staff_id = ? AND business_date = ?", actor.id, date)) throw new AppError("CONFLICT", "You've already closed today's sales.");
  const expected = s.byMethod.cash;
  const earlier = await first<{ counted: number }>(
    db,
    "SELECT json_extract(metadata, '$.counted_kobo') AS counted FROM activity_log WHERE action = 'pos.cash_counted' AND actor_id = ? AND entity_id = ? ORDER BY id LIMIT 1",
    actor.id, date,
  );
  const counted = earlier ? earlier.counted : v.countedCashKobo;
  const diff = counted - expected;
  const why = v.explanation?.trim() || null;
  if (diff !== 0 && (!why || why.length < 3)) {
    if (!earlier) {
      await writeBatch(db, actor, [
        activity(db, "pos.cash_counted", "pos_closing", date, `Cash counted for ${date}: ${naira(counted)} (blind count)`, { counted_kobo: counted, expected_kobo: expected }),
      ]);
    }
    return { closed: false, expectedKobo: expected, countedKobo: counted };
  }
  const id = uuid();
  try {
    await writeBatch(db, actor, [
      db
        .prepare("INSERT INTO pos_closings (id, business_date, staff_id, summary, expected_cash_kobo, counted_cash_kobo, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, date, actor.id, JSON.stringify(s), expected, counted, diff === 0 ? null : why),
      activity(db, "pos.day_closed", "pos_closing", id, `Restaurant & bar sales closed for ${date}: ${naira(s.salesKobo)} sold, cash ${diff === 0 ? "matches" : `${naira(Math.abs(diff))} ${diff < 0 ? "short" : "over"}: ${why}`}`),
    ]);
  } catch (err) {
    if (err instanceof AppError && dbErrorToken(err.cause) === "unique") throw new AppError("CONFLICT", "You've already closed today's sales.");
    throw err;
  }
  return { closed: true, id };
}

/**
 * A manager marks a closing checked (X11). Nobody checks their own closing, the owner included (FUNCTIONALITY 8),
 * and a short or over closing needs a note saying what they found.
 */
export async function verifyClosing(db: Db, actor: Actor, id: string, note: string | null): Promise<void> {
  requireRole(actor, POS_MANAGERS);
  const c = await first<{ staff_id: string; verified_at: string | null; diff: number }>(
    db, "SELECT staff_id, verified_at, counted_cash_kobo - expected_cash_kobo AS diff FROM pos_closings WHERE id = ?", id,
  );
  if (!c) throw new AppError("NOT_FOUND", "Closing not found.");
  if (c.verified_at) throw new AppError("CONFLICT", "This closing is already checked.");
  if (c.staff_id === actor.id) throw new AppError("FORBIDDEN", "Another manager must check your own closing.");
  const why = note?.trim().slice(0, 300) || null;
  if (c.diff !== 0 && (!why || why.length < 3)) throw new AppError("VALIDATION", `The cash is ${c.diff < 0 ? "short" : "over"}. Add a note saying what you found.`);
  const [r] = await writeBatch(db, actor, [
    db
      .prepare("UPDATE pos_closings SET verified_by = ?, verified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), verify_note = ? WHERE id = ? AND verified_at IS NULL")
      .bind(actor.id, why, id),
    activityIfChanged(db, "pos.closing_verified", "pos_closing", id, `Restaurant & bar closing checked${why ? `: ${why}` : ""}`),
  ]);
  if (!r?.meta.changes) throw new AppError("CONFLICT", "This closing is already checked.");
}

export type ClosingRow = {
  id: string; business_date: string; staff: string; summary: string; expected_cash_kobo: number; counted_cash_kobo: number;
  explanation: string | null; closed_at: string; verified_by_name: string | null; verified_at: string | null; verify_note: string | null; staff_id: string;
  /** The counters they sold at that day ("bar", "restaurant" or "bar,restaurant"); null if they sold nothing. */
  outlets: string | null;
};

export async function listClosings(db: Db, actor: Actor, from: string, to: string): Promise<ClosingRow[]> {
  requireRole(actor, ALL_POS);
  return all<ClosingRow>(
    db,
    `SELECT c.id, c.business_date, s.full_name AS staff, c.summary, c.expected_cash_kobo, c.counted_cash_kobo, c.explanation, c.closed_at,
            v.full_name AS verified_by_name, c.verified_at, c.verify_note, c.staff_id,
            (SELECT group_concat(outlet) FROM (SELECT DISTINCT o.outlet FROM pos_orders o
               WHERE o.paid_by = c.staff_id AND o.status IN ('paid', 'void') AND o.paid_at >= ${dayStartSql("c.business_date")} AND o.paid_at < ${dayStartSql("date(c.business_date, '+1 day')")}
               ORDER BY o.outlet)) AS outlets
     FROM pos_closings c JOIN staff_profiles s ON s.id = c.staff_id LEFT JOIN staff_profiles v ON v.id = c.verified_by
     WHERE c.business_date BETWEEN ? AND ? ${sees(actor) ? "" : "AND c.staff_id = ?"}
     ORDER BY c.business_date DESC, c.closed_at DESC`,
    from, to, ...(sees(actor) ? [] : [actor.id]),
  );
}

/** The UTC instant a business day starts, in SQL (Lagos is UTC+1), matching businessDayStart(). */
const dayStartSql = (dateExpr: string) => `strftime('%Y-%m-%dT%H:%M:%fZ', ${dateExpr}, '${BUSINESS_DAY_START_HOUR - 1} hours')`;

/** Closings are due by 10:00 Lagos time the day after the business date (FUNCTIONALITY 8). */
export const CLOSING_DUE_HOUR = 10;

export type NotClosed = { staff_id: string; name: string; sales: number; kobo: number };

/**
 * "Not closed": staff who sold on a business date and had no closing by 10:00 the next day. Before that time
 * nobody is late yet, so the list is empty.
 */
export async function notClosed(db: Db, actor: Actor, date: string, now: Date = new Date()): Promise<NotClosed[]> {
  requireRole(actor, POS_VIEWERS);
  const due = hotelInstant(addDays(date, 1), `${String(CLOSING_DUE_HOUR).padStart(2, "0")}:00:00`);
  if (now.toISOString() < due) return [];
  return all<NotClosed>(
    db,
    `SELECT o.paid_by AS staff_id, s.full_name AS name, count(*) AS sales, sum(CASE WHEN o.status = 'paid' THEN o.total_kobo ELSE 0 END) AS kobo
     FROM pos_orders o JOIN staff_profiles s ON s.id = o.paid_by
     WHERE o.status IN ('paid', 'void') AND o.paid_at >= ? AND o.paid_at < ?
       AND NOT EXISTS (SELECT 1 FROM pos_closings c WHERE c.staff_id = o.paid_by AND c.business_date = ? AND c.closed_at < ?)
     GROUP BY o.paid_by ORDER BY s.full_name`,
    dayStart(date), dayStart(addDays(date, 1)), date, due,
  );
}

/** Monday of the business week a date falls in. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export type ClosingsReview = {
  rows: ClosingRow[];
  toCheck: number;
  short: { kobo: number; n: number };
  over: { kobo: number; n: number };
  notClosed: NotClosed[];
  yesterday: string;
};

/**
 * The managers' review (X11): every closing of the last 14 business days, how many wait to be checked, this
 * week's short and over totals (worked out from the closings, never stored) and who didn't close yesterday.
 */
export async function closingsReview(db: Db, actor: Actor, now: Date = new Date()): Promise<ClosingsReview> {
  requireRole(actor, POS_VIEWERS);
  const today = businessDate(now);
  const yesterday = addDays(today, -1);
  const monday = weekStart(today);
  const [rows, late, waiting] = await Promise.all([
    listClosings(db, actor, addDays(today, -13), today),
    notClosed(db, actor, yesterday, now),
    first<{ n: number }>(db, "SELECT count(*) AS n FROM pos_closings WHERE verified_at IS NULL"),
  ]);
  const short = { kobo: 0, n: 0 };
  const over = { kobo: 0, n: 0 };
  for (const r of rows) {
    if (r.business_date < monday) continue;
    const diff = r.counted_cash_kobo - r.expected_cash_kobo;
    if (diff < 0) { short.kobo += diff; short.n++; }
    if (diff > 0) { over.kobo += diff; over.n++; }
  }
  return { rows, toCheck: waiting?.n ?? 0, short, over, notClosed: late, yesterday };
}
