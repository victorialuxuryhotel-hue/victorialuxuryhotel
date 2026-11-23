-- =============================================================================
-- LOCAL DEVELOPMENT SEED ONLY (`pnpm db:fresh`). Never run against production.
--
-- PLACEHOLDER DATA: the hotel has not yet supplied room rates, the split of its
-- 29 rooms across categories, descriptions or photos. The figures below exist
-- only so the booking engine can be developed and tested. Production
-- categories and rooms are entered by hotel staff in the management app.
-- =============================================================================

INSERT INTO room_categories (id, slug, name, short_description, nightly_rate_kobo, max_occupancy, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000001', 'standard',  'Standard',  '[Placeholder] Awaiting description from the hotel.', 4000000, 2, 1),
  ('00000000-0000-4000-8000-000000000002', 'deluxe',    'Deluxe',    '[Placeholder] Awaiting description from the hotel.', 5500000, 2, 2),
  ('00000000-0000-4000-8000-000000000003', 'suite',     'Suite',     '[Placeholder] Awaiting description from the hotel.', 8500000, 3, 3),
  ('00000000-0000-4000-8000-000000000004', 'apartment', 'Apartment', '[Placeholder] Awaiting description from the hotel.', 12000000, 4, 4);

-- 29 rooms. Placeholder split: Standard 12, Deluxe 9, Suite 5, Apartment 3.
WITH RECURSIVE n(x) AS (SELECT 101 UNION ALL SELECT x + 1 FROM n WHERE x < 403),
plan(slug, first, last) AS (VALUES ('standard', 101, 112), ('deluxe', 201, 209), ('suite', 301, 305), ('apartment', 401, 403))
INSERT INTO rooms (id, room_number, category_id, floor)
SELECT lower(printf('%s-%s-4%s-%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2), hex(randomblob(6)))),
       CAST(n.x AS TEXT), c.id, substr(CAST(n.x AS TEXT), 1, 1)
FROM n JOIN plan p ON n.x BETWEEN p.first AND p.last JOIN room_categories c ON c.slug = p.slug;

-- One account per role for local development. Each links to a Clerk user the
-- first time someone signs in with that email (see src/server/auth.ts).
INSERT INTO staff_profiles (id, full_name, email, role) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Dev Owner', 'owner@victoria.test', 'owner'),
  ('00000000-0000-4000-8000-0000000000a2', 'Dev Manager', 'gm@victoria.test', 'general_manager'),
  ('00000000-0000-4000-8000-0000000000a3', 'Dev Front Desk', 'frontdesk@victoria.test', 'front_desk');
