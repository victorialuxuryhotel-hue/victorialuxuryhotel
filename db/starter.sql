-- =============================================================================
-- PRODUCTION STARTER DATA: run once on a new database, then edit everything in
-- the management app (Rooms → Room types, Rooms).
--
--   pnpm exec wrangler d1 execute victoria-hotel-db --remote --file db/starter.sql
--
-- The same four room types, rates and 29-room split as the local seed, as a
-- starting point for the hotel to correct. No descriptions (guests would see
-- placeholder text) and no staff accounts (the first owner is created with
-- `pnpm staff:create-owner`). Safe to run twice: existing rows are kept.
-- =============================================================================

INSERT OR IGNORE INTO room_categories (id, slug, name, nightly_rate_kobo, max_occupancy, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000001', 'standard',  'Standard',  5500000, 2, 1),
  ('00000000-0000-4000-8000-000000000002', 'deluxe',    'Deluxe',    7500000, 2, 2),
  ('00000000-0000-4000-8000-000000000003', 'suite',     'Suite',    10800000, 2, 3),
  ('00000000-0000-4000-8000-000000000004', 'apartment', 'Apartment', 28000000, 4, 4);

-- 29 rooms: Standard 101–112, Deluxe 201–209, Suite 301–305, Apartment 401–403.
WITH RECURSIVE n(x) AS (SELECT 101 UNION ALL SELECT x + 1 FROM n WHERE x < 403),
plan(slug, first, last) AS (VALUES ('standard', 101, 112), ('deluxe', 201, 209), ('suite', 301, 305), ('apartment', 401, 403))
INSERT OR IGNORE INTO rooms (id, room_number, category_id, floor)
SELECT lower(printf('%s-%s-4%s-%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2), hex(randomblob(6)))),
       CAST(n.x AS TEXT), c.id, substr(CAST(n.x AS TEXT), 1, 1)
FROM n JOIN plan p ON n.x BETWEEN p.first AND p.last JOIN room_categories c ON c.slug = p.slug;
