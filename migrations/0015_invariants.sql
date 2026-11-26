-- Invariants from docs/rules-and-edge-cases.md, section 3: states that must be impossible.
-- Each one is a trigger here and a test in tests/db/invariants.test.ts named after the rule.
-- These check new writes only: no existing rows are changed. Before applying to production,
-- run the read-only checks in docs/release-review.md ("What 0015 changes") to see whether any
-- existing row already breaks a rule, so staff can resolve it.

-- I3. A booking can't be checked in or checked out while money is owed.
-- (Undoing a check-out, checked_out -> checked_in, is not a new check-in and is not checked.)
CREATE TRIGGER reservations_paid_before_check_in_out BEFORE UPDATE OF status ON reservations
WHEN ((OLD.status = 'confirmed' AND NEW.status = 'checked_in') OR (OLD.status = 'checked_in' AND NEW.status = 'checked_out'))
 AND (SELECT coalesce(sum(CASE WHEN p.kind = 'payment' THEN p.amount_kobo ELSE -p.amount_kobo END), 0)
      FROM payments p WHERE p.reservation_id = NEW.id AND p.status = 'successful')
     < NEW.total_amount_kobo + NEW.extras_kobo + NEW.room_change_kobo - NEW.discount_kobo
BEGIN
  SELECT RAISE(ABORT, 'not_paid');
END;

-- I4. A booking awaiting payment can't be given a room; it is assigned when the payment is recorded.
CREATE TRIGGER reservations_no_room_before_payment_insert BEFORE INSERT ON reservations
WHEN NEW.status = 'pending_payment' AND NEW.room_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'room_before_payment');
END;

CREATE TRIGGER reservations_no_room_before_payment_update BEFORE UPDATE OF room_id, status ON reservations
WHEN NEW.status = 'pending_payment' AND NEW.room_id IS NOT NULL
 AND (OLD.room_id IS NOT NEW.room_id OR OLD.status <> 'pending_payment')
BEGIN
  SELECT RAISE(ABORT, 'room_before_payment');
END;

-- I7. A successful payment says how it was paid and who took it (desk) or was verified (online).
-- A bank transfer needs its reference (or the sender's name), so it can be found on the statement.
CREATE TRIGGER payments_complete_insert BEFORE INSERT ON payments
WHEN NEW.status = 'successful' AND NEW.kind = 'payment' AND (
  (NEW.provider = 'offline' AND (NEW.method IS NULL OR NEW.recorded_by IS NULL
    OR (NEW.method = 'bank_transfer' AND length(trim(coalesce(NEW.provider_reference, ''))) < 3)))
  OR (NEW.provider = 'paystack' AND (NEW.provider_reference IS NULL OR NEW.verified_at IS NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'payment_incomplete');
END;

CREATE TRIGGER payments_complete_update BEFORE UPDATE OF status ON payments
WHEN NEW.status = 'successful' AND OLD.status <> 'successful' AND NEW.provider = 'paystack'
 AND (NEW.provider_reference IS NULL OR NEW.verified_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'payment_incomplete');
END;

CREATE TRIGGER hall_payments_transfer_reference BEFORE INSERT ON hall_payments
WHEN NEW.method = 'bank_transfer' AND length(trim(coalesce(NEW.reference, ''))) < 3
BEGIN
  SELECT RAISE(ABORT, 'payment_incomplete');
END;

-- I9. A hall booking is confirmed only when it has a price and is paid in full.
CREATE TRIGGER hall_bookings_confirmed_paid_insert BEFORE INSERT ON hall_bookings
WHEN NEW.status = 'confirmed'
BEGIN
  SELECT RAISE(ABORT, 'hall_not_paid');
END;

CREATE TRIGGER hall_bookings_confirmed_paid_update BEFORE UPDATE OF status, price_kobo ON hall_bookings
WHEN NEW.status = 'confirmed' AND (
  NEW.price_kobo <= 0
  OR (SELECT coalesce(sum(amount_kobo), 0) FROM hall_payments WHERE booking_id = NEW.id) < NEW.price_kobo
)
BEGIN
  SELECT RAISE(ABORT, 'hall_not_paid');
END;

-- I10. A bar or restaurant order paid by transfer carries the transfer reference (or sender's name).
ALTER TABLE pos_orders ADD COLUMN transfer_reference TEXT CHECK (transfer_reference IS NULL OR length(transfer_reference) <= 80);

CREATE TRIGGER pos_orders_transfer_reference BEFORE UPDATE OF status ON pos_orders
WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.method = 'bank_transfer'
 AND length(trim(coalesce(NEW.transfer_reference, ''))) < 3
BEGIN
  SELECT RAISE(ABORT, 'transfer_needs_reference');
END;

-- I13. Charge-to-room is out of scope: nothing may write to the retired sales table.
CREATE TRIGGER sales_retired BEFORE INSERT ON sales
BEGIN
  SELECT RAISE(ABORT, 'sales_retired');
END;
