-- =============================================================================
-- Reservation rules, enforced for every writer.
--
-- Errors are raised as short tokens (e.g. 'room_overlap'); the app maps each
-- to an error code and a message for staff or guests (src/server/db-errors.ts).
--
-- "Live" = holds inventory: confirmed, checked in, or awaiting payment with an
-- unexpired hold. Expired holds stop counting at once, whether or not the
-- clean-up job has run yet.
-- Hotel-local "today" is date('now', '+1 hour') (Africa/Lagos, UTC+1, no DST).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Lifecycle
-- ---------------------------------------------------------------------------
CREATE TRIGGER reservations_initial_status BEFORE INSERT ON reservations
WHEN NEW.status NOT IN ('pending_payment', 'confirmed')
BEGIN
  SELECT RAISE(ABORT, 'invalid_initial_status');
END;

CREATE TRIGGER reservations_guard_status BEFORE UPDATE OF status ON reservations
WHEN NEW.status <> OLD.status AND NOT (CASE OLD.status
  WHEN 'pending_payment' THEN NEW.status IN ('confirmed', 'cancelled', 'expired')
  WHEN 'confirmed'       THEN NEW.status IN ('checked_in', 'cancelled', 'no_show')
  WHEN 'checked_in'      THEN NEW.status = 'checked_out'
  -- A verified payment can arrive after the hold expired; it may revive the
  -- booking only if inventory is still available (capacity trigger below).
  WHEN 'expired'         THEN NEW.status = 'confirmed'
  ELSE 0                 -- checked_out, cancelled, no_show are final
END)
BEGIN
  SELECT RAISE(ABORT, 'invalid_transition');
END;

-- Keep lifecycle timestamps consistent with status; only pending bookings hold.
CREATE TRIGGER reservations_status_stamps AFTER UPDATE OF status ON reservations
WHEN NEW.status <> OLD.status
BEGIN
  UPDATE reservations SET
    confirmed_at   = CASE WHEN NEW.status = 'confirmed'   THEN coalesce(confirmed_at,   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE confirmed_at END,
    checked_in_at  = CASE WHEN NEW.status = 'checked_in'  THEN coalesce(checked_in_at,  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE checked_in_at END,
    checked_out_at = CASE WHEN NEW.status = 'checked_out' THEN coalesce(checked_out_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE checked_out_at END,
    cancelled_at   = CASE WHEN NEW.status = 'cancelled'   THEN coalesce(cancelled_at,   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE cancelled_at END,
    hold_expires_at = CASE WHEN NEW.status <> 'pending_payment' THEN NULL ELSE hold_expires_at END
  WHERE id = NEW.id;
END;

CREATE TRIGGER reservations_insert_stamps AFTER INSERT ON reservations
WHEN NEW.status = 'confirmed'
BEGIN
  UPDATE reservations SET confirmed_at = coalesce(confirmed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), hold_expires_at = NULL
  WHERE id = NEW.id;
END;

-- Stay details are frozen once the stay has ended…
CREATE TRIGGER reservations_guard_closed BEFORE UPDATE ON reservations
WHEN OLD.status IN ('checked_out', 'cancelled', 'expired', 'no_show') AND NEW.status = OLD.status AND (
  NEW.check_in IS NOT OLD.check_in OR NEW.check_out IS NOT OLD.check_out
  OR NEW.category_id IS NOT OLD.category_id OR NEW.room_id IS NOT OLD.room_id
  OR NEW.total_amount_kobo IS NOT OLD.total_amount_kobo OR NEW.guest_count IS NOT OLD.guest_count
)
BEGIN
  SELECT RAISE(ABORT, 'reservation_closed');
END;

-- …and arrival date and category can't change once the guest is in house.
CREATE TRIGGER reservations_guard_in_house BEFORE UPDATE ON reservations
WHEN OLD.status = 'checked_in' AND (NEW.check_in IS NOT OLD.check_in OR NEW.category_id IS NOT OLD.category_id)
BEGIN
  SELECT RAISE(ABORT, 'in_house_frozen');
END;

-- ---------------------------------------------------------------------------
-- A physical room can never hold two live reservations on the same night.
-- Ranges are [check_in, check_out): back-to-back stays are allowed.
-- (Status-based, like the Postgres exclusion constraint it replaces: a
-- pending booking keeps its room until it is expired or cancelled.)
-- ---------------------------------------------------------------------------
CREATE TRIGGER reservations_no_room_overlap_insert BEFORE INSERT ON reservations
WHEN NEW.room_id IS NOT NULL AND NEW.status IN ('pending_payment', 'confirmed', 'checked_in') AND EXISTS (
  SELECT 1 FROM reservations r
  WHERE r.room_id = NEW.room_id AND r.id <> NEW.id
    AND r.status IN ('pending_payment', 'confirmed', 'checked_in')
    AND r.check_in < NEW.check_out AND NEW.check_in < r.check_out
)
BEGIN
  SELECT RAISE(ABORT, 'room_overlap');
END;

CREATE TRIGGER reservations_no_room_overlap_update BEFORE UPDATE OF room_id, check_in, check_out, status ON reservations
WHEN NEW.room_id IS NOT NULL AND NEW.status IN ('pending_payment', 'confirmed', 'checked_in') AND EXISTS (
  SELECT 1 FROM reservations r
  WHERE r.room_id = NEW.room_id AND r.id <> NEW.id
    AND r.status IN ('pending_payment', 'confirmed', 'checked_in')
    AND r.check_in < NEW.check_out AND NEW.check_in < r.check_out
)
BEGIN
  SELECT RAISE(ABORT, 'room_overlap');
END;

-- ---------------------------------------------------------------------------
-- A room type can't be oversold on any night.
-- Capacity = active, in-service rooms of the category. Demand = other live
-- reservations covering the night, counted against the category of their
-- assigned room if any (so upgrades use the right inventory), else the booked
-- category. Nights already past are not re-checked (a guest moved mid-stay).
-- Checked when a booking becomes live, or a live booking's dates or
-- effective category change.
-- ---------------------------------------------------------------------------
CREATE TRIGGER reservations_capacity_insert BEFORE INSERT ON reservations
WHEN (NEW.status IN ('confirmed', 'checked_in')
      OR (NEW.status = 'pending_payment' AND NEW.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
BEGIN
  SELECT RAISE(ABORT, 'no_capacity')
  WHERE (
    SELECT count(*) FROM rooms
    WHERE category_id = coalesce((SELECT category_id FROM rooms WHERE id = NEW.room_id), NEW.category_id)
      AND is_active = 1 AND service_status = 'in_service'
  ) <= coalesce((
    SELECT max((
      SELECT count(*) FROM reservations r LEFT JOIN rooms rm ON rm.id = r.room_id
      WHERE r.id <> NEW.id AND r.check_in <= c.d AND r.check_out > c.d
        AND (r.status IN ('confirmed', 'checked_in')
             OR (r.status = 'pending_payment' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
        AND coalesce(rm.category_id, r.category_id) = coalesce((SELECT category_id FROM rooms WHERE id = NEW.room_id), NEW.category_id)
    ))
    FROM calendar c
    WHERE c.d >= max(NEW.check_in, date('now', '+1 hour')) AND c.d < NEW.check_out
  ), -1);
END;

CREATE TRIGGER reservations_capacity_update BEFORE UPDATE OF status, check_in, check_out, category_id, room_id, hold_expires_at ON reservations
WHEN (NEW.status IN ('confirmed', 'checked_in')
      OR (NEW.status = 'pending_payment' AND NEW.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
 AND (
   NOT (OLD.status IN ('confirmed', 'checked_in')
        OR (OLD.status = 'pending_payment' AND OLD.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
   OR NEW.check_in <> OLD.check_in OR NEW.check_out <> OLD.check_out
   OR coalesce((SELECT category_id FROM rooms WHERE id = NEW.room_id), NEW.category_id)
      <> coalesce((SELECT category_id FROM rooms WHERE id = OLD.room_id), OLD.category_id)
 )
BEGIN
  SELECT RAISE(ABORT, 'no_capacity')
  WHERE (
    SELECT count(*) FROM rooms
    WHERE category_id = coalesce((SELECT category_id FROM rooms WHERE id = NEW.room_id), NEW.category_id)
      AND is_active = 1 AND service_status = 'in_service'
  ) <= coalesce((
    SELECT max((
      SELECT count(*) FROM reservations r LEFT JOIN rooms rm ON rm.id = r.room_id
      WHERE r.id <> NEW.id AND r.check_in <= c.d AND r.check_out > c.d
        AND (r.status IN ('confirmed', 'checked_in')
             OR (r.status = 'pending_payment' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
        AND coalesce(rm.category_id, r.category_id) = coalesce((SELECT category_id FROM rooms WHERE id = NEW.room_id), NEW.category_id)
    ))
    FROM calendar c
    WHERE c.d >= max(NEW.check_in, date('now', '+1 hour')) AND c.d < NEW.check_out
  ), -1);
END;

-- ---------------------------------------------------------------------------
-- Website holds come from anonymous visitors: at most three live unpaid
-- website holds per email address, so nobody can tie up inventory.
-- ---------------------------------------------------------------------------
CREATE TRIGGER reservations_website_hold_limit BEFORE INSERT ON reservations
WHEN NEW.source = 'website' AND (
  SELECT count(*) FROM reservations r JOIN guests g ON g.id = r.guest_id
  WHERE g.email = (SELECT email FROM guests WHERE id = NEW.guest_id)
    AND r.source = 'website' AND r.status = 'pending_payment'
    AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
) >= 3
BEGIN
  SELECT RAISE(ABORT, 'too_many_holds');
END;

-- ---------------------------------------------------------------------------
-- Status history: who changed what, and why (from the request context).
-- ---------------------------------------------------------------------------
CREATE TRIGGER reservations_history_insert AFTER INSERT ON reservations
BEGIN
  INSERT INTO reservation_status_history (reservation_id, from_status, to_status, changed_by, reason)
  VALUES (NEW.id, NULL, NEW.status, (SELECT actor_id FROM _ctx WHERE id = 1), nullif((SELECT reason FROM _ctx WHERE id = 1), ''));
END;

CREATE TRIGGER reservations_history_update AFTER UPDATE OF status ON reservations
WHEN NEW.status <> OLD.status
BEGIN
  INSERT INTO reservation_status_history (reservation_id, from_status, to_status, changed_by, reason)
  VALUES (NEW.id, OLD.status, NEW.status, (SELECT actor_id FROM _ctx WHERE id = 1), nullif((SELECT reason FROM _ctx WHERE id = 1), ''));
END;

-- ---------------------------------------------------------------------------
-- Guest emails, queued in the same transaction as the change.
-- ---------------------------------------------------------------------------
CREATE TRIGGER reservations_queue_email AFTER UPDATE OF status ON reservations
WHEN NEW.status <> OLD.status AND NEW.status IN ('confirmed', 'cancelled')
BEGIN
  INSERT OR IGNORE INTO email_outbox (kind, reservation_id)
  VALUES (CASE NEW.status WHEN 'confirmed' THEN 'booking_confirmed' ELSE 'reservation_cancelled' END, NEW.id);
END;

-- Every change bumps the version (optimistic concurrency) and updated_at.
CREATE TRIGGER reservations_version AFTER UPDATE ON reservations
WHEN NEW.version = OLD.version
BEGIN
  UPDATE reservations SET version = OLD.version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
