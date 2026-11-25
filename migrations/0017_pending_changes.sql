-- Money first for changes too (docs/rules-and-edge-cases.md, 2.1): a change that costs more on a
-- paid booking (room upgrade or move, extra nights) doesn't take effect until it's paid. It is
-- stored here as a pending change with its own price. Taking that payment applies it in the same
-- step; until then the booking is unchanged. The General Manager or Owner can apply one without
-- payment, with a reason (the guest then pays before check-out). Pending changes are never
-- deleted, and only move pending -> applied or cancelled. New table; no existing rows change.

CREATE TABLE reservation_changes (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations (id),
  kind TEXT NOT NULL CHECK (kind IN ('room', 'dates')),
  room_id TEXT REFERENCES rooms (id),
  check_in TEXT CHECK (check_in IS NULL OR date(check_in) = check_in),
  check_out TEXT CHECK (check_out IS NULL OR date(check_out) = check_out),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 3 AND 300),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'cancelled')),
  requested_by TEXT REFERENCES staff_profiles (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_by TEXT REFERENCES staff_profiles (id),
  decided_at TEXT,
  -- The payment that applied it; null when the General Manager or Owner applied it before payment.
  payment_id TEXT REFERENCES payments (id),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  CHECK ((kind = 'room' AND room_id IS NOT NULL AND check_in IS NULL AND check_out IS NULL)
      OR (kind = 'dates' AND room_id IS NULL AND check_in IS NOT NULL AND check_out IS NOT NULL AND check_out > check_in)),
  CHECK ((status = 'pending') = (decided_at IS NULL))
);

-- One pending change per booking at a time.
CREATE UNIQUE INDEX reservation_changes_one_pending ON reservation_changes (reservation_id) WHERE status = 'pending';

CREATE TRIGGER reservation_changes_no_delete BEFORE DELETE ON reservation_changes
BEGIN
  SELECT RAISE(ABORT, 'change_immutable');
END;

-- Only the decision is recorded, once: pending -> applied or cancelled. What was asked for and its price never change.
CREATE TRIGGER reservation_changes_guard BEFORE UPDATE ON reservation_changes
WHEN OLD.status <> 'pending'
  OR NEW.status NOT IN ('applied', 'cancelled')
  OR NEW.id IS NOT OLD.id OR NEW.reservation_id IS NOT OLD.reservation_id OR NEW.kind IS NOT OLD.kind
  OR NEW.room_id IS NOT OLD.room_id OR NEW.check_in IS NOT OLD.check_in OR NEW.check_out IS NOT OLD.check_out
  OR NEW.amount_kobo IS NOT OLD.amount_kobo OR NEW.description IS NOT OLD.description
  OR NEW.requested_by IS NOT OLD.requested_by OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'change_immutable');
END;

-- Applied without a payment: only with the approver and a reason on record.
CREATE TRIGGER reservation_changes_unpaid_needs_approval BEFORE UPDATE OF status ON reservation_changes
WHEN NEW.status = 'applied' AND NEW.payment_id IS NULL
 AND (NEW.decided_by IS NULL
      OR (SELECT role FROM staff_profiles WHERE id = NEW.decided_by) NOT IN ('owner', 'general_manager')
      OR length(trim(coalesce(NEW.note, ''))) < 5)
BEGIN
  SELECT RAISE(ABORT, 'change_needs_approval');
END;

-- A change applied by a payment must point to a successful payment on the same booking.
CREATE TRIGGER reservation_changes_paid_by_real_payment BEFORE UPDATE OF status ON reservation_changes
WHEN NEW.status = 'applied' AND NEW.payment_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = NEW.payment_id AND p.reservation_id = NEW.reservation_id AND p.status = 'successful' AND p.kind = 'payment')
BEGIN
  SELECT RAISE(ABORT, 'change_needs_approval');
END;
