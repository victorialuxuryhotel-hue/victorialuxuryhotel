-- =============================================================================
-- The self-check (rules-and-edge-cases.md section 4) runs with the scheduled job
-- and raises alerts. This remembers when each alert was last sent, so the same
-- problem alerts at most once a day, and when the daily checks last ran.
-- Housekeeping only: no money or bookings. New table; no existing rows change.
-- =============================================================================
CREATE TABLE self_check_state (
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 200),
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
