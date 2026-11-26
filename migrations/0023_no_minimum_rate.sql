-- =============================================================================
-- No minimum room rate (Tobi, 25 Nov): a room type costs exactly what the hotel
-- sets in Rooms → Room types, now and after any later change. Drops the ₦40,000
-- floor from 0007. The rate must still be above zero (CHECK in 0001).
-- Bookings keep the rate agreed when they were made. No rows change.
-- =============================================================================
DROP TRIGGER room_categories_min_rate_insert;
DROP TRIGGER room_categories_min_rate_update;
