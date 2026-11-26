-- "Tonight" follows the business day (rules-and-edge-cases.md, decision of 25 Nov): before the 06:00
-- cut-off, last night is still bookable, so a guest arriving at 2am on the 26th books 25th → 26th.
-- The capacity triggers skipped nights before the calendar date, so that 2am booking had no night
-- checked at all. They now check from the business date: date('now', '-5 hours') is Lagos time
-- (UTC+1) less the 06:00 cut-off. Keep in step with policy.businessDayStartHour (src/config/policy.ts;
-- tests/db/availability.test.ts pins it). Otherwise unchanged from 0014. No rows change.

DROP TRIGGER reservations_capacity_insert;
DROP TRIGGER reservations_capacity_update;

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
    WHERE c.d >= max(NEW.check_in, date('now', '-5 hours')) AND c.d < NEW.check_out
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
    WHERE c.d >= max(NEW.check_in, date('now', '-5 hours')) AND c.d < NEW.check_out
  ), -1);
END;
