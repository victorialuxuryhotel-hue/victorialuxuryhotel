-- The hotel's Tax ID (TIN), shown on every receipt and bill when VAT is shown (hardware brief,
-- go-live config). VAT can't be switched on without it: a VAT receipt must carry the TIN.
-- Adds one empty column and one rule; existing settings are unchanged.
ALTER TABLE hotel_settings ADD COLUMN tax_id TEXT CHECK (tax_id IS NULL OR length(trim(tax_id)) BETWEEN 5 AND 30);

CREATE TRIGGER hotel_settings_vat_needs_tax_id BEFORE UPDATE OF vat_on_receipts, tax_id ON hotel_settings
WHEN NEW.vat_on_receipts = 1 AND length(trim(coalesce(NEW.tax_id, ''))) < 5
BEGIN
  SELECT RAISE(ABORT, 'vat_needs_tax_id');
END;
