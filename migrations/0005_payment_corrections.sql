-- =============================================================================
-- Payment corrections.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Payment corrections: payments are never edited. A manager records a
-- correction, a new row of kind 'refund' linked to the payment it corrects.
-- ---------------------------------------------------------------------------
ALTER TABLE payments ADD COLUMN corrects_payment_id TEXT REFERENCES payments (id) ON DELETE RESTRICT;

CREATE TRIGGER payments_correction_shape BEFORE INSERT ON payments
WHEN NEW.corrects_payment_id IS NOT NULL AND (
  NEW.kind <> 'refund'
  OR NOT EXISTS (
    SELECT 1 FROM payments o
    WHERE o.id = NEW.corrects_payment_id AND o.reservation_id = NEW.reservation_id
      AND o.kind = 'payment' AND o.status = 'successful'
  )
  -- Never correct more than was paid with that payment.
  OR NEW.amount_kobo + coalesce((
    SELECT sum(c.amount_kobo) FROM payments c WHERE c.corrects_payment_id = NEW.corrects_payment_id AND c.status = 'successful'
  ), 0) > (SELECT o.amount_kobo FROM payments o WHERE o.id = NEW.corrects_payment_id)
)
BEGIN
  SELECT RAISE(ABORT, 'invalid_correction');
END;
