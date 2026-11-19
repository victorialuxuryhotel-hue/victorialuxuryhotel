-- =============================================================================
-- Victoria Luxury Hotel: core domain schema
--
-- Concepts
--   room_categories  what a guest books (Standard, Deluxe, Suite, Apartment)
--   rooms            the physical rooms staff assign (29 in total)
--   reservations     one stay, for one category, optionally assigned a room
--   payments         money movements against a reservation (never merged into it)
--
-- Money is stored as integer kobo (NGN minor unit, as Paystack uses).
-- Stay dates are hotel-local DATEs; a stay covers nights [check_in, check_out).
-- RLS is enabled on every table here with no policies: deny-by-default until
-- the access-control migration grants specific access.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('owner', 'general_manager', 'front_desk');

create type public.room_service_status as enum ('in_service', 'maintenance');
create type public.room_readiness as enum ('needs_cleaning', 'cleaning_in_progress', 'ready');

create type public.reservation_status as enum (
  'pending_payment', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'expired', 'no_show'
);
create type public.booking_source as enum ('website', 'walk_in', 'phone', 'whatsapp', 'staff');

create type public.payment_kind as enum ('payment', 'refund');
create type public.payment_provider as enum ('paystack', 'offline');
create type public.payment_method as enum ('card', 'bank_transfer', 'cash', 'pos_terminal', 'ussd', 'other');
create type public.payment_status as enum ('pending', 'successful', 'failed', 'abandoned');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- "Today" in the hotel's timezone. Arrivals, departures and daily summaries
-- must not shift at midnight UTC.
create or replace function public.hotel_today() returns date
language sql stable as $$ select (now() at time zone 'Africa/Lagos')::date $$;

-- ---------------------------------------------------------------------------
-- Hotel settings (single row)
-- ---------------------------------------------------------------------------
create table public.hotel_settings (
  id boolean primary key default true check (id),
  check_in_time time not null default '14:00',
  check_out_time time not null default '12:00',
  -- How long an unpaid website reservation holds inventory while the guest pays.
  website_hold_minutes integer not null default 30 check (website_hold_minutes between 10 and 1440),
  -- How long a staff-created unpaid reservation (e.g. phone booking awaiting transfer) holds inventory.
  staff_hold_hours integer not null default 24 check (staff_hold_hours between 1 and 336),
  updated_at timestamptz not null default now()
);
insert into public.hotel_settings default values;
create trigger hotel_settings_updated_at before update on public.hotel_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create table public.staff_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text not null,
  phone text,
  role public.staff_role not null,
  -- Deactivate rather than delete so audit history keeps its actor.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_profiles_email_key on public.staff_profiles (lower(email));
create trigger staff_profiles_updated_at before update on public.staff_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Accommodation
-- ---------------------------------------------------------------------------
create table public.room_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique check (length(trim(name)) between 2 and 80),
  short_description text,
  description text,
  nightly_rate_kobo bigint not null check (nightly_rate_kobo > 0),
  max_occupancy integer not null check (max_occupancy between 1 and 20),
  amenities text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger room_categories_updated_at before update on public.room_categories
  for each row execute function public.set_updated_at();

create table public.room_category_images (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.room_categories (id) on delete cascade,
  -- Object path inside the `room-images` storage bucket.
  storage_path text not null unique,
  alt_text text not null default '',
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);
create index room_category_images_category_idx on public.room_category_images (category_id, sort_order);
create unique index room_category_images_one_cover on public.room_category_images (category_id) where is_cover;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique check (length(trim(room_number)) between 1 and 10),
  category_id uuid not null references public.room_categories (id) on delete restrict,
  floor text,
  service_status public.room_service_status not null default 'in_service',
  maintenance_note text,
  -- Simple readiness indicator. Housekeeping task management is a future module
  -- that will update this column; it does not replace it.
  readiness public.room_readiness not null default 'ready',
  -- false = permanently removed from inventory (kept for history).
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rooms_category_idx on public.rooms (category_id);
create trigger rooms_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Guests
-- ---------------------------------------------------------------------------
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  -- Optional: walk-in guests may not give an email.
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index guests_email_key on public.guests (lower(email)) where email is not null;
create index guests_phone_idx on public.guests (phone) where phone is not null;
create index guests_name_idx on public.guests (lower(full_name));
create trigger guests_updated_at before update on public.guests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------
-- Human-friendly, non-sequential reference (no 0/O/1/I/L confusion).
create or replace function public.generate_reservation_reference() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(6);
  result text := 'VL-';
begin
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end $$;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.generate_reservation_reference(),
  -- Unguessable token for the guest's confirmation page. The reference is
  -- printed on receipts and must not on its own reveal booking details.
  public_token uuid not null unique default gen_random_uuid(),
  guest_id uuid not null references public.guests (id) on delete restrict,
  category_id uuid not null references public.room_categories (id) on delete restrict,
  room_id uuid references public.rooms (id) on delete restrict,
  check_in date not null,
  check_out date not null,
  nights integer generated always as (check_out - check_in) stored,
  guest_count integer not null check (guest_count between 1 and 20),
  -- Price snapshot at booking time; later rate changes do not alter it.
  nightly_rate_kobo bigint not null check (nightly_rate_kobo > 0),
  total_amount_kobo bigint not null check (total_amount_kobo > 0),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  status public.reservation_status not null default 'pending_payment',
  source public.booking_source not null,
  special_requests text check (length(special_requests) <= 1000),
  hold_expires_at timestamptz,
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  -- Set when something needs a human (e.g. payment arrived after the hold
  -- expired and the category had since sold out). Cleared by staff.
  attention_reason text,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reservations_dates_valid check (check_out > check_in),
  constraint reservations_max_stay check (check_out - check_in <= 90),
  constraint reservations_total_matches check (total_amount_kobo = nightly_rate_kobo * (check_out - check_in)),
  constraint reservations_pending_has_hold check (status <> 'pending_payment' or hold_expires_at is not null),
  constraint reservations_in_house_has_room check (status not in ('checked_in', 'checked_out') or room_id is not null),
  constraint reservations_website_not_staff check (source <> 'website' or created_by is null),

  -- A physical room can never hold two live reservations on the same night.
  -- '[)' makes the check-out day free for the next arrival.
  constraint reservations_no_room_overlap exclude using gist (
    room_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (room_id is not null and status in ('pending_payment', 'confirmed', 'checked_in'))
);
create index reservations_check_in_idx on public.reservations (check_in);
create index reservations_check_out_idx on public.reservations (check_out);
create index reservations_status_idx on public.reservations (status);
create index reservations_guest_idx on public.reservations (guest_id);
create index reservations_room_idx on public.reservations (room_id) where room_id is not null;
create index reservations_category_dates_idx on public.reservations (category_id, check_in, check_out);
create index reservations_pending_hold_idx on public.reservations (hold_expires_at) where status = 'pending_payment';
create trigger reservations_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();

-- Lifecycle. Enforced for every writer, including privileged server code.
create or replace function public.is_valid_reservation_transition(
  from_status public.reservation_status, to_status public.reservation_status
) returns boolean
language sql immutable as $$
  select case from_status
    when 'pending_payment' then to_status in ('confirmed', 'cancelled', 'expired')
    when 'confirmed'       then to_status in ('checked_in', 'cancelled', 'no_show')
    when 'checked_in'      then to_status in ('checked_out')
    -- A verified payment can arrive after the hold expired; it may revive the
    -- booking only if inventory is still available (checked by the caller).
    when 'expired'         then to_status in ('confirmed')
    else false             -- checked_out, cancelled, no_show are final
  end
$$;

create table public.reservation_status_history (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  from_status public.reservation_status,
  to_status public.reservation_status not null,
  changed_by uuid references public.staff_profiles (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
create index reservation_status_history_reservation_idx on public.reservation_status_history (reservation_id, created_at);

create or replace function public.reservations_guard_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('pending_payment', 'confirmed') then
      raise exception 'A new reservation must start as pending_payment or confirmed (got %)', new.status
        using errcode = 'check_violation';
    end if;
  elsif new.status is distinct from old.status then
    if not public.is_valid_reservation_transition(old.status, new.status) then
      raise exception 'Invalid reservation status change from % to %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  -- Keep lifecycle timestamps consistent with status.
  if new.status = 'confirmed' and new.confirmed_at is null then new.confirmed_at := now(); end if;
  if new.status = 'checked_in' and new.checked_in_at is null then new.checked_in_at := now(); end if;
  if new.status = 'checked_out' and new.checked_out_at is null then new.checked_out_at := now(); end if;
  if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  if new.status <> 'pending_payment' then new.hold_expires_at := null; end if;
  return new;
end $$;

create trigger reservations_guard_status before insert or update of status on public.reservations
  for each row execute function public.reservations_guard_status();

-- Stay details are frozen once the guest is in house or the stay has ended.
create or replace function public.reservations_guard_frozen() returns trigger
language plpgsql as $$
begin
  if old.status in ('checked_out', 'cancelled', 'expired', 'no_show') and new.status = old.status
     and (new.check_in, new.check_out, new.category_id, new.room_id, new.total_amount_kobo, new.guest_count)
         is distinct from (old.check_in, old.check_out, old.category_id, old.room_id, old.total_amount_kobo, old.guest_count) then
    raise exception 'Reservation % is closed and its stay details cannot change', old.reference
      using errcode = 'check_violation';
  end if;
  if old.status = 'checked_in' and (new.check_in, new.category_id) is distinct from (old.check_in, old.category_id) then
    raise exception 'Arrival date and category cannot change after check-in' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger reservations_guard_frozen before update on public.reservations
  for each row execute function public.reservations_guard_frozen();

create or replace function public.reservations_record_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.reservation_status_history (reservation_id, from_status, to_status, changed_by, reason)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      (select id from public.staff_profiles where id = auth.uid()),
      nullif(current_setting('app.status_reason', true), '')
    );
  end if;
  return null;
end $$;
create trigger reservations_record_history after insert or update of status on public.reservations
  for each row execute function public.reservations_record_history();

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create sequence public.receipt_number_seq;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  -- Room-reservation payments only. Restaurant/bar, events etc. will have their
  -- own sales tables so accommodation revenue stays distinguishable.
  reservation_id uuid not null references public.reservations (id) on delete restrict,
  kind public.payment_kind not null default 'payment',
  amount_kobo bigint not null check (amount_kobo > 0),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  provider public.payment_provider not null,
  method public.payment_method,
  -- Paystack transaction reference (we generate it) or the offline reference
  -- (bank transfer narration, POS slip number). Unique per provider.
  provider_reference text,
  provider_channel text,
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  -- When our server confirmed the payment: Paystack verify API, or a staff
  -- member confirming receipt of an offline payment.
  verified_at timestamptz,
  gateway_response text,
  receipt_number text unique,
  recorded_by uuid references public.staff_profiles (id) on delete set null,
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_success_is_verified check (status <> 'successful' or (verified_at is not null and paid_at is not null)),
  constraint payments_offline_recorded_by_staff check (provider <> 'offline' or recorded_by is not null),
  constraint payments_paystack_has_reference check (provider <> 'paystack' or provider_reference is not null),
  constraint payments_receipt_only_when_successful check (receipt_number is null or status = 'successful')
);
create unique index payments_provider_reference_key on public.payments (provider, provider_reference) where provider_reference is not null;
create index payments_reservation_idx on public.payments (reservation_id);
create index payments_status_paid_at_idx on public.payments (status, paid_at);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- A successful payment is a financial record: its amount, reservation and
-- outcome can't be edited afterwards. Corrections are new rows (e.g. a refund).
create or replace function public.payments_guard_final() returns trigger
language plpgsql as $$
begin
  if old.status = 'successful'
     and (new.status, new.amount_kobo, new.reservation_id, new.kind, new.provider, new.provider_reference)
         is distinct from (old.status, old.amount_kobo, old.reservation_id, old.kind, old.provider, old.provider_reference) then
    raise exception 'Successful payments are immutable' using errcode = 'check_violation';
  end if;
  if old.status in ('failed', 'abandoned') and new.status = 'pending' then
    raise exception 'A closed payment attempt cannot be reopened' using errcode = 'check_violation';
  end if;
  if new.status = 'successful' and new.receipt_number is null then
    new.receipt_number := 'RCT-' || to_char(now() at time zone 'Africa/Lagos', 'YYYY') || '-'
      || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
  end if;
  return new;
end $$;
create trigger payments_guard_final before update on public.payments
  for each row execute function public.payments_guard_final();

create or replace function public.payments_assign_receipt() returns trigger
language plpgsql as $$
begin
  if new.status = 'successful' and new.receipt_number is null then
    new.receipt_number := 'RCT-' || to_char(now() at time zone 'Africa/Lagos', 'YYYY') || '-'
      || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
  end if;
  return new;
end $$;
create trigger payments_assign_receipt before insert on public.payments
  for each row execute function public.payments_assign_receipt();

-- Raw provider notifications, kept for idempotency and investigation.
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider public.payment_provider not null,
  event_type text not null,
  provider_reference text,
  -- Paystack retries deliver an identical body; the hash makes retries no-ops.
  payload_hash text not null unique,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);
create index payment_events_reference_idx on public.payment_events (provider, provider_reference);

-- ---------------------------------------------------------------------------
-- Activity / audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.staff_profiles (id) on delete set null,
  actor_type text not null check (actor_type in ('staff', 'system', 'guest')),
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  -- Context only. Never store card data, tokens or full provider payloads here.
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index activity_log_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);
create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_actor_idx on public.activity_log (actor_id, created_at desc);

create or replace function public.activity_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Activity records cannot be modified or deleted' using errcode = 'insufficient_privilege';
end $$;
create trigger activity_log_no_update before update or delete on public.activity_log
  for each row execute function public.activity_log_immutable();

-- Writes an activity record attributed to the current staff member, or to the
-- system when there is no staff session (webhooks, scheduled jobs).
create or replace function public.log_activity(
  p_action text, p_entity_type text, p_entity_id uuid, p_summary text, p_metadata jsonb default '{}'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select id from public.staff_profiles where id = auth.uid());
begin
  insert into public.activity_log (actor_id, actor_type, action, entity_type, entity_id, summary, metadata)
  values (v_actor, case when v_actor is null then 'system' else 'staff' end,
          p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'));
end $$;

-- ---------------------------------------------------------------------------
-- Deny by default. Access is granted explicitly in the access-control migration.
-- ---------------------------------------------------------------------------
alter table public.hotel_settings enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.room_categories enable row level security;
alter table public.room_category_images enable row level security;
alter table public.rooms enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.activity_log enable row level security;

-- Internal helpers are not part of the public API.
revoke execute on function public.log_activity(text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.generate_reservation_reference() from public, anon, authenticated;
