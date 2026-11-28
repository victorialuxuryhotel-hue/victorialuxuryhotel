-- Payments at the desk and the till (FUNCTIONALITY.md sections 0 and 2).
-- A transfer needs the reference or the sender's name, plus the tick that the money was seen in the hotel's
-- own bank app. POS needs exactly the last 4 digits of the slip and the terminal. "Declined but the guest
-- was debited" writes no payment: it writes a payment issue for the GM and owner to check with the bank.
-- Rules apply to rows written after this migration; existing rows are unchanged.

ALTER TABLE payments ADD COLUMN sender_name TEXT CHECK (sender_name IS NULL OR length(trim(sender_name)) BETWEEN 2 AND 80);
ALTER TABLE payments ADD COLUMN slip_last4 TEXT CHECK (slip_last4 IS NULL OR slip_last4 GLOB '[0-9][0-9][0-9][0-9]');
ALTER TABLE payments ADD COLUMN terminal TEXT CHECK (terminal IS NULL OR length(trim(terminal)) BETWEEN 2 AND 40);
ALTER TABLE payments ADD COLUMN seen_in_bank_app INTEGER NOT NULL DEFAULT 0 CHECK (seen_in_bank_app IN (0, 1));

ALTER TABLE pos_orders ADD COLUMN sender_name TEXT CHECK (sender_name IS NULL OR length(trim(sender_name)) BETWEEN 2 AND 80);
ALTER TABLE pos_orders ADD COLUMN slip_last4 TEXT CHECK (slip_last4 IS NULL OR slip_last4 GLOB '[0-9][0-9][0-9][0-9]');
ALTER TABLE pos_orders ADD COLUMN terminal TEXT CHECK (terminal IS NULL OR length(trim(terminal)) BETWEEN 2 AND 40);
ALTER TABLE pos_orders ADD COLUMN seen_in_bank_app INTEGER NOT NULL DEFAULT 0 CHECK (seen_in_bank_app IN (0, 1));

-- Bank details shown to guests and on the transfer form. Empty = the screens show [HOTEL BANK] and so on.
ALTER TABLE hotel_settings ADD COLUMN bank_name TEXT CHECK (bank_name IS NULL OR length(trim(bank_name)) BETWEEN 2 AND 60);
ALTER TABLE hotel_settings ADD COLUMN bank_account_number TEXT CHECK (bank_account_number IS NULL OR bank_account_number GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
ALTER TABLE hotel_settings ADD COLUMN bank_account_name TEXT CHECK (bank_account_name IS NULL OR length(trim(bank_account_name)) BETWEEN 2 AND 80);
-- The POS terminals, so the terminal is chosen from a list (JSON array of names).
ALTER TABLE hotel_settings ADD COLUMN terminals TEXT NOT NULL DEFAULT '["Front desk terminal","Bar terminal"]'
  CHECK (json_valid(terminals) AND json_type(terminals) = 'array' AND json_array_length(terminals) <= 10);

-- Desk payments: transfer = reference or sender's name + the bank-app tick; POS = 4-digit slip + terminal.
DROP TRIGGER payments_complete_insert;
CREATE TRIGGER payments_complete_insert BEFORE INSERT ON payments
WHEN NEW.status = 'successful' AND NEW.kind = 'payment' AND (
  (NEW.provider = 'offline' AND (NEW.method IS NULL OR NEW.recorded_by IS NULL
    OR (NEW.method = 'bank_transfer' AND (NEW.seen_in_bank_app <> 1
        OR (length(trim(coalesce(NEW.provider_reference, ''))) < 3 AND length(trim(coalesce(NEW.sender_name, ''))) < 2)))
    OR (NEW.method = 'pos_terminal' AND (NEW.slip_last4 IS NULL OR NEW.terminal IS NULL))))
  OR (NEW.provider = 'paystack' AND (NEW.provider_reference IS NULL OR NEW.verified_at IS NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'payment_incomplete');
END;

-- The slip now has its own column; the old rule (digits inside provider_reference) is replaced by the one above.
DROP TRIGGER payments_pos_slip;

-- A repeated transfer reference is warned about on screen, not refused (section 2, duplicate guard).
-- Paystack references stay unique.
DROP INDEX payments_provider_reference_key;
CREATE UNIQUE INDEX payments_provider_reference_key ON payments (provider_reference) WHERE provider = 'paystack' AND provider_reference IS NOT NULL;
CREATE INDEX payments_recent_refs ON payments (provider_reference, paid_at) WHERE provider = 'offline';
CREATE INDEX payments_recent_slips ON payments (slip_last4, paid_at) WHERE slip_last4 IS NOT NULL;

-- Till sales: the same rules when an order is paid.
DROP TRIGGER pos_orders_payment_reference;
CREATE TRIGGER pos_orders_payment_reference BEFORE UPDATE OF status ON pos_orders
WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND (
  (NEW.method = 'bank_transfer' AND (NEW.seen_in_bank_app <> 1
      OR (length(trim(coalesce(NEW.payment_reference, ''))) < 3 AND length(trim(coalesce(NEW.sender_name, ''))) < 2)))
  OR (NEW.method = 'pos_terminal' AND (NEW.slip_last4 IS NULL OR NEW.terminal IS NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'payment_needs_reference');
END;
CREATE INDEX pos_orders_recent_slips ON pos_orders (slip_last4, paid_at) WHERE slip_last4 IS NOT NULL;

-- Nobody confirms a payment they recorded themselves (section 0).
CREATE TRIGGER payment_checks_not_own BEFORE INSERT ON payment_checks
WHEN NEW.checked_by = (CASE NEW.source_type
  WHEN 'payment' THEN (SELECT recorded_by FROM payments WHERE id = NEW.source_id)
  WHEN 'hall_payment' THEN (SELECT recorded_by FROM hall_payments WHERE id = NEW.source_id)
  WHEN 'pos_order' THEN (SELECT paid_by FROM pos_orders WHERE id = NEW.source_id)
END)
BEGIN
  SELECT RAISE(ABORT, 'payment_check_own_payment');
END;

-- "Declined but the guest was debited": no payment is written. The GM or owner checks with the bank; if the
-- money did arrive, they record it as a payment against the original booking or order and close the issue
-- with that payment. Closed once; never deleted.
CREATE TABLE payment_issues (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('reservation', 'pos_order')),
  source_id TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  terminal TEXT CHECK (terminal IS NULL OR length(trim(terminal)) BETWEEN 2 AND 40),
  slip_last4 TEXT CHECK (slip_last4 IS NULL OR slip_last4 GLOB '[0-9][0-9][0-9][0-9]'),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  reported_by TEXT NOT NULL REFERENCES staff_profiles (id),
  reported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_by TEXT REFERENCES staff_profiles (id),
  resolved_at TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('money_arrived', 'not_debited', 'refunded_by_bank')),
  resolution_note TEXT CHECK (resolution_note IS NULL OR length(resolution_note) <= 500),
  -- The payment (payments.id) or paid order (pos_orders.id) recorded when the money did arrive.
  payment_id TEXT,
  CHECK ((resolved_at IS NULL) = (resolved_by IS NULL) AND (resolved_at IS NULL) = (outcome IS NULL)),
  CHECK (outcome IS NOT 'money_arrived' OR payment_id IS NOT NULL)
);
CREATE INDEX payment_issues_open ON payment_issues (reported_at) WHERE resolved_at IS NULL;
CREATE INDEX payment_issues_source ON payment_issues (source_type, source_id);

CREATE TRIGGER payment_issues_no_delete BEFORE DELETE ON payment_issues BEGIN SELECT RAISE(ABORT, 'history_immutable'); END;
-- Only the resolution can be written, once.
CREATE TRIGGER payment_issues_resolve_once BEFORE UPDATE ON payment_issues
WHEN OLD.resolved_at IS NOT NULL
  OR NEW.source_type IS NOT OLD.source_type OR NEW.source_id IS NOT OLD.source_id OR NEW.amount_kobo IS NOT OLD.amount_kobo
  OR NEW.terminal IS NOT OLD.terminal OR NEW.slip_last4 IS NOT OLD.slip_last4 OR NEW.note IS NOT OLD.note
  OR NEW.reported_by IS NOT OLD.reported_by OR NEW.reported_at IS NOT OLD.reported_at
BEGIN
  SELECT RAISE(ABORT, 'payment_issue_closed');
END;
-- Whoever reported it doesn't close it.
CREATE TRIGGER payment_issues_not_own BEFORE UPDATE OF resolved_by ON payment_issues
WHEN NEW.resolved_by = OLD.reported_by
BEGIN
  SELECT RAISE(ABORT, 'payment_check_own_payment');
END;
