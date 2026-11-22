-- =============================================================================
-- Phase 2: guest self-service, extras and promo codes, finance (expenses and
-- VAT), restaurant and bar sales, inventory, and conference hall bookings.
-- Kept deliberately simple; the same rules as before apply: money records
-- can't be edited or deleted, and every change is logged.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings: VAT (prices include it) and the cancellation fee rule
-- ---------------------------------------------------------------------------
ALTER TABLE hotel_settings ADD COLUMN vat_rate_bp INTEGER NOT NULL DEFAULT 750 CHECK (vat_rate_bp BETWEEN 0 AND 5000);
-- Cancelling more than this many hours before check-in is free...
ALTER TABLE hotel_settings ADD COLUMN free_cancel_hours INTEGER NOT NULL DEFAULT 48 CHECK (free_cancel_hours BETWEEN 0 AND 720);
-- ...after that, this percentage of the room total is kept.
ALTER TABLE hotel_settings ADD COLUMN late_cancel_fee_pct INTEGER NOT NULL DEFAULT 50 CHECK (late_cancel_fee_pct BETWEEN 0 AND 100);

-- ---------------------------------------------------------------------------
-- Staff roles: Finance and Restaurant & bar
-- ---------------------------------------------------------------------------
-- The role CHECK can't be widened without rebuilding staff_profiles, and a
-- rebuild in D1 (foreign keys always on) would null every staff reference on
-- bookings, payments and the log. Instead a department sits on top of the
-- most limited role: the app's role is coalesce(department, role), worked out
-- in one place (src/server/auth.ts), and a department is only allowed on a
-- front-desk record, so a missed lookup can never grant more than front desk.
ALTER TABLE staff_profiles ADD COLUMN department TEXT CHECK (department IS NULL OR department IN ('finance', 'restaurant_bar'));

CREATE TRIGGER staff_profiles_department_insert BEFORE INSERT ON staff_profiles
WHEN NEW.department IS NOT NULL AND NEW.role <> 'front_desk'
BEGIN
  SELECT RAISE(ABORT, 'department_needs_front_desk');
END;
CREATE TRIGGER staff_profiles_department_update BEFORE UPDATE OF role, department ON staff_profiles
WHEN NEW.department IS NOT NULL AND NEW.role <> 'front_desk'
BEGIN
  SELECT RAISE(ABORT, 'department_needs_front_desk');
END;
CREATE TRIGGER staff_profiles_audit_department AFTER UPDATE OF department ON staff_profiles
WHEN NEW.department IS NOT OLD.department
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'staff.updated', 'staff_profile', NEW.id,
          printf('Staff %s: department %s → %s', NEW.full_name, coalesce(OLD.department, 'none'), coalesce(NEW.department, 'none')),
          json_object('from_department', OLD.department, 'to_department', NEW.department));
END;

-- ---------------------------------------------------------------------------
-- Booking extras and promo codes. The room total stays nightly rate x nights;
-- what the guest owes is room total + extras - discount.
-- ---------------------------------------------------------------------------
ALTER TABLE reservations ADD COLUMN extras_kobo INTEGER NOT NULL DEFAULT 0 CHECK (extras_kobo >= 0);
ALTER TABLE reservations ADD COLUMN discount_pct INTEGER NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100);
ALTER TABLE reservations ADD COLUMN discount_kobo INTEGER NOT NULL DEFAULT 0 CHECK (discount_kobo >= 0);
ALTER TABLE reservations ADD COLUMN promo_code TEXT;
-- Set when a guest cancels online: the fee kept under the cancellation rule.
ALTER TABLE reservations ADD COLUMN cancellation_fee_kobo INTEGER CHECK (cancellation_fee_kobo IS NULL OR cancellation_fee_kobo >= 0);

CREATE TRIGGER reservations_discount_within_total BEFORE INSERT ON reservations
WHEN NEW.discount_kobo > NEW.total_amount_kobo
BEGIN
  SELECT RAISE(ABORT, 'discount_too_large');
END;
CREATE TRIGGER reservations_discount_within_total_update BEFORE UPDATE OF discount_kobo, total_amount_kobo ON reservations
WHEN NEW.discount_kobo > NEW.total_amount_kobo
BEGIN
  SELECT RAISE(ABORT, 'discount_too_large');
END;

CREATE TABLE extras (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  price_kobo INTEGER NOT NULL CHECK (price_kobo > 0),
  -- 1 = charged for every night (e.g. breakfast); 0 = once per stay (e.g. airport pickup).
  per_night INTEGER NOT NULL DEFAULT 0 CHECK (per_night IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- What the guest chose, priced at booking time.
CREATE TABLE reservation_extras (
  reservation_id TEXT NOT NULL REFERENCES reservations (id) ON DELETE CASCADE,
  extra_id TEXT NOT NULL REFERENCES extras (id),
  name TEXT NOT NULL,
  unit_price_kobo INTEGER NOT NULL CHECK (unit_price_kobo > 0),
  per_night INTEGER NOT NULL CHECK (per_night IN (0, 1)),
  PRIMARY KEY (reservation_id, extra_id)
);

CREATE TABLE promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code = upper(code) AND length(code) BETWEEN 3 AND 20),
  percent_off INTEGER NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  valid_until TEXT CHECK (valid_until IS NULL OR date(valid_until) = valid_until),
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT REFERENCES staff_profiles (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A code must be usable at the moment the booking is written (race-safe
-- against its last use), and each use is counted.
CREATE TRIGGER reservations_promo_valid BEFORE INSERT ON reservations
WHEN NEW.promo_code IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM promo_codes p WHERE p.code = NEW.promo_code AND p.is_active = 1
    AND (p.valid_until IS NULL OR p.valid_until >= date('now', '+1 hour'))
    AND (p.max_uses IS NULL OR p.used_count < p.max_uses))
BEGIN
  SELECT RAISE(ABORT, 'promo_invalid');
END;
CREATE TRIGGER reservations_promo_count AFTER INSERT ON reservations WHEN NEW.promo_code IS NOT NULL
BEGIN
  UPDATE promo_codes SET used_count = used_count + 1 WHERE code = NEW.promo_code;
END;

-- ---------------------------------------------------------------------------
-- Guest accounts: sign in with a 6-digit code sent to the booking email
-- ---------------------------------------------------------------------------
CREATE TABLE guest_login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL CHECK (email = lower(email)),
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX guest_login_codes_email_idx ON guest_login_codes (email, created_at);

-- ---------------------------------------------------------------------------
-- Finance: expenses (void with a reason; never edited or deleted)
-- ---------------------------------------------------------------------------
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  spent_on TEXT NOT NULL CHECK (date(spent_on) = spent_on),
  category TEXT NOT NULL CHECK (category IN (
    'supplies', 'food_drink', 'utilities', 'fuel', 'maintenance', 'salaries', 'laundry', 'marketing', 'tax', 'other')),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 2 AND 200),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'pos_terminal', 'card', 'other')),
  reference TEXT,
  recorded_by TEXT NOT NULL REFERENCES staff_profiles (id),
  voided_at TEXT,
  voided_by TEXT REFERENCES staff_profiles (id),
  void_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);
CREATE INDEX expenses_spent_on_idx ON expenses (spent_on);

CREATE TRIGGER expenses_no_delete BEFORE DELETE ON expenses
BEGIN
  SELECT RAISE(ABORT, 'expense_immutable');
END;
-- The only change allowed: voiding once.
CREATE TRIGGER expenses_only_void BEFORE UPDATE ON expenses
WHEN OLD.voided_at IS NOT NULL
  OR NEW.spent_on IS NOT OLD.spent_on OR NEW.category IS NOT OLD.category OR NEW.description IS NOT OLD.description
  OR NEW.amount_kobo IS NOT OLD.amount_kobo OR NEW.method IS NOT OLD.method OR NEW.reference IS NOT OLD.reference
  OR NEW.recorded_by IS NOT OLD.recorded_by OR NEW.voided_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'expense_immutable');
END;

-- ---------------------------------------------------------------------------
-- Restaurant and bar sales
-- ---------------------------------------------------------------------------
CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  outlet TEXT NOT NULL CHECK (outlet IN ('restaurant', 'bar')),
  price_kobo INTEGER NOT NULL CHECK (price_kobo > 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- paid: paid at the counter. room_charge: added to a checked-in guest's room,
-- unpaid until settled (by check-out at the latest). void: cancelled by a manager.
CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  outlet TEXT NOT NULL CHECK (outlet IN ('restaurant', 'bar')),
  total_kobo INTEGER NOT NULL CHECK (total_kobo > 0),
  status TEXT NOT NULL CHECK (status IN ('paid', 'room_charge', 'settled', 'void')),
  method TEXT CHECK (method IS NULL OR method IN ('cash', 'bank_transfer', 'pos_terminal')),
  reservation_id TEXT REFERENCES reservations (id),
  sold_by TEXT NOT NULL REFERENCES staff_profiles (id),
  settled_by TEXT REFERENCES staff_profiles (id),
  settled_at TEXT,
  voided_by TEXT REFERENCES staff_profiles (id),
  void_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (status <> 'paid' OR method IS NOT NULL),
  CHECK (status <> 'settled' OR (method IS NOT NULL AND reservation_id IS NOT NULL AND settled_at IS NOT NULL)),
  CHECK (status <> 'room_charge' OR (reservation_id IS NOT NULL AND method IS NULL)),
  CHECK (status <> 'void' OR void_reason IS NOT NULL)
);
CREATE INDEX sales_created_idx ON sales (created_at);
CREATE INDEX sales_reservation_idx ON sales (reservation_id) WHERE reservation_id IS NOT NULL;

CREATE TABLE sale_items (
  sale_id TEXT NOT NULL REFERENCES sales (id),
  line INTEGER NOT NULL,
  menu_item_id TEXT REFERENCES menu_items (id),
  name TEXT NOT NULL,
  unit_price_kobo INTEGER NOT NULL CHECK (unit_price_kobo > 0),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  PRIMARY KEY (sale_id, line)
);

-- Only guests who are staying can have charges added to their room.
CREATE TRIGGER sales_room_charge_in_house BEFORE INSERT ON sales
WHEN NEW.status = 'room_charge'
  AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id = NEW.reservation_id AND r.status = 'checked_in')
BEGIN
  SELECT RAISE(ABORT, 'room_charge_not_in_house');
END;
CREATE TRIGGER sales_no_delete BEFORE DELETE ON sales
BEGIN
  SELECT RAISE(ABORT, 'sale_immutable');
END;
-- Allowed changes: room_charge -> settled, and paid/room_charge -> void. Nothing else.
CREATE TRIGGER sales_guard_update BEFORE UPDATE ON sales
WHEN NOT (
  (OLD.status = 'room_charge' AND NEW.status = 'settled') OR
  (OLD.status IN ('paid', 'room_charge') AND NEW.status = 'void')
) OR NEW.total_kobo IS NOT OLD.total_kobo OR NEW.number IS NOT OLD.number OR NEW.outlet IS NOT OLD.outlet
  OR NEW.sold_by IS NOT OLD.sold_by OR NEW.reservation_id IS NOT OLD.reservation_id OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'sale_immutable');
END;
CREATE TRIGGER sale_items_no_change BEFORE UPDATE ON sale_items
BEGIN
  SELECT RAISE(ABORT, 'sale_immutable');
END;
CREATE TRIGGER sale_items_no_delete BEFORE DELETE ON sale_items
BEGIN
  SELECT RAISE(ABORT, 'sale_immutable');
END;
-- A guest can't check out with restaurant or bar charges still unpaid.
CREATE TRIGGER reservations_charges_settled BEFORE UPDATE OF status ON reservations
WHEN NEW.status = 'checked_out' AND OLD.status = 'checked_in'
  AND EXISTS (SELECT 1 FROM sales s WHERE s.reservation_id = NEW.id AND s.status = 'room_charge')
BEGIN
  SELECT RAISE(ABORT, 'unsettled_charges');
END;

-- ---------------------------------------------------------------------------
-- Inventory: stock levels change only through recorded movements
-- ---------------------------------------------------------------------------
CREATE TABLE stock_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 2 AND 80),
  unit TEXT NOT NULL CHECK (length(trim(unit)) BETWEEN 1 AND 20),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity INTEGER NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE stock_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES stock_items (id),
  change INTEGER NOT NULL CHECK (change <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('received', 'used', 'adjusted')),
  note TEXT,
  staff_id TEXT REFERENCES staff_profiles (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (kind <> 'received' OR change > 0),
  CHECK (kind <> 'used' OR change < 0)
);
CREATE INDEX stock_moves_item_idx ON stock_moves (item_id, created_at);

-- The quantity can't go below zero (the CHECK on stock_items refuses it).
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

-- ---------------------------------------------------------------------------
-- Conference hall bookings
-- ---------------------------------------------------------------------------
CREATE TABLE hall_bookings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 120),
  customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) BETWEEN 2 AND 120),
  phone TEXT,
  email TEXT,
  event_date TEXT NOT NULL CHECK (date(event_date) = event_date),
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_time TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  guests INTEGER CHECK (guests IS NULL OR guests > 0),
  price_kobo INTEGER NOT NULL DEFAULT 0 CHECK (price_kobo >= 0),
  status TEXT NOT NULL DEFAULT 'enquiry' CHECK (status IN ('enquiry', 'confirmed', 'cancelled')),
  notes TEXT,
  created_by TEXT REFERENCES staff_profiles (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (end_time > start_time)
);
CREATE INDEX hall_bookings_date_idx ON hall_bookings (event_date);

-- Two confirmed events can't share the hall at the same time.
CREATE TRIGGER hall_bookings_no_overlap_insert BEFORE INSERT ON hall_bookings
WHEN NEW.status = 'confirmed' AND EXISTS (
  SELECT 1 FROM hall_bookings h WHERE h.status = 'confirmed' AND h.event_date = NEW.event_date
    AND h.start_time < NEW.end_time AND NEW.start_time < h.end_time)
BEGIN
  SELECT RAISE(ABORT, 'hall_overlap');
END;
CREATE TRIGGER hall_bookings_no_overlap_update BEFORE UPDATE OF status, event_date, start_time, end_time ON hall_bookings
WHEN NEW.status = 'confirmed' AND EXISTS (
  SELECT 1 FROM hall_bookings h WHERE h.id <> NEW.id AND h.status = 'confirmed' AND h.event_date = NEW.event_date
    AND h.start_time < NEW.end_time AND NEW.start_time < h.end_time)
BEGIN
  SELECT RAISE(ABORT, 'hall_overlap');
END;
CREATE TRIGGER hall_bookings_no_delete BEFORE DELETE ON hall_bookings
BEGIN
  SELECT RAISE(ABORT, 'hall_booking_delete_forbidden');
END;

CREATE TABLE hall_payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES hall_bookings (id),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'pos_terminal', 'card')),
  paid_on TEXT NOT NULL CHECK (date(paid_on) = paid_on),
  reference TEXT,
  recorded_by TEXT NOT NULL REFERENCES staff_profiles (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TRIGGER hall_payments_no_update BEFORE UPDATE ON hall_payments
BEGIN
  SELECT RAISE(ABORT, 'payment_immutable');
END;
CREATE TRIGGER hall_payments_no_delete BEFORE DELETE ON hall_payments
BEGIN
  SELECT RAISE(ABORT, 'payment_immutable');
END;
