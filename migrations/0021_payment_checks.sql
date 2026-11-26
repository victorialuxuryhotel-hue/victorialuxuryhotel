-- Payments to confirm (interface brief I1): the second half of transfer and card proof. The General
-- Manager or Owner ticks each non-cash payment off against the bank statement or the terminal
-- report. One check per payment, never changed or deleted (like other money records). Payments
-- themselves are not changed. New table; no existing rows change.

CREATE TABLE payment_checks (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('payment', 'hall_payment', 'pos_order')),
  source_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('matched', 'not_found')),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  checked_by TEXT NOT NULL REFERENCES staff_profiles (id),
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source_type, source_id),
  -- "Not found" says what was checked, for the correction that follows.
  CHECK (outcome = 'matched' OR length(trim(coalesce(note, ''))) >= 5)
);

CREATE TRIGGER payment_checks_no_update BEFORE UPDATE ON payment_checks
BEGIN
  SELECT RAISE(ABORT, 'payment_check_immutable');
END;

CREATE TRIGGER payment_checks_no_delete BEFORE DELETE ON payment_checks
BEGIN
  SELECT RAISE(ABORT, 'payment_check_immutable');
END;

-- Only the General Manager or Owner confirms (finance reads the list).
CREATE TRIGGER payment_checks_who BEFORE INSERT ON payment_checks
WHEN (SELECT role FROM staff_profiles WHERE id = NEW.checked_by) NOT IN ('owner', 'general_manager')
BEGIN
  SELECT RAISE(ABORT, 'payment_check_forbidden');
END;
