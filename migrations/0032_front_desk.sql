-- Walk-in, check-in with a registration card, and check-out (FUNCTIONALITY.md sections 4, 5, 6, 7).

-- 4. "Save without paying" on a walk-in holds the room type for this long (default 6 hours).
ALTER TABLE hotel_settings ADD COLUMN walkin_hold_hours INTEGER NOT NULL DEFAULT 6 CHECK (walkin_hold_hours BETWEEN 1 AND 48);

-- 5. One registration card per stay. Only the last 4 characters of the ID number are ever stored.
CREATE TABLE guest_registrations (
  reservation_id TEXT PRIMARY KEY REFERENCES reservations (id),
  id_type TEXT NOT NULL CHECK (id_type IN ('nin', 'passport', 'drivers_licence', 'voters_card', 'other')),
  id_last4 TEXT NOT NULL CHECK (length(id_last4) = 4 AND id_last4 = upper(id_last4) AND id_last4 NOT GLOB '*[^0-9A-Z]*'),
  address TEXT NOT NULL CHECK (length(trim(address)) BETWEEN 3 AND 200),
  coming_from TEXT NOT NULL CHECK (length(trim(coming_from)) BETWEEN 2 AND 80),
  nationality TEXT NOT NULL CHECK (length(trim(nationality)) BETWEEN 2 AND 60),
  purpose TEXT NOT NULL CHECK (purpose IN ('business', 'leisure', 'family', 'event', 'other')),
  rules_accepted_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES staff_profiles (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TRIGGER guest_registrations_no_delete BEFORE DELETE ON guest_registrations BEGIN SELECT RAISE(ABORT, 'history_immutable'); END;

-- 6. "Leave owing" at check-out: a manager (payments.override) lets the guest go with a balance, with a reason.
ALTER TABLE reservations ADD COLUMN left_owing_by TEXT REFERENCES staff_profiles (id);
ALTER TABLE reservations ADD COLUMN left_owing_at TEXT;
ALTER TABLE reservations ADD COLUMN left_owing_reason TEXT CHECK (left_owing_reason IS NULL OR length(trim(left_owing_reason)) BETWEEN 5 AND 300);

-- I3 again, with one exception: a check-out a manager agreed to leave owing (set in the same update).
DROP TRIGGER reservations_paid_before_check_in_out;
CREATE TRIGGER reservations_paid_before_check_in_out BEFORE UPDATE OF status ON reservations
WHEN ((OLD.status = 'confirmed' AND NEW.status = 'checked_in')
      OR (OLD.status = 'checked_in' AND NEW.status = 'checked_out' AND (NEW.left_owing_by IS NULL OR NEW.left_owing_reason IS NULL)))
 AND (SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0)
      FROM payments p WHERE p.reservation_id = NEW.id AND p.status = 'successful')
     < NEW.total_amount_kobo + NEW.extras_kobo + NEW.room_change_kobo - NEW.discount_kobo
BEGIN
  SELECT RAISE(ABORT, 'not_paid');
END;

-- 7. Refund requests: the desk asks (from the booking or at check-out); the GM or owner decides (X10, next step).
CREATE TABLE refund_requests (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations (id),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  method TEXT NOT NULL CHECK (method IN ('bank_transfer', 'cash')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 500),
  requested_by TEXT NOT NULL REFERENCES staff_profiles (id),
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_by TEXT REFERENCES staff_profiles (id),
  decided_at TEXT,
  decision TEXT CHECK (decision IS NULL OR decision IN ('approved', 'declined')),
  decision_note TEXT CHECK (decision_note IS NULL OR length(decision_note) <= 500),
  payment_id TEXT REFERENCES payments (id),
  CHECK ((decided_at IS NULL) = (decided_by IS NULL) AND (decided_at IS NULL) = (decision IS NULL)),
  CHECK (decision IS NOT 'approved' OR payment_id IS NOT NULL),
  CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
CREATE INDEX refund_requests_open ON refund_requests (requested_at) WHERE decided_at IS NULL;
CREATE INDEX refund_requests_reservation ON refund_requests (reservation_id);
CREATE TRIGGER refund_requests_no_delete BEFORE DELETE ON refund_requests BEGIN SELECT RAISE(ABORT, 'history_immutable'); END;
CREATE TRIGGER refund_requests_decide_once BEFORE UPDATE ON refund_requests
WHEN OLD.decided_at IS NOT NULL OR NEW.reservation_id IS NOT OLD.reservation_id OR NEW.amount_kobo IS NOT OLD.amount_kobo
  OR NEW.method IS NOT OLD.method OR NEW.reason IS NOT OLD.reason OR NEW.requested_by IS NOT OLD.requested_by OR NEW.requested_at IS NOT OLD.requested_at
BEGIN
  SELECT RAISE(ABORT, 'refund_decided');
END;
