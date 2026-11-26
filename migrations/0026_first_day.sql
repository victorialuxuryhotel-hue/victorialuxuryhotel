-- =============================================================================
-- "Your first day" (interface brief I10): the main jobs for a new staff member's
-- role, ticked off on the account page as each is done once. One row per tick;
-- the list itself is in src/content/help.ts. New table; no existing rows change.
-- =============================================================================
CREATE TABLE staff_first_day (
  staff_id TEXT NOT NULL REFERENCES staff_profiles (id),
  item TEXT NOT NULL CHECK (length(item) BETWEEN 1 AND 40),
  done_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (staff_id, item)
);
