-- =============================================================================
-- Till improvements (interface brief I8).
-- 1. A note per order line ("No ice", "Well done"), printed under the item on
--    the receipt. The same item with a different note is a separate line.
-- 2. The last round of an unpaid order: the lines added at its latest save, as
--    JSON [{menuItemId, quantity, note}], for the till's "Same again". Added
--    again at the menu's prices on the day; only a convenience, never money.
-- New nullable columns; no existing rows change.
-- =============================================================================
ALTER TABLE pos_order_items ADD COLUMN note TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 60);
ALTER TABLE pos_orders ADD COLUMN last_round TEXT CHECK (last_round IS NULL OR json_valid(last_round));
