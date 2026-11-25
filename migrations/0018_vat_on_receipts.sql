-- VAT on receipts is a setting in Booking rules. The hotel is VAT-registered (confirmed by Tobi,
-- 25 Nov), so it is switched on here; the rate stays as set (7.5%). Receipts, bills, the till,
-- reports and the income download show VAT while this is on. Adds one column and sets it.
ALTER TABLE hotel_settings ADD COLUMN vat_on_receipts INTEGER NOT NULL DEFAULT 0 CHECK (vat_on_receipts IN (0, 1));
UPDATE hotel_settings SET vat_on_receipts = 1 WHERE id = 1;
