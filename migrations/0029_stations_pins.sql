-- Staff sign-in by name and PIN on a shared station (FUNCTIONALITY.md section 1; agreement, Schedule A).
-- A computer is set up once as a station by the owner or GM. On it, staff tap their name and enter
-- their PIN; that starts a staff session. The browser holds random tokens; only their SHA-256 is kept.

CREATE TABLE stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 40),
  type TEXT NOT NULL CHECK (type IN ('desk', 'restaurant', 'bar', 'office')),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_by TEXT NOT NULL REFERENCES staff_profiles (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES staff_profiles (id),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE TABLE staff_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  station_id TEXT NOT NULL REFERENCES stations (id),
  staff_id TEXT NOT NULL REFERENCES staff_profiles (id),
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at TEXT,
  end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('lock', 'idle', 'switch', 'revoked', 'deactivated', 'expired')),
  CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);
CREATE INDEX staff_sessions_open ON staff_sessions (station_id) WHERE ended_at IS NULL;
CREATE INDEX staff_sessions_staff ON staff_sessions (staff_id) WHERE ended_at IS NULL;

-- Every PIN tried: sign-in at the name grid, or a manager approving at the counter. Kept for the lockout
-- (5 wrong in 15 minutes locks that person on that station) and the owner's "Anything wrong?".
CREATE TABLE pin_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL REFERENCES stations (id),
  staff_id TEXT NOT NULL REFERENCES staff_profiles (id),
  purpose TEXT NOT NULL CHECK (purpose IN ('sign_in', 'approve')),
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX pin_attempts_recent ON pin_attempts (staff_id, station_id, at);
CREATE INDEX pin_attempts_station ON pin_attempts (station_id, at);

CREATE TRIGGER pin_attempts_no_update BEFORE UPDATE ON pin_attempts BEGIN SELECT RAISE(ABORT, 'history_immutable'); END;

-- PBKDF2-SHA256 with a per-person salt, as "pbkdf2$<iterations>$<salt>$<hash>". Never the PIN itself.
ALTER TABLE staff_profiles ADD COLUMN pin_hash TEXT CHECK (pin_hash IS NULL OR pin_hash LIKE 'pbkdf2$%');
-- Set when the owner sets or resets a PIN: the person chooses their own at their next sign-in.
ALTER TABLE staff_profiles ADD COLUMN pin_must_change INTEGER NOT NULL DEFAULT 0 CHECK (pin_must_change IN (0, 1));

ALTER TABLE hotel_settings ADD COLUMN idle_lock_till_minutes INTEGER NOT NULL DEFAULT 5 CHECK (idle_lock_till_minutes BETWEEN 1 AND 60);
ALTER TABLE hotel_settings ADD COLUMN idle_lock_desk_minutes INTEGER NOT NULL DEFAULT 10 CHECK (idle_lock_desk_minutes BETWEEN 1 AND 60);

-- A deactivated staff member's sessions end at once; a revoked station signs everyone out of it.
CREATE TRIGGER staff_sessions_end_on_deactivate AFTER UPDATE OF is_active ON staff_profiles WHEN NEW.is_active = 0 AND OLD.is_active = 1
BEGIN
  UPDATE staff_sessions SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), end_reason = 'deactivated' WHERE staff_id = NEW.id AND ended_at IS NULL;
END;

CREATE TRIGGER staff_sessions_end_on_revoke AFTER UPDATE OF revoked_at ON stations WHEN NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL
BEGIN
  UPDATE staff_sessions SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), end_reason = 'revoked' WHERE station_id = NEW.id AND ended_at IS NULL;
END;

-- A revoked station stays revoked; a station's token and type never change (set up a new one instead).
CREATE TRIGGER stations_fixed BEFORE UPDATE OF token_hash, type, created_by ON stations
BEGIN SELECT RAISE(ABORT, 'station_fixed'); END;
CREATE TRIGGER stations_stay_revoked BEFORE UPDATE OF revoked_at ON stations WHEN OLD.revoked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'station_fixed'); END;
CREATE TRIGGER stations_no_delete BEFORE DELETE ON stations BEGIN SELECT RAISE(ABORT, 'history_immutable'); END;
CREATE TRIGGER staff_sessions_no_delete BEFORE DELETE ON staff_sessions BEGIN SELECT RAISE(ABORT, 'history_immutable'); END;
-- An ended session never restarts.
CREATE TRIGGER staff_sessions_stay_ended BEFORE UPDATE ON staff_sessions WHEN OLD.ended_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'session_ended'); END;
