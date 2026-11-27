-- Home page "On site" cards (client, 2026-11-27): Pool, Lounge, Restaurant and Club, each showing up to
-- four photos split in one frame. Adds the Lounge and Club places and lets those four places hold up to
-- 4 photos; every other place still holds one, the gallery many.
--
-- SQLite can't change a CHECK, so the table is rebuilt with the same rows. Backward compatible: the
-- previous Worker uploads to the same places (it replaces a card place's photos with one, as before).

CREATE TABLE site_photos_new (
  id TEXT PRIMARY KEY,
  slot TEXT NOT NULL CHECK (slot IN (
    'hero', 'welcome', 'pool', 'spa', 'bar', 'restaurant', 'conference',
    'exterior', 'reception', 'about', 'gallery', 'lounge', 'club'
  )),
  gallery_group TEXT CHECK (gallery_group IN ('Rooms', 'Pool & spa', 'Dining', 'The hotel')),
  storage_path TEXT NOT NULL UNIQUE,
  alt_text TEXT NOT NULL CHECK (length(trim(alt_text)) BETWEEN 3 AND 200),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((slot = 'gallery') = (gallery_group IS NOT NULL))
);
INSERT INTO site_photos_new (id, slot, gallery_group, storage_path, alt_text, sort_order, created_at)
  SELECT id, slot, gallery_group, storage_path, alt_text, sort_order, created_at FROM site_photos;
DROP TABLE site_photos;
ALTER TABLE site_photos_new RENAME TO site_photos;

-- One photo per place, except the gallery and the card places.
CREATE UNIQUE INDEX site_photos_one_per_slot ON site_photos (slot) WHERE slot NOT IN ('gallery', 'pool', 'lounge', 'restaurant', 'club');
CREATE INDEX site_photos_gallery_idx ON site_photos (gallery_group, sort_order) WHERE slot = 'gallery';
CREATE INDEX site_photos_slot_idx ON site_photos (slot, sort_order);

CREATE TRIGGER site_photos_card_limit BEFORE INSERT ON site_photos
WHEN NEW.slot IN ('pool', 'lounge', 'restaurant', 'club') AND (SELECT count(*) FROM site_photos WHERE slot = NEW.slot) >= 4
BEGIN
  SELECT RAISE(ABORT, 'card_photos_full');
END;

-- The audit triggers went with the old table (same as 0004).
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
