-- The extra a guest pays for moving to a dearer room type, for the nights left.
-- Kept apart from the room price, which stays rate × nights.
ALTER TABLE reservations ADD COLUMN room_change_kobo INTEGER NOT NULL DEFAULT 0 CHECK (room_change_kobo >= 0);

-- Agreed cancellation window: free until 24 hours before check-in.
UPDATE hotel_settings SET free_cancel_hours = 24 WHERE id = 1;
