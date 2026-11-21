-- =============================================================================
-- Audit trail and staff rules.
--
-- Business actions write their own activity records (in the same batch).
-- These triggers cover configuration changes so nothing that changes what
-- guests see, what rooms exist or who has access goes unrecorded. The actor
-- comes from the request context (_ctx); no context = the system.
-- =============================================================================

-- The activity log is append-only.
CREATE TRIGGER activity_log_no_update BEFORE UPDATE ON activity_log
BEGIN
  SELECT RAISE(ABORT, 'activity_log_immutable');
END;
CREATE TRIGGER activity_log_no_delete BEFORE DELETE ON activity_log
BEGIN
  SELECT RAISE(ABORT, 'activity_log_immutable');
END;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
-- There must always be an active owner, or nobody could manage staff.
CREATE TRIGGER staff_profiles_keep_an_owner BEFORE UPDATE ON staff_profiles
WHEN OLD.role = 'owner' AND OLD.is_active = 1 AND (NEW.role <> 'owner' OR NEW.is_active = 0)
 AND NOT EXISTS (SELECT 1 FROM staff_profiles WHERE role = 'owner' AND is_active = 1 AND id <> OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'last_owner');
END;

CREATE TRIGGER staff_profiles_no_delete BEFORE DELETE ON staff_profiles
BEGIN
  SELECT RAISE(ABORT, 'staff_delete_forbidden');
END;

CREATE TRIGGER staff_profiles_audit_insert AFTER INSERT ON staff_profiles
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'staff.created', 'staff_profile', NEW.id,
          printf('Staff account created for %s (%s)', NEW.full_name, NEW.role),
          json_object('role', NEW.role));
END;

CREATE TRIGGER staff_profiles_audit_update AFTER UPDATE OF role, is_active ON staff_profiles
WHEN NEW.role <> OLD.role OR NEW.is_active <> OLD.is_active
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'staff.updated', 'staff_profile', NEW.id,
          printf('Staff %s: role %s → %s, active %s → %s', NEW.full_name, OLD.role, NEW.role,
                 CASE OLD.is_active WHEN 1 THEN 'yes' ELSE 'no' END, CASE NEW.is_active WHEN 1 THEN 'yes' ELSE 'no' END),
          json_object('from_role', OLD.role, 'to_role', NEW.role,
                      'from_active', json(CASE OLD.is_active WHEN 1 THEN 'true' ELSE 'false' END),
                      'to_active', json(CASE NEW.is_active WHEN 1 THEN 'true' ELSE 'false' END)));
END;

-- ---------------------------------------------------------------------------
-- Hotel settings
-- ---------------------------------------------------------------------------
CREATE TRIGGER hotel_settings_audit AFTER UPDATE OF check_in_time, check_out_time, website_hold_minutes, staff_hold_hours, cancellation_policy ON hotel_settings
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'settings.updated', 'hotel_settings', NULL, 'Booking rules updated',
          json_object('check_in_time', NEW.check_in_time, 'check_out_time', NEW.check_out_time,
                      'website_hold_minutes', NEW.website_hold_minutes, 'staff_hold_hours', NEW.staff_hold_hours,
                      'cancellation_policy_changed', json(CASE WHEN NEW.cancellation_policy IS NOT OLD.cancellation_policy THEN 'true' ELSE 'false' END)));
END;

-- ---------------------------------------------------------------------------
-- Rooms and room types
-- ---------------------------------------------------------------------------
CREATE TRIGGER rooms_audit_insert AFTER INSERT ON rooms
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'room.created', 'room', NEW.id, printf('Room %s added', NEW.room_number));
END;

CREATE TRIGGER rooms_audit_update AFTER UPDATE OF room_number, category_id, is_active ON rooms
WHEN NEW.room_number <> OLD.room_number OR NEW.category_id <> OLD.category_id OR NEW.is_active <> OLD.is_active
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'room.configured', 'room', NEW.id, printf('Room %s configuration changed', NEW.room_number),
          json_object('from_category', OLD.category_id, 'to_category', NEW.category_id,
                      'is_active', json(CASE NEW.is_active WHEN 1 THEN 'true' ELSE 'false' END)));
END;

CREATE TRIGGER room_categories_audit_insert AFTER INSERT ON room_categories
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'category.created', 'room_category', NEW.id, printf('Room category %s added', NEW.name));
END;

CREATE TRIGGER room_categories_audit_update AFTER UPDATE OF nightly_rate_kobo, is_active, name, max_occupancy ON room_categories
WHEN NEW.nightly_rate_kobo <> OLD.nightly_rate_kobo OR NEW.is_active <> OLD.is_active
  OR NEW.name <> OLD.name OR NEW.max_occupancy <> OLD.max_occupancy
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'category.updated', 'room_category', NEW.id, printf('Room category %s updated', NEW.name),
          json_object('from_rate_kobo', OLD.nightly_rate_kobo, 'to_rate_kobo', NEW.nightly_rate_kobo,
                      'is_active', json(CASE NEW.is_active WHEN 1 THEN 'true' ELSE 'false' END)));
END;

-- No deletes: deactivate instead (reservations reference them).
CREATE TRIGGER room_categories_no_delete BEFORE DELETE ON room_categories
BEGIN
  SELECT RAISE(ABORT, 'delete_forbidden');
END;
CREATE TRIGGER rooms_no_delete BEFORE DELETE ON rooms
BEGIN
  SELECT RAISE(ABORT, 'delete_forbidden');
END;

-- ---------------------------------------------------------------------------
-- Photos (who changed what the public sees)
-- ---------------------------------------------------------------------------
CREATE TRIGGER room_category_images_audit_insert AFTER INSERT ON room_category_images
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'photo.added', 'room_category_images', NEW.id, 'Photo added to room category', json_object('path', NEW.storage_path));
END;
CREATE TRIGGER room_category_images_audit_delete AFTER DELETE ON room_category_images
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'photo.removed', 'room_category_images', OLD.id, 'Photo removed from room category', json_object('path', OLD.storage_path));
END;
CREATE TRIGGER site_photos_audit_insert AFTER INSERT ON site_photos
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'photo.added', 'site_photos', NEW.id, 'Photo added to website ' || NEW.slot, json_object('path', NEW.storage_path));
END;
CREATE TRIGGER site_photos_audit_delete AFTER DELETE ON site_photos
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'photo.removed', 'site_photos', OLD.id, 'Photo removed from website ' || OLD.slot, json_object('path', OLD.storage_path));
END;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER staff_profiles_updated_at AFTER UPDATE ON staff_profiles WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE staff_profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER hotel_settings_updated_at AFTER UPDATE ON hotel_settings WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE hotel_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER room_categories_updated_at AFTER UPDATE ON room_categories WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE room_categories SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER rooms_updated_at AFTER UPDATE ON rooms WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE rooms SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER guests_updated_at AFTER UPDATE ON guests WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE guests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
