-- Check-in is any time on the arrival day; check-out stays by 12:00 (decided by Tobi, 25 Nov;
-- docs/rules-and-edge-cases.md, section 7.5). In Booking rules a check-in time of 00:00 means
-- "any time on the arrival day", so the free-cancellation window counts back from the start of
-- the arrival day. Changes one setting; the hotel can set another time in Booking rules later.
UPDATE hotel_settings SET check_in_time = '00:00' WHERE id = 1;
