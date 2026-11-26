-- A room is occupied from check-in until check-out, whatever the booking dates say.
--
-- Before: the room and capacity rules compared booking dates only. A guest still checked in
-- after their check-out date (an overstay) stopped "covering" any night, so their room could be
-- assigned to someone else and their room type sold again.
--
-- After: a checked-in stay is treated as ending no earlier than tomorrow (hotel time,
-- Africa/Lagos = UTC+1), so it keeps holding its room and its room type until the guest is
-- checked out.
--
-- The expression used for "the stay's effective end" everywhere below:
--   CASE WHEN status = 'checked_in' THEN max(check_out, date('now', '+1 hour', '+1 day')) ELSE check_out END

DROP TRIGGER reservations_no_room_overlap_insert;
DROP TRIGGER reservations_no_room_overlap_update;
DROP TRIGGER reservations_capacity_insert;
DROP TRIGGER reservations_capacity_update;

CREATE TRIGGER reservations_no_room_overlap_insert BEFORE INSERT ON reservations
WHEN NEW.room_id IS NOT NULL AND NEW.status IN ('pending_payment', 'confirmed', 'checked_in') AND EXISTS (
  SELECT 1 FROM reservations r
  WHERE r.room_id = NEW.room_id AND r.id <> NEW.id
    AND r.status IN ('pending_payment', 'confirmed', 'checked_in')
    AND r.check_in < (CASE WHEN NEW.status = 'checked_in' THEN max(NEW.check_out, date('now', '+1 hour', '+1 day')) ELSE NEW.check_out END)
    AND NEW.check_in < (CASE WHEN r.status = 'checked_in' THEN max(r.check_out, date('now', '+1 hour', '+1 day')) ELSE r.check_out END)
)
BEGIN
  SELECT RAISE(ABORT, 'room_overlap');
END;

CREATE TRIGGER reservations_no_room_overlap_update BEFORE UPDATE OF room_id, check_in, check_out, status ON reservations
WHEN NEW.room_id IS NOT NULL AND NEW.status IN ('pending_payment', 'confirmed', 'checked_in') AND EXISTS (
  SELECT 1 FROM reservations r
  WHERE r.room_id = NEW.room_id AND r.id <> NEW.id
    AND r.status IN ('pending_payment', 'confirmed', 'checked_in')
    AND r.check_in < (CASE WHEN NEW.status = 'checked_in' THEN max(NEW.check_out, date('now', '+1 hour', '+1 day')) ELSE NEW.check_out END)
    AND NEW.check_in < (CASE WHEN r.status = 'checked_in' THEN max(r.check_out, date('now', '+1 hour', '+1 day')) ELSE r.check_out END)
)
BEGIN
  SELECT RAISE(ABORT, 'room_overlap');
END;

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
      WHERE r.id <> NEW.id AND r.check_in <= c.d
        AND (CASE WHEN r.status = 'checked_in' THEN max(r.check_out, date('now', '+1 hour', '+1 day')) ELSE r.check_out END) > c.d
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
      WHERE r.id <> NEW.id AND r.check_in <= c.d
        AND (CASE WHEN r.status = 'checked_in' THEN max(r.check_out, date('now', '+1 hour', '+1 day')) ELSE r.check_out END) > c.d
        AND (r.status IN ('confirmed', 'checked_in')
             OR (r.status = 'pending_payment' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
        AND coalesce(rm.category_id, r.category_id) = coalesce((SELECT category_id FROM rooms WHERE id = NEW.room_id), NEW.category_id)
    ))
    FROM calendar c
    WHERE c.d >= max(NEW.check_in, date('now', '+1 hour')) AND c.d < NEW.check_out
  ), -1);
END;
