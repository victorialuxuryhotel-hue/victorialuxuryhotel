-- The extra a guest pays for moving to a dearer room type, for the nights left.
-- Kept apart from the room price, which stays rate × nights.
ALTER TABLE reservations ADD COLUMN room_change_kobo INTEGER NOT NULL DEFAULT 0 CHECK (room_change_kobo >= 0);

-- Agreed cancellation window: free until 24 hours before check-in.
UPDATE hotel_settings SET free_cancel_hours = 24 WHERE id = 1;

-- Hotel Manager: a front-desk record marked as the department lead with no
-- department (the Restaurant/Bar Manager is the lead with department
-- restaurant_bar). Replaces the lead checks from 0012.
DROP TRIGGER staff_profiles_lead_insert;
DROP TRIGGER staff_profiles_lead_update;
CREATE TRIGGER staff_profiles_lead_insert BEFORE INSERT ON staff_profiles
WHEN NEW.department_lead = 1 AND NOT (NEW.department IS 'restaurant_bar' OR (NEW.department IS NULL AND NEW.role = 'front_desk'))
BEGIN
  SELECT RAISE(ABORT, 'lead_needs_restaurant_bar');
END;
CREATE TRIGGER staff_profiles_lead_update BEFORE UPDATE OF role, department, department_lead ON staff_profiles
WHEN NEW.department_lead = 1 AND NOT (NEW.department IS 'restaurant_bar' OR (NEW.department IS NULL AND NEW.role = 'front_desk'))
BEGIN
  SELECT RAISE(ABORT, 'lead_needs_restaurant_bar');
END;
DROP TRIGGER staff_profiles_audit_lead;
CREATE TRIGGER staff_profiles_audit_lead AFTER UPDATE OF department_lead ON staff_profiles
WHEN NEW.department_lead IS NOT OLD.department_lead
BEGIN
  INSERT INTO activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  VALUES ((SELECT actor_id FROM _ctx WHERE id = 1),
          CASE WHEN (SELECT actor_id FROM _ctx WHERE id = 1) IS NULL THEN 'system' ELSE 'staff' END,
          'staff.role_changed', 'staff', NEW.id,
          NEW.full_name || CASE WHEN NEW.department_lead = 1
            THEN CASE WHEN NEW.department IS NULL THEN ' is now Hotel Manager' ELSE ' is now Restaurant/Bar Manager' END
            ELSE ' is no longer a department manager' END,
          json_object('department_lead', NEW.department_lead));
END;
