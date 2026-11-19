-- =============================================================================
-- Room management and the reservation engine.
--
-- Every state change goes through a function here. Each one runs in a single
-- transaction, checks the caller's role, locks what it touches, validates the
-- business rules, and writes the audit record. Staff cannot write the
-- reservations table directly (see access-control migration).
--
-- Errors raise with HINT set to an application error code (UNAVAILABLE,
-- VALIDATION, NOT_FOUND, INVALID_TRANSITION, CONFLICT) and a message that is
-- safe to show staff or guests.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._fail(p_code text, p_message text) returns void
language plpgsql as $$
begin
  raise exception '%', p_message using errcode = 'P0001', hint = p_code;
end $$;

-- A reservation holds inventory while it is confirmed or in house, or pending
-- with an unexpired hold. Expired holds stop counting at once, whether or not
-- the clean-up job has run yet.
create or replace function public._is_live(p_status public.reservation_status, p_hold timestamptz) returns boolean
language sql stable as $$
  select p_status in ('confirmed', 'checked_in') or (p_status = 'pending_payment' and p_hold > now())
$$;

-- Units of a category still free on EVERY night of [check_in, check_out).
-- Capacity = active, in-service rooms. Demand = live reservations, counted
-- against the category of their assigned room if any (so upgrades consume the
-- right inventory), otherwise the booked category.
create or replace function public._free_units(
  p_category_id uuid, p_check_in date, p_check_out date, p_exclude uuid default null
) returns integer
language sql stable security definer set search_path = '' as $$
  with capacity as (
    select count(*)::int as n from public.rooms
    where category_id = p_category_id and is_active and service_status = 'in_service'
  ),
  nights as (
    select d::date as night from generate_series(p_check_in, p_check_out - 1, interval '1 day') d
  ),
  demand as (
    select n.night, count(r.id)::int as used
    from nights n
    left join public.reservations r
      on r.check_in <= n.night and r.check_out > n.night
     and r.id is distinct from p_exclude
     and public._is_live(r.status, r.hold_expires_at)
     and coalesce((select rm.category_id from public.rooms rm where rm.id = r.room_id), r.category_id) = p_category_id
    group by n.night
  )
  select (select n from capacity) - coalesce((select max(used) from demand), 0)
$$;

create or replace function public._validate_stay(p_check_in date, p_check_out date, p_guests integer, p_allow_past boolean default false)
returns void language plpgsql stable as $$
begin
  if p_check_in is null or p_check_out is null then perform public._fail('VALIDATION', 'Choose check-in and check-out dates.'); end if;
  if p_check_out <= p_check_in then perform public._fail('VALIDATION', 'Check-out must be after check-in.'); end if;
  if p_check_out - p_check_in > 90 then perform public._fail('VALIDATION', 'Stays longer than 90 nights must be arranged with the hotel.'); end if;
  if not p_allow_past and p_check_in < public.hotel_today() then perform public._fail('VALIDATION', 'Check-in can''t be in the past.'); end if;
  if p_check_in > public.hotel_today() + 730 then perform public._fail('VALIDATION', 'Bookings open up to two years ahead.'); end if;
  if p_guests is null or p_guests < 1 or p_guests > 20 then perform public._fail('VALIDATION', 'Enter the number of guests.'); end if;
end $$;

create or replace function public._set_reason(p_reason text) returns void
language sql as $$ select set_config('app.status_reason', coalesce(p_reason, ''), true); $$;

-- ---------------------------------------------------------------------------
-- Public availability search (website). Returns prices and yes/no only:
-- room counts are internal and never leave the database through this path.
-- ---------------------------------------------------------------------------
create or replace function public.search_availability(p_check_in date, p_check_out date, p_guests integer)
returns table (
  category_id uuid, slug text, name text, short_description text, max_occupancy integer,
  nightly_rate_kobo bigint, nights integer, total_kobo bigint, is_available boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._validate_stay(p_check_in, p_check_out, p_guests);
  return query
    select c.id, c.slug, c.name, c.short_description, c.max_occupancy, c.nightly_rate_kobo,
           (p_check_out - p_check_in), c.nightly_rate_kobo * (p_check_out - p_check_in),
           c.max_occupancy >= p_guests and public._free_units(c.id, p_check_in, p_check_out) > 0
    from public.room_categories c
    where c.is_active
    order by c.sort_order, c.nightly_rate_kobo;
end $$;

-- ---------------------------------------------------------------------------
-- Core reservation creation (internal). Shared by website and staff paths.
-- ---------------------------------------------------------------------------
create or replace function public._create_reservation(
  p_category_id uuid, p_check_in date, p_check_out date, p_guests integer,
  p_guest_id uuid, p_full_name text, p_email text, p_phone text, p_special_requests text,
  p_source public.booking_source, p_created_by uuid, p_hold interval
) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_cat public.room_categories;
  v_guest_id uuid := p_guest_id;
  v_email text := nullif(lower(trim(p_email)), '');
  v_res public.reservations;
begin
  perform public._validate_stay(p_check_in, p_check_out, p_guests);

  -- Serialise bookings per category so two requests can't both take the last unit.
  select * into v_cat from public.room_categories where id = p_category_id for update;
  if not found or not v_cat.is_active then perform public._fail('NOT_FOUND', 'That room type is not available for booking.'); end if;
  if p_guests > v_cat.max_occupancy then
    perform public._fail('VALIDATION', format('%s sleeps up to %s guests.', v_cat.name, v_cat.max_occupancy));
  end if;
  if public._free_units(v_cat.id, p_check_in, p_check_out) <= 0 then
    perform public._fail('UNAVAILABLE', format('Sorry, %s is no longer available for those dates.', v_cat.name));
  end if;

  if v_guest_id is null then
    if length(trim(coalesce(p_full_name, ''))) < 2 then perform public._fail('VALIDATION', 'Enter the guest''s full name.'); end if;
    if v_email is not null then
      -- Link returning guests by email. Never overwrite an existing name from
      -- an unauthenticated booking; only fill in a missing phone number.
      insert into public.guests (full_name, email, phone)
      values (trim(p_full_name), v_email, nullif(trim(p_phone), ''))
      on conflict ((lower(email))) where email is not null
        do update set phone = coalesce(public.guests.phone, excluded.phone)
      returning id into v_guest_id;
    else
      insert into public.guests (full_name, phone) values (trim(p_full_name), nullif(trim(p_phone), ''))
      returning id into v_guest_id;
    end if;
  elsif not exists (select 1 from public.guests where id = v_guest_id) then
    perform public._fail('NOT_FOUND', 'Guest not found.');
  end if;

  insert into public.reservations (
    guest_id, category_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo,
    status, source, special_requests, hold_expires_at, created_by
  ) values (
    v_guest_id, v_cat.id, p_check_in, p_check_out, p_guests, v_cat.nightly_rate_kobo,
    v_cat.nightly_rate_kobo * (p_check_out - p_check_in),
    'pending_payment', p_source, nullif(trim(p_special_requests), ''), now() + p_hold, p_created_by
  ) returning * into v_res;

  perform public.log_activity('reservation.created', 'reservation', v_res.id,
    format('Reservation %s created: %s, %s → %s', v_res.reference, v_cat.name, p_check_in, p_check_out),
    jsonb_build_object('source', p_source, 'total_kobo', v_res.total_amount_kobo));
  return v_res;
end $$;

-- Website: server-side only (service role), after the app has validated input.
create or replace function public.create_website_reservation(
  p_category_slug text, p_check_in date, p_check_out date, p_guests integer,
  p_full_name text, p_email text, p_phone text, p_special_requests text default null
) returns table (id uuid, reference text, public_token uuid, total_amount_kobo bigint, hold_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_res public.reservations;
  v_cat uuid := (select c.id from public.room_categories c where c.slug = p_category_slug);
  v_minutes integer := (select website_hold_minutes from public.hotel_settings);
begin
  if v_cat is null then perform public._fail('NOT_FOUND', 'That room type is not available for booking.'); end if;
  if nullif(trim(p_email), '') is null or nullif(trim(p_phone), '') is null then
    perform public._fail('VALIDATION', 'An email address and phone number are required.');
  end if;
  v_res := public._create_reservation(v_cat, p_check_in, p_check_out, p_guests, null, p_full_name, p_email, p_phone,
                                      p_special_requests, 'website', null, make_interval(mins => v_minutes));
  return query select v_res.id, v_res.reference, v_res.public_token, v_res.total_amount_kobo, v_res.hold_expires_at;
end $$;

-- Staff: walk-in, phone, WhatsApp. Same engine; held for the direct-booking period.
create or replace function public.create_staff_reservation(
  p_category_id uuid, p_check_in date, p_check_out date, p_guests integer,
  p_source public.booking_source, p_guest_id uuid default null,
  p_full_name text default null, p_email text default null, p_phone text default null,
  p_special_requests text default null
) returns table (id uuid, reference text)
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager', 'front_desk']::public.staff_role[]);
  v_hours integer := (select staff_hold_hours from public.hotel_settings);
  v_res public.reservations;
begin
  if p_source = 'website' then perform public._fail('VALIDATION', 'Choose how this booking was received.'); end if;
  v_res := public._create_reservation(p_category_id, p_check_in, p_check_out, p_guests, p_guest_id, p_full_name, p_email,
                                      p_phone, p_special_requests, p_source, v_staff, make_interval(hours => v_hours));
  return query select v_res.id, v_res.reference;
end $$;

-- ---------------------------------------------------------------------------
-- Room assignment
-- ---------------------------------------------------------------------------
create or replace function public.assign_room(p_reservation_id uuid, p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager', 'front_desk']::public.staff_role[]);
  v_res public.reservations;
  v_room public.rooms;
  v_old_room uuid;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then perform public._fail('NOT_FOUND', 'Reservation not found.'); end if;
  if v_res.status not in ('pending_payment', 'confirmed', 'checked_in') then
    perform public._fail('INVALID_TRANSITION', 'Rooms can only be assigned to upcoming or in-house reservations.');
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found or not v_room.is_active then perform public._fail('NOT_FOUND', 'Room not found.'); end if;
  if v_room.service_status <> 'in_service' then perform public._fail('UNAVAILABLE', format('Room %s is under maintenance.', v_room.room_number)); end if;
  if v_res.room_id = p_room_id then return; end if;

  -- The reservation currently counts against its assigned room's category, or
  -- the booked one. Moving it to a room in any OTHER category (an upgrade, or
  -- back from one) consumes that category's inventory: lock it and check.
  if v_room.category_id <> coalesce((select category_id from public.rooms where id = v_res.room_id), v_res.category_id) then
    perform 1 from public.room_categories where id = v_room.category_id for update;
    if public._free_units(v_room.category_id, greatest(v_res.check_in, public.hotel_today()), v_res.check_out, v_res.id) <= 0 then
      perform public._fail('UNAVAILABLE', format('No %s capacity left for these dates.', (select name from public.room_categories where id = v_room.category_id)));
    end if;
  end if;

  v_old_room := v_res.room_id;
  begin
    update public.reservations set room_id = p_room_id where id = v_res.id;
  exception when exclusion_violation then
    perform public._fail('CONFLICT', format('Room %s is already booked for some of these nights.', v_room.room_number));
  end;

  -- A guest moved mid-stay leaves the old room to be cleaned.
  if v_res.status = 'checked_in' and v_old_room is not null then
    update public.rooms set readiness = 'needs_cleaning' where id = v_old_room;
  end if;

  perform public.log_activity('reservation.room_assigned', 'reservation', v_res.id,
    format('Room %s assigned to %s', v_room.room_number, v_res.reference),
    jsonb_build_object('room_id', p_room_id, 'previous_room_id', v_old_room));
end $$;

-- ---------------------------------------------------------------------------
-- Front desk lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.check_in_reservation(p_reservation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager', 'front_desk']::public.staff_role[]);
  v_res public.reservations;
  v_room public.rooms;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then perform public._fail('NOT_FOUND', 'Reservation not found.'); end if;
  if v_res.status <> 'confirmed' then
    perform public._fail('INVALID_TRANSITION', case v_res.status
      when 'pending_payment' then 'This reservation is awaiting payment. Record payment or ask a manager to confirm it.'
      when 'checked_in' then 'This guest is already checked in.'
      else 'Only confirmed reservations can be checked in.' end);
  end if;
  if v_res.check_in > public.hotel_today() then perform public._fail('VALIDATION', format('Arrival is not until %s.', v_res.check_in)); end if;
  if v_res.check_out <= public.hotel_today() then perform public._fail('VALIDATION', 'This stay has already ended.'); end if;
  if v_res.room_id is null then perform public._fail('VALIDATION', 'Assign a room before checking in.'); end if;

  select * into v_room from public.rooms where id = v_res.room_id for update;
  if v_room.service_status <> 'in_service' then perform public._fail('UNAVAILABLE', format('Room %s is under maintenance. Assign another room.', v_room.room_number)); end if;
  if v_room.readiness <> 'ready' then perform public._fail('UNAVAILABLE', format('Room %s is not marked ready yet.', v_room.room_number)); end if;

  update public.reservations set status = 'checked_in' where id = v_res.id;
  perform public.log_activity('reservation.checked_in', 'reservation', v_res.id,
    format('%s checked in to room %s', v_res.reference, v_room.room_number), '{}');
end $$;

create or replace function public.check_out_reservation(p_reservation_id uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager', 'front_desk']::public.staff_role[]);
  v_res public.reservations;
  v_balance bigint;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then perform public._fail('NOT_FOUND', 'Reservation not found.'); end if;
  if v_res.status <> 'checked_in' then perform public._fail('INVALID_TRANSITION', 'Only checked-in guests can be checked out.'); end if;

  update public.reservations set status = 'checked_out' where id = v_res.id;
  update public.rooms set readiness = 'needs_cleaning' where id = v_res.room_id;

  v_balance := v_res.total_amount_kobo - coalesce((
    select sum(case when kind = 'payment' then amount_kobo else -amount_kobo end)
    from public.payments where reservation_id = v_res.id and status = 'successful'), 0);
  perform public.log_activity('reservation.checked_out', 'reservation', v_res.id,
    format('%s checked out', v_res.reference) || case when v_balance > 0 then format(' with ₦%s outstanding', to_char(v_balance / 100.0, 'FM999,999,990')) else '' end,
    jsonb_build_object('balance_kobo', v_balance));
  return v_balance; -- the UI shows any balance still owed
end $$;

create or replace function public.cancel_reservation(p_reservation_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager', 'front_desk']::public.staff_role[]);
  v_res public.reservations;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then perform public._fail('VALIDATION', 'Give a reason for the cancellation.'); end if;
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then perform public._fail('NOT_FOUND', 'Reservation not found.'); end if;
  if v_res.status not in ('pending_payment', 'confirmed') then
    perform public._fail('INVALID_TRANSITION', 'Only upcoming reservations can be cancelled.');
  end if;
  perform public._set_reason(p_reason);
  update public.reservations set status = 'cancelled', cancellation_reason = trim(p_reason) where id = v_res.id;
  perform public.log_activity('reservation.cancelled', 'reservation', v_res.id,
    format('%s cancelled: %s', v_res.reference, trim(p_reason)), '{}');
end $$;

create or replace function public.mark_no_show(p_reservation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager', 'front_desk']::public.staff_role[]);
  v_res public.reservations;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then perform public._fail('NOT_FOUND', 'Reservation not found.'); end if;
  if v_res.status <> 'confirmed' then perform public._fail('INVALID_TRANSITION', 'Only confirmed reservations can be marked as no-show.'); end if;
  if v_res.check_in > public.hotel_today() then perform public._fail('VALIDATION', 'The guest isn''t due yet.'); end if;
  update public.reservations set status = 'no_show' where id = v_res.id;
  perform public.log_activity('reservation.no_show', 'reservation', v_res.id, format('%s marked as no-show', v_res.reference), '{}');
end $$;

-- Editable details that don't affect price or inventory.
create or replace function public.update_reservation_details(p_reservation_id uuid, p_guests integer, p_special_requests text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager', 'front_desk']::public.staff_role[]);
  v_res public.reservations;
  v_max integer;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then perform public._fail('NOT_FOUND', 'Reservation not found.'); end if;
  if v_res.status not in ('pending_payment', 'confirmed', 'checked_in') then perform public._fail('INVALID_TRANSITION', 'This reservation is closed.'); end if;
  v_max := (select max_occupancy from public.room_categories where id = v_res.category_id);
  if p_guests < 1 or p_guests > v_max then perform public._fail('VALIDATION', format('This room type sleeps up to %s.', v_max)); end if;
  update public.reservations set guest_count = p_guests, special_requests = nullif(trim(p_special_requests), '') where id = v_res.id;
  perform public.log_activity('reservation.updated', 'reservation', v_res.id, format('%s details updated', v_res.reference),
    jsonb_build_object('guest_count', p_guests));
end $$;

-- ---------------------------------------------------------------------------
-- Manager override of the payment requirement (reason required, audited)
-- ---------------------------------------------------------------------------
create or replace function public.override_payment_requirement(p_reservation_id uuid, p_action text, p_reason text, p_extend_hours integer default 24)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager']::public.staff_role[]);
  v_res public.reservations;
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then perform public._fail('VALIDATION', 'Give a reason (it is recorded in the activity log).'); end if;
  if p_action not in ('confirm', 'extend') then perform public._fail('VALIDATION', 'Unknown action.'); end if;
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then perform public._fail('NOT_FOUND', 'Reservation not found.'); end if;
  if v_res.status <> 'pending_payment' then perform public._fail('INVALID_TRANSITION', 'Only reservations awaiting payment can be overridden.'); end if;

  -- If the hold already lapsed the inventory was released: re-check it.
  if v_res.hold_expires_at <= now() then
    perform 1 from public.room_categories where id = v_res.category_id for update;
    if public._free_units(v_res.category_id, v_res.check_in, v_res.check_out, v_res.id) <= 0 then
      perform public._fail('UNAVAILABLE', 'The hold has lapsed and this room type is now fully booked for those dates.');
    end if;
  end if;

  perform public._set_reason(p_reason);
  if p_action = 'confirm' then
    update public.reservations set status = 'confirmed' where id = v_res.id;
  else
    if p_extend_hours not between 1 and 336 then perform public._fail('VALIDATION', 'Extend by 1 hour to 14 days.'); end if;
    update public.reservations set hold_expires_at = greatest(now(), hold_expires_at) + make_interval(hours => p_extend_hours) where id = v_res.id;
  end if;
  perform public.log_activity('reservation.payment_override', 'reservation', v_res.id,
    format('%s %s without payment: %s', v_res.reference, case p_action when 'confirm' then 'confirmed' else format('hold extended %sh', p_extend_hours) end, trim(p_reason)),
    jsonb_build_object('action', p_action, 'reason', trim(p_reason)));
end $$;

-- ---------------------------------------------------------------------------
-- Scheduled clean-up: mark lapsed holds as expired (service role / cron).
-- ---------------------------------------------------------------------------
create or replace function public.expire_unpaid_reservations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  perform public._set_reason('Payment hold lapsed');
  with expired as (
    update public.reservations set status = 'expired'
    where status = 'pending_payment' and hold_expires_at <= now()
    returning id, reference
  ), logged as (
    insert into public.activity_log (actor_type, action, entity_type, entity_id, summary)
    select 'system', 'reservation.expired', 'reservation', id, format('%s expired: payment not received in time', reference) from expired
    returning 1
  )
  select count(*) into v_count from logged;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Room status (front desk) and configuration audit
-- ---------------------------------------------------------------------------
create or replace function public.update_room_status(
  p_room_id uuid, p_readiness public.room_readiness default null,
  p_service_status public.room_service_status default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager', 'front_desk']::public.staff_role[]);
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or not v_room.is_active then perform public._fail('NOT_FOUND', 'Room not found.'); end if;
  if p_service_status = 'maintenance' and exists (
    select 1 from public.reservations where room_id = p_room_id and status = 'checked_in') then
    perform public._fail('CONFLICT', format('Room %s has a guest checked in. Move the guest first.', v_room.room_number));
  end if;

  update public.rooms set
    readiness = coalesce(p_readiness, readiness),
    service_status = coalesce(p_service_status, service_status),
    maintenance_note = case
      when coalesce(p_service_status, service_status) = 'maintenance' then coalesce(nullif(trim(p_note), ''), maintenance_note)
      else null end
  where id = p_room_id;

  perform public.log_activity('room.status_updated', 'room', p_room_id,
    format('Room %s: %s', v_room.room_number, concat_ws(', ',
      case when p_readiness is not null and p_readiness <> v_room.readiness then 'readiness ' || replace(p_readiness::text, '_', ' ') end,
      case when p_service_status = 'maintenance' and v_room.service_status <> 'maintenance' then 'under maintenance' || coalesce(': ' || nullif(trim(p_note), ''), '') end,
      case when p_service_status = 'in_service' and v_room.service_status <> 'in_service' then 'returned to service' end)),
    jsonb_build_object('readiness', p_readiness, 'service_status', p_service_status));
end $$;

-- Configuration changes made directly (managers, via RLS) are audited too.
create or replace function public.rooms_config_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('room.created', 'room', new.id, format('Room %s added', new.room_number), '{}');
  elsif (new.room_number, new.category_id, new.is_active) is distinct from (old.room_number, old.category_id, old.is_active) then
    perform public.log_activity('room.configured', 'room', new.id, format('Room %s configuration changed', new.room_number),
      jsonb_build_object('from_category', old.category_id, 'to_category', new.category_id, 'is_active', new.is_active));
  end if;
  return null;
end $$;
create trigger rooms_config_audit after insert or update on public.rooms
  for each row execute function public.rooms_config_audit();

create or replace function public.room_categories_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('category.created', 'room_category', new.id, format('Room category %s added', new.name), '{}');
  elsif (new.nightly_rate_kobo, new.is_active, new.name, new.max_occupancy) is distinct from (old.nightly_rate_kobo, old.is_active, old.name, old.max_occupancy) then
    perform public.log_activity('category.updated', 'room_category', new.id, format('Room category %s updated', new.name),
      jsonb_build_object('from_rate_kobo', old.nightly_rate_kobo, 'to_rate_kobo', new.nightly_rate_kobo, 'is_active', new.is_active));
  end if;
  return null;
end $$;
create trigger room_categories_audit after insert or update on public.room_categories
  for each row execute function public.room_categories_audit();

-- Front desk must not change readiness/maintenance by writing the table
-- directly (managers' UPDATE policy allows it; keep it consistent by also
-- routing managers' status changes through update_room_status in the app).

-- ---------------------------------------------------------------------------
-- Grants: internal helpers are private; staff functions check roles inside.
-- ---------------------------------------------------------------------------
revoke execute on function
  public._fail(text, text), public._is_live(public.reservation_status, timestamptz),
  public._free_units(uuid, date, date, uuid), public._validate_stay(date, date, integer, boolean),
  public._set_reason(text),
  public._create_reservation(uuid, date, date, integer, uuid, text, text, text, text, public.booking_source, uuid, interval),
  public.create_website_reservation(text, date, date, integer, text, text, text, text),
  public.expire_unpaid_reservations()
from public, anon, authenticated;

grant execute on function public.search_availability(date, date, integer) to anon, authenticated;

revoke execute on function
  public.create_staff_reservation(uuid, date, date, integer, public.booking_source, uuid, text, text, text, text),
  public.assign_room(uuid, uuid), public.check_in_reservation(uuid), public.check_out_reservation(uuid),
  public.cancel_reservation(uuid, text), public.mark_no_show(uuid),
  public.update_reservation_details(uuid, integer, text),
  public.override_payment_requirement(uuid, text, text, integer),
  public.update_room_status(uuid, public.room_readiness, public.room_service_status, text)
from public, anon;
grant execute on function
  public.create_staff_reservation(uuid, date, date, integer, public.booking_source, uuid, text, text, text, text),
  public.assign_room(uuid, uuid), public.check_in_reservation(uuid), public.check_out_reservation(uuid),
  public.cancel_reservation(uuid, text), public.mark_no_show(uuid),
  public.update_reservation_details(uuid, integer, text),
  public.override_payment_requirement(uuid, text, text, integer),
  public.update_room_status(uuid, public.room_readiness, public.room_service_status, text)
to authenticated;
