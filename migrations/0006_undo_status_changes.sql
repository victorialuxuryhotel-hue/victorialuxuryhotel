-- =============================================================================
-- Undo for room assignment and status changes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Undo. The lifecycle normally only moves forward. These reversals are
-- allowed ONLY when the request context says the change is an undo (set by
-- the undo action, which checks the short undo window, the actor and that
-- nothing else has happened to the booking since):
--   checked_in  → confirmed     (undo check-in)
--   checked_out → checked_in    (undo check-out)
--   no_show     → confirmed     (undo no-show)
-- Cancellation is never undoable: the guest has already been emailed.
-- ---------------------------------------------------------------------------
DROP TRIGGER reservations_guard_status;
CREATE TRIGGER reservations_guard_status BEFORE UPDATE OF status ON reservations
WHEN NEW.status <> OLD.status AND NOT (CASE OLD.status
  WHEN 'pending_payment' THEN NEW.status IN ('confirmed', 'cancelled', 'expired')
  WHEN 'confirmed'       THEN NEW.status IN ('checked_in', 'cancelled', 'no_show')
  WHEN 'checked_in'      THEN NEW.status = 'checked_out'
  WHEN 'expired'         THEN NEW.status = 'confirmed'
  ELSE 0
END) AND NOT (
  coalesce((SELECT reason FROM _ctx WHERE id = 1), '') = 'Undone'
  AND ((OLD.status = 'checked_in' AND NEW.status = 'confirmed')
    OR (OLD.status = 'checked_out' AND NEW.status = 'checked_in')
    OR (OLD.status = 'no_show' AND NEW.status = 'confirmed'))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid_transition');
END;
