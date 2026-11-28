-- Closing the gaps between the designs and the first build.

-- Room pages (G2, G3, M4, M5): the room's size, shown as "About 30 m²". Empty = not shown.
ALTER TABLE room_categories ADD COLUMN size_sqm INTEGER CHECK (size_sqm IS NULL OR size_sqm BETWEEN 5 AND 500);

-- Your details (G5, M2): "Arriving around", so the desk knows when to expect the guest. Optional, HH:MM.
ALTER TABLE reservations ADD COLUMN arrival_time TEXT CHECK (arrival_time IS NULL OR arrival_time GLOB '[0-2][0-9]:[0-5][0-9]');

-- Company bills paid online (P3, section 11): the Paystack reference of the link's payment, split across the bill's
-- bookings when it succeeds.
ALTER TABLE pay_links ADD COLUMN paystack_reference TEXT;
CREATE UNIQUE INDEX pay_links_paystack_reference ON pay_links (paystack_reference) WHERE paystack_reference IS NOT NULL;
