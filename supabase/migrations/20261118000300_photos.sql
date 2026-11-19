-- =============================================================================
-- Photos managed by hotel staff.
--   room_category_images (existing): photos of each room type.
--   site_photos (new): the website's other photo places: hero, pool, spa, bar,
--   about, gallery... (see docs/photography-brief.md). Single-photo places
--   hold one image; the gallery holds many, grouped.
-- Files live in public storage buckets; managers upload, everyone can view.
-- =============================================================================

create table public.site_photos (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot in (
    'hero', 'welcome', 'pool', 'spa', 'bar', 'restaurant', 'conference',
    'exterior', 'reception', 'about', 'gallery'
  )),
  gallery_group text check (gallery_group in ('Rooms', 'Pool & spa', 'Dining', 'The hotel')),
  storage_path text not null unique,
  alt_text text not null check (length(trim(alt_text)) between 3 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint site_photos_gallery_has_group check ((slot = 'gallery') = (gallery_group is not null))
);
-- Every place except the gallery holds exactly one photo.
create unique index site_photos_one_per_slot on public.site_photos (slot) where slot <> 'gallery';
create index site_photos_gallery_idx on public.site_photos (gallery_group, sort_order) where slot = 'gallery';

alter table public.site_photos enable row level security;
create policy "anyone views site photos" on public.site_photos for select to anon, authenticated using (true);
create policy "managers manage site photos" on public.site_photos
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- Alt text is required on room photos too (accessibility).
alter table public.room_category_images
  add constraint room_category_images_alt_required check (length(trim(alt_text)) between 3 and 200) not valid;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "managers upload site images" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-images' and public.is_manager());
create policy "managers update site images" on storage.objects
  for update to authenticated using (bucket_id = 'site-images' and public.is_manager());
create policy "managers delete site images" on storage.objects
  for delete to authenticated using (bucket_id = 'site-images' and public.is_manager());

-- Audit photo changes (who changed what the public sees).
create or replace function public.photos_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row record := coalesce(new, old);
  v_where text := case tg_table_name
    when 'site_photos' then 'website ' || replace(v_row.slot, '_', ' ')
    else 'room category' end;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('photo.added', tg_table_name, v_row.id, format('Photo added to %s', v_where), jsonb_build_object('path', v_row.storage_path));
  elsif tg_op = 'DELETE' then
    perform public.log_activity('photo.removed', tg_table_name, v_row.id, format('Photo removed from %s', v_where), jsonb_build_object('path', v_row.storage_path));
  end if;
  return null;
end $$;
create trigger room_category_images_audit after insert or delete on public.room_category_images
  for each row execute function public.photos_audit();
create trigger site_photos_audit after insert or delete on public.site_photos
  for each row execute function public.photos_audit();
