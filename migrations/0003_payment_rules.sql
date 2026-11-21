-- =============================================================================
-- Payment rules, enforced for every writer.
-- =============================================================================

-- A successful payment is a financial record: its amount, reservation and
-- outcome can't change. Corrections are new rows (e.g. a refund).
CREATE TRIGGER payments_guard_final BEFORE UPDATE ON payments
WHEN OLD.status = 'successful' AND (
  NEW.status IS NOT OLD.status OR NEW.amount_kobo IS NOT OLD.amount_kobo
  OR NEW.reservation_id IS NOT OLD.reservation_id OR NEW.kind IS NOT OLD.kind
  OR NEW.provider IS NOT OLD.provider OR NEW.provider_reference IS NOT OLD.provider_reference
)
BEGIN
  SELECT RAISE(ABORT, 'payment_immutable');
END;

CREATE TRIGGER payments_no_reopen BEFORE UPDATE OF status ON payments
WHEN OLD.status IN ('failed', 'abandoned') AND NEW.status = 'pending'
BEGIN
  SELECT RAISE(ABORT, 'payment_closed');
END;

-- Gapless receipt numbers RCT-YYYY-NNNNNN (hotel-local year). The counter is
-- updated in the same transaction, so a failed write leaves no hole, and D1's
-- one-write-at-a-time execution means two payments can't take the same number.
CREATE TRIGGER payments_receipt_insert AFTER INSERT ON payments
WHEN NEW.status = 'successful' AND NEW.receipt_number IS NULL
BEGIN
  INSERT OR IGNORE INTO receipt_counters (year, last_number) VALUES (CAST(strftime('%Y', 'now', '+1 hour') AS INTEGER), 0);
  UPDATE receipt_counters SET last_number = last_number + 1 WHERE year = CAST(strftime('%Y', 'now', '+1 hour') AS INTEGER);
  UPDATE payments SET receipt_number = 'RCT-' || strftime('%Y', 'now', '+1 hour') || '-'
    || printf('%06d', (SELECT last_number FROM receipt_counters WHERE year = CAST(strftime('%Y', 'now', '+1 hour') AS INTEGER)))
  WHERE id = NEW.id;
END;

CREATE TRIGGER payments_receipt_update AFTER UPDATE OF status ON payments
WHEN NEW.status = 'successful' AND OLD.status <> 'successful' AND NEW.receipt_number IS NULL
BEGIN
  INSERT OR IGNORE INTO receipt_counters (year, last_number) VALUES (CAST(strftime('%Y', 'now', '+1 hour') AS INTEGER), 0);
  UPDATE receipt_counters SET last_number = last_number + 1 WHERE year = CAST(strftime('%Y', 'now', '+1 hour') AS INTEGER);
  UPDATE payments SET receipt_number = 'RCT-' || strftime('%Y', 'now', '+1 hour') || '-'
    || printf('%06d', (SELECT last_number FROM receipt_counters WHERE year = CAST(strftime('%Y', 'now', '+1 hour') AS INTEGER)))
  WHERE id = NEW.id;
END;

-- Offline payments: email the guest a receipt (queued with the payment).
CREATE TRIGGER payments_queue_email AFTER INSERT ON payments
WHEN NEW.provider = 'offline' AND NEW.kind = 'payment' AND NEW.status = 'successful'
BEGIN
  INSERT OR IGNORE INTO email_outbox (kind, reservation_id, payment_id) VALUES ('payment_received', NEW.reservation_id, NEW.id);
END;

-- Every change bumps the version (optimistic concurrency) and updated_at.
CREATE TRIGGER payments_version AFTER UPDATE ON payments
WHEN NEW.version = OLD.version
BEGIN
  UPDATE payments SET version = OLD.version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
