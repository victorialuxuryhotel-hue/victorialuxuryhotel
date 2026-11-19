-- Fix: photos_audit() referenced v_row.slot, which only site_photos has.
-- PL/pgSQL resolves record fields at run time even in branches not taken, so
-- every room_category_images insert failed. Read the slot via jsonb instead.
create or replace function public.photos_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_where text := case tg_table_name
    when 'site_photos' then 'website ' || coalesce(v_row ->> 'slot', 'photo')
    else 'room category' end;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('photo.added', tg_table_name, (v_row ->> 'id')::uuid, format('Photo added to %s', v_where), jsonb_build_object('path', v_row ->> 'storage_path'));
  elsif tg_op = 'DELETE' then
    perform public.log_activity('photo.removed', tg_table_name, (v_row ->> 'id')::uuid, format('Photo removed from %s', v_where), jsonb_build_object('path', v_row ->> 'storage_path'));
  end if;
  return null;
end $$;
