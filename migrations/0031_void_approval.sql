-- Void at the counter with a manager's PIN (FUNCTIONALITY.md section 3; design X9).
-- The salesperson picks a reason (and, for cash, ticks that the cash went back to the customer); a manager
-- (restaurant & bar manager, general manager or owner) who didn't make the sale approves with their PIN.
-- Voids from before this migration keep their reason and stay as they were.

ALTER TABLE pos_orders ADD COLUMN void_approved_by TEXT REFERENCES staff_profiles (id);
ALTER TABLE pos_orders ADD COLUMN void_reason_code TEXT CHECK (void_reason_code IS NULL OR void_reason_code IN ('rung_up_wrongly', 'customer_changed_mind', 'item_unavailable', 'other'));
ALTER TABLE pos_orders ADD COLUMN void_cash_returned INTEGER CHECK (void_cash_returned IS NULL OR void_cash_returned IN (0, 1));

CREATE TRIGGER pos_orders_void_approved BEFORE UPDATE OF status ON pos_orders
WHEN NEW.status = 'void' AND OLD.status <> 'void' AND (
  NEW.void_approved_by IS NULL
  OR NEW.void_approved_by = OLD.paid_by
  OR NEW.void_reason_code IS NULL
  OR (OLD.method = 'cash' AND coalesce(NEW.void_cash_returned, 0) <> 1)
  OR (SELECT CASE
        WHEN department_lead = 1 AND department = 'restaurant_bar' THEN 'restaurant_bar_manager'
        WHEN department_lead = 1 AND department IS NULL AND role = 'front_desk' THEN 'hotel_manager'
        ELSE coalesce(department, role) END
      FROM staff_profiles WHERE id = NEW.void_approved_by AND is_active = 1) NOT IN ('restaurant_bar_manager', 'general_manager', 'owner')
  OR NOT EXISTS (SELECT 1 FROM staff_profiles WHERE id = NEW.void_approved_by AND is_active = 1)
)
BEGIN
  SELECT RAISE(ABORT, 'void_needs_manager');
END;

-- The payment details added in 0030 are frozen with the rest of a paid order (pos_orders_frozen predates them).
CREATE TRIGGER pos_orders_payment_frozen BEFORE UPDATE ON pos_orders
WHEN OLD.status <> 'open' AND (
  NEW.payment_reference IS NOT OLD.payment_reference OR NEW.sender_name IS NOT OLD.sender_name OR NEW.slip_last4 IS NOT OLD.slip_last4
  OR NEW.terminal IS NOT OLD.terminal OR NEW.seen_in_bank_app IS NOT OLD.seen_in_bank_app
)
BEGIN
  SELECT RAISE(ABORT, 'order_immutable');
END;
