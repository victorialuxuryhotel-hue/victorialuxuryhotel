CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments
BEGIN
  SELECT RAISE(ABORT, 'payment_immutable');
END;

CREATE TRIGGER payment_events_no_delete BEFORE DELETE ON payment_events
BEGIN
  SELECT RAISE(ABORT, 'payment_immutable');
END;

CREATE TRIGGER receipt_counters_no_delete BEFORE DELETE ON receipt_counters
BEGIN
  SELECT RAISE(ABORT, 'payment_immutable');
END;

CREATE TRIGGER reservation_status_history_no_delete BEFORE DELETE ON reservation_status_history
BEGIN
  SELECT RAISE(ABORT, 'history_immutable');
END;
