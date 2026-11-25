-- VAT on receipts is a setting, off by default (fix brief #9; docs/rules-and-edge-cases.md, 7.9).
-- VAT is out of scope (contract Schedule B) until the hotel confirms it is VAT-registered. The rate
-- stays as set; receipts, bills, the till and reports show VAT only when this is switched on in
-- Booking rules. Adds one column; existing settings are unchanged.
ALTER TABLE hotel_settings ADD COLUMN vat_on_receipts INTEGER NOT NULL DEFAULT 0 CHECK (vat_on_receipts IN (0, 1));
