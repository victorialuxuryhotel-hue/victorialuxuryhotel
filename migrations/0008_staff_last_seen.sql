-- =============================================================================
-- When each staff member was last active (updated at most once an hour when
-- they use the app). Used to pick which manager front desk should ask, and to
-- say "active today". Not audited: it is not a change to anyone's access.
-- =============================================================================
ALTER TABLE staff_profiles ADD COLUMN last_seen_at TEXT;
