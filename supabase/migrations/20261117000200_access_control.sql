-- =============================================================================
-- Access control: staff role helpers and Row Level Security policies.
--
-- Model
--   anon (website visitors): read active room categories and their images. Nothing else.
--   authenticated staff:     read operational data; WRITE reservations, payments
--                            and room status only through the business functions
--                            (security definer) that validate and audit each change.
--   service_role (server):   used only by the Paystack webhook, the public booking
--                            flow and scheduled jobs. Bypasses RLS by design.
--
-- Roles: owner > general_manager > front_desk. The application mirrors this in
-- src/lib/auth/permissions.ts; the database is the enforcement point.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so they can read staff_profiles under RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select role from public.staff_profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_profiles where id = auth.uid() and is_active)
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_staff_role() in ('owner', 'general_manager'), false)
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_staff_role() = 'owner', false)
$$;

-- Raises unless the caller is active staff with one of the given roles.
create or replace function public.require_role(allowed public.staff_role[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.staff_role := public.current_staff_role();
begin
  if v_role is null then
    raise exception 'Not signed in as active staff' using errcode = 'insufficient_privilege';
  end if;
  if not (v_role = any (allowed)) then
    raise exception 'Your role does not permit this action' using errcode = 'insufficient_privilege';
  end if;
  return auth.uid();
end $$;

grant execute on function public.current_staff_role(), public.is_staff(), public.is_manager(), public.is_owner()
  to authenticated;
revoke execute on function public.require_role(public.staff_role[]) from public, anon;
grant execute on function public.require_role(public.staff_role[]) to authenticated;

-- Defence in depth: website visitors can never write, whatever the policies say.
revoke insert, update, delete, truncate on all tables in schema public from anon;
-- Staff writes to operational tables go through business functions only.
revoke insert, update, delete, truncate on
  public.reservations, public.reservation_status_history, public.payments,
  public.payment_events, public.activity_log
from authenticated;

-- ---------------------------------------------------------------------------
-- Staff profiles
-- ---------------------------------------------------------------------------
create policy "staff read own profile; managers read all" on public.staff_profiles
  for select to authenticated using (id = auth.uid() or public.is_manager());

create policy "owner manages staff" on public.staff_profiles
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- Profiles are created by the server (service role) when the owner invites
-- staff, because creating the auth user needs the admin API.
revoke insert, delete on public.staff_profiles from authenticated;

-- There must always be at least one active owner, or nobody could manage staff.
create or replace function public.staff_profiles_keep_an_owner() returns trigger
language plpgsql as $$
begin
  if old.role = 'owner' and old.is_active
     and (new.role <> 'owner' or not new.is_active)
     and not exists (
       select 1 from public.staff_profiles
       where role = 'owner' and is_active and id <> old.id
     ) then
    raise exception 'At least one active owner is required' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger staff_profiles_keep_an_owner before update on public.staff_profiles
  for each row execute function public.staff_profiles_keep_an_owner();

create or replace function public.staff_profiles_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('staff.created', 'staff_profile', new.id,
      format('Staff account created for %s (%s)', new.full_name, new.role), jsonb_build_object('role', new.role));
  elsif (new.role, new.is_active) is distinct from (old.role, old.is_active) then
    perform public.log_activity('staff.updated', 'staff_profile', new.id,
      format('Staff %s: role %s → %s, active %s → %s', new.full_name, old.role, new.role, old.is_active, new.is_active),
      jsonb_build_object('from_role', old.role, 'to_role', new.role, 'from_active', old.is_active, 'to_active', new.is_active));
  end if;
  return null;
end $$;
create trigger staff_profiles_audit after insert or update on public.staff_profiles
  for each row execute function public.staff_profiles_audit();

-- ---------------------------------------------------------------------------
-- Hotel settings
-- ---------------------------------------------------------------------------
create policy "anyone reads settings" on public.hotel_settings for select to anon, authenticated using (true);
create policy "managers update settings" on public.hotel_settings
  for update to authenticated using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- Room categories and images (public catalogue)
-- ---------------------------------------------------------------------------
create policy "public reads active categories; staff read all" on public.room_categories
  for select to anon, authenticated using (is_active or public.is_staff());
create policy "managers create categories" on public.room_categories
  for insert to authenticated with check (public.is_manager());
create policy "managers update categories" on public.room_categories
  for update to authenticated using (public.is_manager()) with check (public.is_manager());
-- No delete: deactivate instead, because reservations reference categories.
revoke delete on public.room_categories from authenticated;

create policy "public reads images of active categories; staff read all" on public.room_category_images
  for select to anon, authenticated using (
    public.is_staff() or exists (select 1 from public.room_categories c where c.id = category_id and c.is_active)
  );
create policy "managers manage images" on public.room_category_images
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------
create policy "staff read rooms" on public.rooms for select to authenticated using (public.is_staff());
create policy "managers create rooms" on public.rooms for insert to authenticated with check (public.is_manager());
-- Managers edit room configuration directly. Front desk changes readiness and
-- maintenance only via update_room_status() (room-management migration).
create policy "managers update rooms" on public.rooms
  for update to authenticated using (public.is_manager()) with check (public.is_manager());
revoke delete on public.rooms from authenticated;

-- ---------------------------------------------------------------------------
-- Guests
-- ---------------------------------------------------------------------------
create policy "staff read guests" on public.guests for select to authenticated using (public.is_staff());
create policy "staff create guests" on public.guests for insert to authenticated with check (public.is_staff());
create policy "staff update guests" on public.guests
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
revoke delete on public.guests from authenticated;

-- ---------------------------------------------------------------------------
-- Reservations, history, payments: staff read; writes via functions only
-- ---------------------------------------------------------------------------
create policy "staff read reservations" on public.reservations for select to authenticated using (public.is_staff());
create policy "staff read reservation history" on public.reservation_status_history
  for select to authenticated using (public.is_staff());
create policy "staff read payments" on public.payments for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Provider events and the activity log: management visibility only
-- ---------------------------------------------------------------------------
create policy "managers read payment events" on public.payment_events
  for select to authenticated using (public.is_manager());
create policy "managers read activity" on public.activity_log
  for select to authenticated using (public.is_manager());

-- ---------------------------------------------------------------------------
-- Storage: public bucket for room photos; managers upload
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-images', 'room-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "managers upload room images" on storage.objects
  for insert to authenticated with check (bucket_id = 'room-images' and public.is_manager());
create policy "managers update room images" on storage.objects
  for update to authenticated using (bucket_id = 'room-images' and public.is_manager());
create policy "managers delete room images" on storage.objects
  for delete to authenticated using (bucket_id = 'room-images' and public.is_manager());
