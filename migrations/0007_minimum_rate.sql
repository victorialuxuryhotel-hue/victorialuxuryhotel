-- =============================================================================
-- Room types can't be priced below ₦40,000 a night (4,000,000 kobo).
-- Keep in step with MIN_NIGHTLY_RATE_KOBO in src/domain/pricing.ts.
-- Bookings keep the rate agreed when they were made, so only room_categories
-- is checked.
-- =============================================================================
CREATE TRIGGER room_categories_min_rate_insert BEFORE INSERT ON room_categories
WHEN NEW.nightly_rate_kobo < 4000000
BEGIN
  SELECT RAISE(ABORT, 'rate_below_minimum');
END;

CREATE TRIGGER room_categories_min_rate_update BEFORE UPDATE OF nightly_rate_kobo ON room_categories
WHEN NEW.nightly_rate_kobo < 4000000
BEGIN
  SELECT RAISE(ABORT, 'rate_below_minimum');
END;
