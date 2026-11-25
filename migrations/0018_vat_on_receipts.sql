-- VAT on receipts is a setting in Booking rules, off by default. The hotel says it is VAT-registered,
-- but a VAT receipt needs its Tax ID (TIN), which isn't confirmed yet (Tobi, 25 Nov). It stays off
-- until the TIN is entered (migration 0019) and the setting switched on. The rate stays as set (7.5%).
-- Adds one column; existing settings are unchanged.
ALTER TABLE hotel_settings ADD COLUMN vat_on_receipts INTEGER NOT NULL DEFAULT 0 CHECK (vat_on_receipts IN (0, 1));
