-- =============================================================================
-- A room asked for when the booking was made (from an empty cell on the room
-- calendar, interface brief I6). It is only a preference: rooms are still
-- assigned when the booking is paid (rule I4), and payment picks this room if
-- it's still free; otherwise the usual choice. Must be a room of the booking's
-- type. New nullable column; no existing rows change.
-- =============================================================================
ALTER TABLE reservations ADD COLUMN preferred_room_id TEXT REFERENCES rooms (id);

CREATE TRIGGER reservations_preferred_room_type BEFORE INSERT ON reservations
WHEN NEW.preferred_room_id IS NOT NULL
  AND (SELECT category_id FROM rooms WHERE id = NEW.preferred_room_id) IS NOT NEW.category_id
BEGIN
  SELECT RAISE(ABORT, 'preferred_room_type');
END;
