-- Step 2 (FUNCTIONALITY.md sections 7–12): approvals, deliveries, payment links and company bills.

-- 7. Approvals. A no-show puts the unused part forward as a refund request (the first night is kept by policy).
ALTER TABLE refund_requests ADD COLUMN source TEXT NOT NULL DEFAULT 'desk' CHECK (source IN ('desk', 'no_show'));
-- "Leave owing" at check-out is agreed (or not) by the GM or owner; either way it stays under Owed until paid.
ALTER TABLE reservations ADD COLUMN owing_decided_by TEXT REFERENCES staff_profiles (id);
ALTER TABLE reservations ADD COLUMN owing_decided_at TEXT;
ALTER TABLE reservations ADD COLUMN owing_decision TEXT CHECK (owing_decision IS NULL OR owing_decision IN ('agreed', 'chase'));
ALTER TABLE reservations ADD COLUMN owing_decision_note TEXT CHECK (owing_decision_note IS NULL OR length(owing_decision_note) <= 500);

-- 9. Record a delivery: who supplied it and what it cost (optional).
ALTER TABLE stock_moves ADD COLUMN supplier TEXT CHECK (supplier IS NULL OR length(trim(supplier)) BETWEEN 2 AND 80);
ALTER TABLE stock_moves ADD COLUMN cost_kobo INTEGER CHECK (cost_kobo IS NULL OR cost_kobo >= 0);

-- 11. Company bills, paid before arrival. Not a receipt. Numbered B-0001… with their own counter.
CREATE TABLE bill_counter (id INTEGER PRIMARY KEY CHECK (id = 1), last_number INTEGER NOT NULL CHECK (last_number >= 0));
INSERT INTO bill_counter (id, last_number) VALUES (1, 0);
CREATE TRIGGER bill_counter_no_delete BEFORE DELETE ON bill_counter BEGIN SELECT RAISE(ABORT, 'history_immutable'); END;

CREATE TABLE bills (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE CHECK (number GLOB 'B-[0-9][0-9][0-9][0-9]*'),
  company_name TEXT NOT NULL CHECK (length(trim(company_name)) BETWEEN 2 AND 120),
  attention TEXT CHECK (attention IS NULL OR length(trim(attention)) BETWEEN 2 AND 120),
  reservation_ids TEXT NOT NULL CHECK (json_valid(reservation_ids) AND json_type(reservation_ids) = 'array' AND json_array_length(reservation_ids) BETWEEN 1 AND 30),
  lines TEXT NOT NULL CHECK (json_valid(lines) AND json_type(lines) = 'array'),
  total_kobo INTEGER NOT NULL CHECK (total_kobo > 0),
  valid_until TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff_profiles (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cancelled_at TEXT,
  cancelled_by TEXT REFERENCES staff_profiles (id),
  CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL))
);
CREATE TRIGGER bills_no_delete BEFORE DELETE ON bills BEGIN SELECT RAISE(ABORT, 'history_immutable'); END;
CREATE TRIGGER bills_fixed BEFORE UPDATE ON bills
WHEN OLD.cancelled_at IS NOT NULL OR NEW.number IS NOT OLD.number OR NEW.company_name IS NOT OLD.company_name
  OR NEW.reservation_ids IS NOT OLD.reservation_ids OR NEW.lines IS NOT OLD.lines OR NEW.total_kobo IS NOT OLD.total_kobo
  OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'bill_fixed'); END;

-- 10. Payment links: /pay/<code>. The code is random (not the booking reference). It stops working when paid,
-- cancelled or past expires_at (the hold's end).
CREATE TABLE pay_links (
  code TEXT PRIMARY KEY CHECK (length(code) BETWEEN 16 AND 64),
  reservation_id TEXT REFERENCES reservations (id),
  bill_id TEXT REFERENCES bills (id),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff_profiles (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  paid_payment_id TEXT REFERENCES payments (id),
  cancelled_at TEXT,
  CHECK ((reservation_id IS NULL) <> (bill_id IS NULL))
);
CREATE INDEX pay_links_reservation ON pay_links (reservation_id);
CREATE TRIGGER pay_links_no_delete BEFORE DELETE ON pay_links BEGIN SELECT RAISE(ABORT, 'history_immutable'); END;
CREATE TRIGGER pay_links_fixed BEFORE UPDATE ON pay_links
WHEN NEW.code IS NOT OLD.code OR NEW.reservation_id IS NOT OLD.reservation_id OR NEW.bill_id IS NOT OLD.bill_id
  OR NEW.amount_kobo IS NOT OLD.amount_kobo OR NEW.created_by IS NOT OLD.created_by
  OR (OLD.paid_payment_id IS NOT NULL AND NEW.paid_payment_id IS NOT OLD.paid_payment_id)
BEGIN SELECT RAISE(ABORT, 'pay_link_fixed'); END;
