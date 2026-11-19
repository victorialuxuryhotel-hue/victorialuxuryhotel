-- =============================================================================
-- Fixes from the engineering review (19 Nov 2026).
--   1. Overpayment between payment channels is detected and flagged.
--   2. Email outbox: notifications are recorded in the same transaction as the
--      change that causes them, then delivered (and retried) by the app.
--   3. Rate limiting primitive for anonymous website actions.
--   4. Gapless receipt numbers (a locked counter instead of a sequence).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4. Gapless receipt numbers
-- A sequence never rolls back, so a failed transaction left a hole in the
-- receipt series. A counter row updated inside the transaction rolls back
-- with it; the row lock serialises receipt issuing (fine at hotel volume).
-- ---------------------------------------------------------------------------
create table public.receipt_counters (
  year integer primary key,
  last_number integer not null check (last_number >= 0)
);
alter table public.receipt_counters enable row level security; -- no client access

-- Continue from the numbers already issued.
insert into public.receipt_counters (year, last_number)
select split_part(receipt_number, '-', 2)::int, max(split_part(receipt_number, '-', 3)::int)
from public.payments where receipt_number is not null group by 1;

create or replace function public._next_receipt_number() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_year integer := extract(year from now() at time zone 'Africa/Lagos')::int;
  v_n integer;
begin
  insert into public.receipt_counters (year, last_number) values (v_year, 1)
  on conflict (year) do update set last_number = public.receipt_counters.last_number + 1
  returning last_number into v_n;
  return 'RCT-' || v_year || '-' || lpad(v_n::text, 6, '0');
end $$;
revoke execute on function public._next_receipt_number() from public, anon, authenticated;

create or replace function public.payments_assign_receipt() returns trigger
language plpgsql as $$
begin
  if new.status = 'successful' and new.receipt_number is null then
    new.receipt_number := public._next_receipt_number();
  end if;
  return new;
end $$;

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
    new.receipt_number := public._next_receipt_number();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Email outbox
-- Written by triggers in the same transaction as the business change, so an
-- email can't be lost if the app crashes between committing and sending.
-- The app claims rows with SKIP LOCKED, sends with the row id as Resend's
-- idempotency key, and the cron job retries anything left pending.
-- ---------------------------------------------------------------------------
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('booking_confirmed', 'payment_received', 'reservation_cancelled')),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
-- One of each per reservation (payment receipts: one per payment).
create unique index email_outbox_once_per_reservation on public.email_outbox (kind, reservation_id) where kind <> 'payment_received';
create unique index email_outbox_once_per_payment on public.email_outbox (payment_id) where kind = 'payment_received';
create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where status = 'pending';

alter table public.email_outbox enable row level security;
create policy "managers read email outbox" on public.email_outbox for select to authenticated using (public.is_manager());
revoke insert, update, delete on public.email_outbox from anon, authenticated;

create or replace function public.reservations_queue_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    insert into public.email_outbox (kind, reservation_id) values ('booking_confirmed', new.id) on conflict do nothing;
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.email_outbox (kind, reservation_id) values ('reservation_cancelled', new.id) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger reservations_queue_email after update of status on public.reservations
  for each row execute function public.reservations_queue_email();

create or replace function public.payments_queue_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.provider = 'offline' and new.kind = 'payment' and new.status = 'successful' then
    insert into public.email_outbox (kind, reservation_id, payment_id) values ('payment_received', new.reservation_id, new.id) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger payments_queue_email after insert on public.payments
  for each row execute function public.payments_queue_email();

-- Claim due emails for sending. SKIP LOCKED lets several workers run safely;
-- the attempt is counted up front so a crash mid-send still backs off.
create or replace function public.claim_outbox(p_limit integer default 20, p_only uuid[] default null)
returns setof public.email_outbox
language sql security definer set search_path = '' as $$
  update public.email_outbox o set
    attempts = o.attempts + 1,
    next_attempt_at = now() + make_interval(mins => least(60, 2 ^ o.attempts)::int)
  where o.id in (
    select id from public.email_outbox
    where status = 'pending' and next_attempt_at <= now() and (p_only is null or id = any (p_only))
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning o.*
$$;

create or replace function public.finish_outbox(p_id uuid, p_status text, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.email_outbox set
    status = case
      when p_status in ('sent', 'skipped') then p_status
      when attempts >= 5 then 'failed'
      else 'pending' end,
    sent_at = case when p_status = 'sent' then now() end,
    last_error = left(p_error, 500)
  where id = p_id;
end $$;

revoke execute on function public.claim_outbox(integer, uuid[]), public.finish_outbox(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Overpayment detection
-- A Paystack checkout fixes its amount when the guest clicks Pay. If staff
-- record another payment meanwhile, both can succeed. The money is real, so
-- it's recorded, and the booking is flagged for a refund of the excess.
-- ---------------------------------------------------------------------------
create or replace function public._flag_overpayment(p_res public.reservations) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_over bigint := public._net_paid(p_res.id) - p_res.total_amount_kobo;
begin
  if v_over <= 0 then return false; end if;
  update public.reservations
    set attention_reason = format('Overpaid by ₦%s: more than one payment was received. Refund the difference.', to_char(v_over / 100.0, 'FM999,999,990'))
    where id = p_res.id;
  perform public.log_activity('payment.overpaid', 'reservation', p_res.id,
    format('%s overpaid by ₦%s', p_res.reference, to_char(v_over / 100.0, 'FM999,999,990')), jsonb_build_object('over_kobo', v_over));
  return true;
end $$;
revoke execute on function public._flag_overpayment(public.reservations) from public, anon, authenticated;

create or replace function public.apply_paystack_result(
  p_reference text, p_status text, p_amount_kobo bigint, p_currency text,
  p_paid_at timestamptz, p_channel text, p_gateway_response text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments;
  v_res public.reservations;
  v_outcome text;
begin
  select * into v_pay from public.payments where provider = 'paystack' and provider_reference = p_reference for update;
  if not found then perform public._fail('NOT_FOUND', 'Unknown payment reference.'); end if;
  if v_pay.status = 'successful' then return 'already_processed'; end if;

  -- Lock order payment → reservation. record_offline_payment locks only the
  -- reservation (never a payment row), so the two paths can't deadlock; the
  -- second to commit sees the first's payment and is flagged as overpaid.
  select * into v_res from public.reservations where id = v_pay.reservation_id for update;

  if p_status = 'success' then
    if upper(p_currency) <> 'NGN' or p_amount_kobo <> v_pay.amount_kobo then
      update public.payments set gateway_response = format('Amount/currency mismatch: expected %s NGN, Paystack reported %s %s', v_pay.amount_kobo, p_amount_kobo, p_currency)
        where id = v_pay.id;
      update public.reservations set attention_reason = 'Paystack reported a payment that does not match the amount due. Check the Paystack dashboard before confirming.'
        where id = v_res.id;
      perform public.log_activity('payment.mismatch', 'reservation', v_res.id,
        format('Payment %s for %s did not match the amount due', p_reference, v_res.reference),
        jsonb_build_object('expected_kobo', v_pay.amount_kobo, 'reported_kobo', p_amount_kobo, 'currency', p_currency));
      return 'amount_mismatch';
    end if;

    update public.payments set
      status = 'successful', paid_at = coalesce(p_paid_at, now()), verified_at = now(), provider_channel = p_channel,
      method = case p_channel when 'card' then 'card' when 'bank' then 'bank_transfer' when 'bank_transfer' then 'bank_transfer' when 'ussd' then 'ussd' else 'other' end::public.payment_method,
      gateway_response = p_gateway_response
    where id = v_pay.id;

    v_outcome := public._settle_reservation(v_res);
    if public._flag_overpayment(v_res) then v_outcome := 'overpaid'; end if;
    perform public.log_activity('payment.verified', 'reservation', v_res.id,
      format('Paystack payment verified for %s (₦%s)', v_res.reference, to_char(v_pay.amount_kobo / 100.0, 'FM999,999,990')),
      jsonb_build_object('provider_reference', p_reference, 'outcome', v_outcome, 'channel', p_channel));
    return v_outcome;
  end if;

  if v_pay.status <> 'pending' then return 'already_processed'; end if;
  if p_status in ('failed', 'reversed') then
    update public.payments set status = 'failed', gateway_response = p_gateway_response where id = v_pay.id;
    perform public.log_activity('payment.failed', 'reservation', v_res.id, format('Online payment failed for %s', v_res.reference),
      jsonb_build_object('provider_reference', p_reference, 'gateway_response', p_gateway_response));
    return 'failed';
  elsif p_status = 'abandoned' then
    update public.payments set status = 'abandoned', gateway_response = p_gateway_response where id = v_pay.id;
    return 'abandoned';
  end if;
  return 'still_pending';
end $$;
revoke execute on function public.apply_paystack_result(text, text, bigint, text, timestamptz, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rate limiting (fixed window), for anonymous website actions.
-- Keys are hashed by the app (no raw IP addresses are stored).
-- ---------------------------------------------------------------------------
create table public.rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_hits enable row level security; -- no client access

create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limit_hits (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limit_hits.hits + 1
  returning hits into v_hits;
  -- Housekeeping on ~1% of calls: drop windows older than a day.
  if random() < 0.01 then delete from public.rate_limit_hits where window_start < now() - interval '1 day'; end if;
  return v_hits <= p_limit;
end $$;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
