-- Restaurant & bar as an independent department: orders paid at the counter,
-- receipts, menu categories, menu-to-stock links, waste, daily closing, and a
-- Restaurant/Bar Manager role. Charge-to-room is retired (the old sales tables
-- stay, unused; nothing was ever sold through them on the live site).

-- Staff: a restaurant & bar record can be the department's manager.
ALTER TABLE staff_profiles ADD COLUMN department_lead INTEGER NOT NULL DEFAULT 0 CHECK (department_lead IN (0, 1));
CREATE TRIGGER staff_profiles_lead_insert BEFORE INSERT ON staff_profiles
WHEN NEW.department_lead = 1 AND NEW.department IS NOT 'restaurant_bar'
BEGIN
  SELECT RAISE(ABORT, 'lead_needs_restaurant_bar');
END;
CREATE TRIGGER staff_profiles_lead_update BEFORE UPDATE OF department, department_lead ON staff_profiles
WHEN NEW.department_lead = 1 AND NEW.department IS NOT 'restaurant_bar'
BEGIN
  SELECT RAISE(ABORT, 'lead_needs_restaurant_bar');
END;
CREATE TRIGGER staff_profiles_audit_lead AFTER UPDATE OF department_lead ON staff_profiles
WHEN NEW.department_lead IS NOT OLD.department_lead
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'staff.role_changed', 'staff', NEW.id,
          NEW.full_name || CASE WHEN NEW.department_lead = 1 THEN ' is now Restaurant/Bar Manager' ELSE ' is no longer Restaurant/Bar Manager' END,
          json_object('department_lead', NEW.department_lead));
END;

-- Menu: categories, available today, and the stock each item uses.
ALTER TABLE menu_items ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
  CHECK (category IN ('meals', 'snacks', 'soft_drinks', 'alcoholic_drinks', 'other'));
ALTER TABLE menu_items ADD COLUMN is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1));
UPDATE menu_items SET category = 'meals' WHERE outlet = 'restaurant';
UPDATE menu_items SET category = 'alcoholic_drinks' WHERE outlet = 'bar' AND (name LIKE '%lager%' OR name LIKE '%Gulder%' OR name LIKE '%Heineken%' OR name LIKE '%stout%' OR name LIKE '%wine%');
UPDATE menu_items SET category = 'soft_drinks' WHERE outlet = 'bar' AND category = 'other';

CREATE TABLE menu_item_stock (
  menu_item_id TEXT NOT NULL REFERENCES menu_items (id),
  stock_item_id TEXT NOT NULL REFERENCES stock_items (id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  PRIMARY KEY (menu_item_id, stock_item_id)
);

ALTER TABLE stock_items ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
  CHECK (category IN ('drinks', 'food', 'ingredients', 'supplies', 'other'));

-- Orders. open: taken, not paid (not a sale). paid: a sale, with a receipt.
-- cancelled: an unpaid order dropped. void: a paid sale reversed by a manager.
CREATE TABLE pos_counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO pos_counters (name, value) VALUES ('order', 0), ('receipt', 0);

CREATE TABLE pos_orders (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  outlet TEXT NOT NULL CHECK (outlet IN ('restaurant', 'bar')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'cancelled', 'void')),
  total_kobo INTEGER NOT NULL DEFAULT 0 CHECK (total_kobo >= 0),
  note TEXT CHECK (note IS NULL OR length(note) <= 120),
  method TEXT CHECK (method IS NULL OR method IN ('cash', 'bank_transfer', 'pos_terminal')),
  cash_received_kobo INTEGER CHECK (cash_received_kobo IS NULL OR cash_received_kobo >= 0),
  receipt_number TEXT UNIQUE,
  created_by TEXT NOT NULL REFERENCES staff_profiles (id),
  paid_by TEXT REFERENCES staff_profiles (id),
  paid_at TEXT,
  closed_by TEXT REFERENCES staff_profiles (id),
  closed_at TEXT,
  close_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((status IN ('paid', 'void')) = (paid_at IS NOT NULL AND paid_by IS NOT NULL AND method IS NOT NULL AND receipt_number IS NOT NULL)),
  CHECK (status NOT IN ('paid', 'void') OR total_kobo > 0),
  CHECK ((status IN ('cancelled', 'void')) = (closed_at IS NOT NULL AND closed_by IS NOT NULL)),
  CHECK (status <> 'void' OR length(trim(close_reason)) >= 3)
);
CREATE INDEX pos_orders_paid_idx ON pos_orders (status, paid_at);
CREATE INDEX pos_orders_open_idx ON pos_orders (outlet, created_at) WHERE status = 'open';

CREATE TABLE pos_order_items (
  order_id TEXT NOT NULL REFERENCES pos_orders (id),
  line INTEGER NOT NULL,
  menu_item_id TEXT NOT NULL REFERENCES menu_items (id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_price_kobo INTEGER NOT NULL CHECK (unit_price_kobo > 0),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  PRIMARY KEY (order_id, line)
);

CREATE TRIGGER pos_orders_no_delete BEFORE DELETE ON pos_orders
BEGIN
  SELECT RAISE(ABORT, 'order_immutable');
END;
CREATE TRIGGER pos_orders_transition BEFORE UPDATE OF status ON pos_orders
WHEN NEW.status IS NOT OLD.status AND NOT (
  (OLD.status = 'open' AND NEW.status IN ('paid', 'cancelled')) OR (OLD.status = 'paid' AND NEW.status = 'void'))
BEGIN
  SELECT RAISE(ABORT, 'order_transition');
END;
CREATE TRIGGER pos_orders_frozen BEFORE UPDATE ON pos_orders
WHEN OLD.status <> 'open' AND (
  NEW.number IS NOT OLD.number OR NEW.outlet IS NOT OLD.outlet OR NEW.total_kobo IS NOT OLD.total_kobo
  OR NEW.method IS NOT OLD.method OR NEW.receipt_number IS NOT OLD.receipt_number OR NEW.paid_at IS NOT OLD.paid_at
  OR NEW.paid_by IS NOT OLD.paid_by OR NEW.cash_received_kobo IS NOT OLD.cash_received_kobo OR NEW.created_by IS NOT OLD.created_by
  OR (OLD.status IN ('cancelled', 'void')))
BEGIN
  SELECT RAISE(ABORT, 'order_immutable');
END;
CREATE TRIGGER pos_order_items_open_insert BEFORE INSERT ON pos_order_items
WHEN (SELECT status FROM pos_orders WHERE id = NEW.order_id) IS NOT 'open'
BEGIN
  SELECT RAISE(ABORT, 'order_immutable');
END;
CREATE TRIGGER pos_order_items_open_update BEFORE UPDATE ON pos_order_items
WHEN (SELECT status FROM pos_orders WHERE id = OLD.order_id) IS NOT 'open'
BEGIN
  SELECT RAISE(ABORT, 'order_immutable');
END;
CREATE TRIGGER pos_order_items_open_delete BEFORE DELETE ON pos_order_items
WHEN (SELECT status FROM pos_orders WHERE id = OLD.order_id) IS NOT 'open'
BEGIN
  SELECT RAISE(ABORT, 'order_immutable');
END;

-- Stock movements: add waste, sales and returns (from voided sales), linked to the order.
CREATE TABLE stock_moves_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES stock_items (id),
  change INTEGER NOT NULL CHECK (change <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('received', 'used', 'adjusted', 'wasted', 'sold', 'returned')),
  note TEXT,
  order_id TEXT REFERENCES pos_orders (id),
  staff_id TEXT REFERENCES staff_profiles (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (kind NOT IN ('received', 'returned') OR change > 0),
  CHECK (kind NOT IN ('used', 'wasted', 'sold') OR change < 0),
  CHECK (kind <> 'wasted' OR length(trim(note)) >= 3),
  CHECK ((kind IN ('sold', 'returned')) = (order_id IS NOT NULL))
);
INSERT INTO stock_moves_v2 (id, item_id, change, kind, note, staff_id, created_at)
  SELECT id, item_id, change, kind, note, staff_id, created_at FROM stock_moves;
DROP TABLE stock_moves;
ALTER TABLE stock_moves_v2 RENAME TO stock_moves;
CREATE INDEX stock_moves_item_idx ON stock_moves (item_id, created_at);
CREATE INDEX stock_moves_order_idx ON stock_moves (order_id) WHERE order_id IS NOT NULL;
CREATE TRIGGER stock_moves_apply AFTER INSERT ON stock_moves
BEGIN
  UPDATE stock_items SET quantity = quantity + NEW.change WHERE id = NEW.item_id;
END;
CREATE TRIGGER stock_moves_no_update BEFORE UPDATE ON stock_moves
BEGIN
  SELECT RAISE(ABORT, 'stock_move_immutable');
END;
CREATE TRIGGER stock_moves_no_delete BEFORE DELETE ON stock_moves
BEGIN
  SELECT RAISE(ABORT, 'stock_move_immutable');
END;

-- Expenses: Restaurant and Bar are separate departments.
CREATE TABLE expenses_v2 (
  id TEXT PRIMARY KEY,
  spent_on TEXT NOT NULL CHECK (date(spent_on) = spent_on),
  category TEXT NOT NULL CHECK (category IN (
    'supplies', 'food_drink', 'utilities', 'fuel', 'maintenance', 'salaries', 'laundry', 'marketing', 'tax', 'other',
    'cooking_gas', 'cleaning')),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 2 AND 200),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'pos_terminal', 'card', 'other')),
  reference TEXT,
  recorded_by TEXT NOT NULL REFERENCES staff_profiles (id),
  voided_at TEXT,
  voided_by TEXT REFERENCES staff_profiles (id),
  void_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  department TEXT NOT NULL DEFAULT 'general' CHECK (department IN ('general', 'rooms', 'restaurant', 'bar', 'hall')),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);
INSERT INTO expenses_v2 (id, spent_on, category, description, amount_kobo, method, reference, recorded_by, voided_at, voided_by, void_reason, created_at, department)
  SELECT id, spent_on, category, description, amount_kobo, method, reference, recorded_by, voided_at, voided_by, void_reason, created_at,
         CASE department WHEN 'restaurant_bar' THEN 'restaurant' ELSE department END
  FROM expenses;
DROP TABLE expenses;
ALTER TABLE expenses_v2 RENAME TO expenses;
CREATE INDEX expenses_spent_on_idx ON expenses (spent_on);
CREATE INDEX expenses_department_idx ON expenses (department, spent_on);
CREATE TRIGGER expenses_no_delete BEFORE DELETE ON expenses
BEGIN
  SELECT RAISE(ABORT, 'expense_immutable');
END;
CREATE TRIGGER expenses_only_void BEFORE UPDATE ON expenses
WHEN OLD.voided_at IS NOT NULL
  OR NEW.spent_on IS NOT OLD.spent_on OR NEW.category IS NOT OLD.category OR NEW.description IS NOT OLD.description
  OR NEW.amount_kobo IS NOT OLD.amount_kobo OR NEW.method IS NOT OLD.method OR NEW.reference IS NOT OLD.reference
  OR NEW.recorded_by IS NOT OLD.recorded_by OR NEW.department IS NOT OLD.department OR NEW.voided_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'expense_immutable');
END;

-- Daily closing: each attendant counts their cash; a manager signs it off.
CREATE TABLE pos_closings (
  id TEXT PRIMARY KEY,
  business_date TEXT NOT NULL CHECK (date(business_date) = business_date),
  staff_id TEXT NOT NULL REFERENCES staff_profiles (id),
  summary TEXT NOT NULL CHECK (json_valid(summary)),
  expected_cash_kobo INTEGER NOT NULL CHECK (expected_cash_kobo >= 0),
  counted_cash_kobo INTEGER NOT NULL CHECK (counted_cash_kobo >= 0),
  explanation TEXT,
  closed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  verified_by TEXT REFERENCES staff_profiles (id),
  verified_at TEXT,
  verify_note TEXT,
  UNIQUE (business_date, staff_id),
  CHECK (counted_cash_kobo = expected_cash_kobo OR length(trim(explanation)) >= 3),
  CHECK ((verified_by IS NULL) = (verified_at IS NULL))
);
CREATE TRIGGER pos_closings_no_delete BEFORE DELETE ON pos_closings
BEGIN
  SELECT RAISE(ABORT, 'closing_immutable');
END;
CREATE TRIGGER pos_closings_only_verify BEFORE UPDATE ON pos_closings
WHEN OLD.verified_at IS NOT NULL
  OR NEW.business_date IS NOT OLD.business_date OR NEW.staff_id IS NOT OLD.staff_id OR NEW.summary IS NOT OLD.summary
  OR NEW.expected_cash_kobo IS NOT OLD.expected_cash_kobo OR NEW.counted_cash_kobo IS NOT OLD.counted_cash_kobo
  OR NEW.explanation IS NOT OLD.explanation OR NEW.closed_at IS NOT OLD.closed_at
BEGIN
  SELECT RAISE(ABORT, 'closing_immutable');
END;
