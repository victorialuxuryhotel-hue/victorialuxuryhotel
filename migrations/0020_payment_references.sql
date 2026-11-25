-- Every non-cash payment can be checked against the bank or the card terminal (hardware brief H1, H2).
-- I15: a bar/restaurant order paid by POS/card needs the last 4 digits of the terminal slip; one paid
--      by transfer still needs its reference. The column is renamed to fit both (data kept).
-- I16: a desk payment by POS/card needs the last 4 digits of the slip (transfers already need a
--      reference, rule I7). Applies to payments recorded after this migration; old rows are unchanged.

ALTER TABLE pos_orders RENAME COLUMN transfer_reference TO payment_reference;

DROP TRIGGER pos_orders_transfer_reference;

CREATE TRIGGER pos_orders_payment_reference BEFORE UPDATE OF status ON pos_orders
WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND (
  (NEW.method = 'bank_transfer' AND length(trim(coalesce(NEW.payment_reference, ''))) < 3)
  OR (NEW.method = 'pos_terminal' AND coalesce(NEW.payment_reference, '') NOT GLOB '[0-9][0-9][0-9][0-9]')
)
BEGIN
  SELECT RAISE(ABORT, 'payment_needs_reference');
END;

CREATE TRIGGER payments_pos_slip BEFORE INSERT ON payments
WHEN NEW.status = 'successful' AND NEW.kind = 'payment' AND NEW.provider = 'offline' AND NEW.method = 'pos_terminal'
 AND coalesce(NEW.provider_reference, '') NOT GLOB '*[0-9][0-9][0-9][0-9]*'
BEGIN
  SELECT RAISE(ABORT, 'payment_needs_reference');
END;

-- A repeated transfer reference is still refused (the same transfer recorded twice). POS slips are
-- recorded by their last 4 digits, which can repeat between genuine sales, so they're left out of
-- that check. Paystack references stay unique.
DROP INDEX payments_provider_reference_key;
CREATE UNIQUE INDEX payments_provider_reference_key ON payments (provider, provider_reference)
  WHERE provider_reference IS NOT NULL AND coalesce(method, '') <> 'pos_terminal';
