-- =============================================================================
-- LOCAL DEVELOPMENT SEED ONLY. Runs on `supabase db reset`; never in production.
--
-- PLACEHOLDER DATA: the hotel has not yet supplied room rates, the split of its
-- 29 rooms across categories, descriptions or photos. The figures below exist
-- only so the booking engine can be developed and tested. Production
-- categories and rooms are entered by hotel staff in the management app.
-- =============================================================================

insert into public.room_categories (slug, name, short_description, nightly_rate_kobo, max_occupancy, sort_order) values
  ('standard',  'Standard',  '[Placeholder] Awaiting description from the hotel.', 4000000, 2, 1),
  ('deluxe',    'Deluxe',    '[Placeholder] Awaiting description from the hotel.', 5500000, 2, 2),
  ('suite',     'Suite',     '[Placeholder] Awaiting description from the hotel.', 8500000, 3, 3),
  ('apartment', 'Apartment', '[Placeholder] Awaiting description from the hotel.', 12000000, 4, 4);

-- 29 rooms. Placeholder split: Standard 12, Deluxe 9, Suite 5, Apartment 3.
insert into public.rooms (room_number, category_id, floor)
select n::text, c.id, left(n::text, 1)
from public.room_categories c
join (
  select 'standard' as slug, generate_series(101, 112) as n
  union all select 'deluxe', generate_series(201, 209)
  union all select 'suite', generate_series(301, 305)
  union all select 'apartment', generate_series(401, 403)
) r on r.slug = c.slug;
