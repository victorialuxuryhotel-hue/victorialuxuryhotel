-- =============================================================================
-- Payments: Paystack checkout and verification, offline payments, receipts.
--
-- Rules
--  * A reservation is confirmed only from a VERIFIED payment: Paystack's verify
--    API (called by our server) or a staff member confirming receipt. Never
--    from the browser returning to a success page.
--  * apply_paystack_result() is idempotent and serialised on the payment row, so
--    the browser callback and the webhook (and Paystack's retries) can all call
--    it safely; exactly one of them performs the confirmation.
--  * Amount and currency must match what we asked for. Anything unexpected is
--    flagged for a human ("attention_reason"), never silently accepted.
-- =============================================================================

-- Net verified money in for a reservation (payments minus refunds).
create or replace function public._net_paid(p_reservation_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when kind = 'payment' then amount_kobo else -amount_kobo end), 0)::bigint
  from public.payments where reservation_id = p_reservation_id and status = 'successful'
$$;

-- Confirms a fully paid reservation if it can be. Called with the reservation
-- row locked. Returns the outcome for logging and notifications.
create or replace function public._settle_reservation(p_res public.reservations) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_paid bigint := public._net_paid(p_res.id);
begin
  if v_paid < p_res.total_amount_kobo then return 'part_paid'; end if;

  if p_res.status = 'pending_payment' and p_res.hold_expires_at > now() then
    update public.reservations set status = 'confirmed' where id = p_res.id;
    return 'confirmed';
  end if;

  if p_res.status in ('pending_payment', 'expired') then
    -- Paid after the hold lapsed: inventory may have gone. Re-check under lock.
    perform 1 from public.room_categories where id = p_res.category_id for update;
    if public._free_units(p_res.category_id, p_res.check_in, p_res.check_out, p_res.id) > 0 then
      update public.reservations set status = 'confirmed' where id = p_res.id;
      return 'confirmed';
    end if;
    if p_res.status = 'pending_payment' then
      perform public._set_reason('Paid after hold expired; no room available');
      update public.reservations set status = 'expired' where id = p_res.id;
    end if;
    update public.reservations
      set attention_reason = 'Paid in full after the hold expired, but this room type is now fully booked. Offer another room or arrange a refund.'
      where id = p_res.id;
    return 'paid_unavailable';
  end if;

  if p_res.status in ('cancelled', 'no_show') then
    update public.reservations set attention_reason = 'Payment received for a cancelled reservation. Arrange a refund or rebook.' where id = p_res.id;
    return 'paid_closed';
  end if;

  return 'already_settled'; -- confirmed / checked in / checked out
end $$;

-- ---------------------------------------------------------------------------
-- Paystack: start a payment attempt for a held website booking (service role)
-- ---------------------------------------------------------------------------
create or replace function public.begin_paystack_payment(p_public_token uuid)
returns table (reference text, amount_kobo bigint, email text, reservation_reference text)
language plpgsql security definer set search_path = '' as $$
declare
  v_res public.reservations;
  v_email text;
  v_balance bigint;
  v_ref text;
begin
  select * into v_res from public.reservations r where r.public_token = p_public_token for update;
  if not found then perform public._fail('NOT_FOUND', 'Booking not found.'); end if;
  if v_res.status <> 'pending_payment' then
    perform public._fail('INVALID_TRANSITION', case when v_res.status = 'confirmed' then 'This booking is already paid and confirmed.' else 'This booking can no longer be paid online.' end);
  end if;
  if v_res.hold_expires_at <= now() then perform public._fail('UNAVAILABLE', 'Your booking hold has ended. Please search again.'); end if;

  v_email := (select g.email from public.guests g where g.id = v_res.guest_id);
  if v_email is null then perform public._fail('VALIDATION', 'An email address is needed to pay online.'); end if;

  v_balance := v_res.total_amount_kobo - public._net_paid(v_res.id);
  if v_balance <= 0 then perform public._fail('INVALID_TRANSITION', 'Nothing left to pay on this booking.'); end if;

  -- One reference per attempt; Paystack rejects re-used references.
  v_ref := lower(v_res.reference) || '-' || encode(extensions.gen_random_bytes(4), 'hex');
  insert into public.payments (reservation_id, amount_kobo, provider, provider_reference, status)
  values (v_res.id, v_balance, 'paystack', v_ref, 'pending');

  perform public.log_activity('payment.started', 'reservation', v_res.id,
    format('Online payment started for %s', v_res.reference), jsonb_build_object('provider_reference', v_ref, 'amount_kobo', v_balance));
  return query select v_ref, v_balance, v_email, v_res.reference;
end $$;

-- ---------------------------------------------------------------------------
-- Paystack: apply a result OUR SERVER obtained from Paystack's verify API.
-- Idempotent. Returns: confirmed | part_paid | paid_unavailable | paid_closed |
-- already_settled | already_processed | amount_mismatch | failed | abandoned |
-- still_pending
-- ---------------------------------------------------------------------------
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
  -- Lock order everywhere: payment, then reservation.
  select * into v_pay from public.payments where provider = 'paystack' and provider_reference = p_reference for update;
  if not found then perform public._fail('NOT_FOUND', 'Unknown payment reference.'); end if;
  if v_pay.status = 'successful' then return 'already_processed'; end if;

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
      status = 'successful',
      paid_at = coalesce(p_paid_at, now()),
      verified_at = now(),
      provider_channel = p_channel,
      method = case p_channel when 'card' then 'card' when 'bank' then 'bank_transfer' when 'bank_transfer' then 'bank_transfer' when 'ussd' then 'ussd' else 'other' end::public.payment_method,
      gateway_response = p_gateway_response
    where id = v_pay.id;

    v_outcome := public._settle_reservation(v_res);
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
  return 'still_pending'; -- ongoing / pending / queued: nothing to do yet
end $$;

-- ---------------------------------------------------------------------------
-- Offline payments: staff confirm the money has actually been received.
-- ---------------------------------------------------------------------------
create or replace function public.record_offline_payment(
  p_reservation_id uuid, p_amount_kobo bigint, p_method public.payment_method, p_reference text,
  p_paid_on date, p_notes text, p_confirm_received boolean
) returns table (payment_id uuid, receipt_number text, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager', 'front_desk']::public.staff_role[]);
  v_res public.reservations;
  v_balance bigint;
  v_pay public.payments;
  v_outcome text;
begin
  if p_confirm_received is not true then
    perform public._fail('VALIDATION', 'Confirm that the hotel has received this money before recording it.');
  end if;
  if p_method not in ('cash', 'bank_transfer', 'pos_terminal', 'other') then perform public._fail('VALIDATION', 'Choose how the money was received.'); end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 then perform public._fail('VALIDATION', 'Enter the amount received.'); end if;
  if p_paid_on is null or p_paid_on > public.hotel_today() then perform public._fail('VALIDATION', 'The payment date can''t be in the future.'); end if;
  if p_paid_on < public.hotel_today() - 60 then perform public._fail('VALIDATION', 'Payments older than 60 days must be recorded by a manager with the accounts team.'); end if;

  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then perform public._fail('NOT_FOUND', 'Reservation not found.'); end if;
  if v_res.status not in ('pending_payment', 'confirmed', 'checked_in', 'checked_out', 'expired') then
    perform public._fail('INVALID_TRANSITION', 'Payments can''t be recorded against a cancelled reservation.');
  end if;
  v_balance := v_res.total_amount_kobo - public._net_paid(v_res.id);
  if v_balance <= 0 then perform public._fail('VALIDATION', 'This reservation is already paid in full.'); end if;
  if p_amount_kobo > v_balance then
    perform public._fail('VALIDATION', format('That is more than the ₦%s balance due.', to_char(v_balance / 100.0, 'FM999,999,990')));
  end if;

  insert into public.payments (reservation_id, amount_kobo, provider, method, provider_reference, status, paid_at, verified_at, recorded_by, notes)
  values (v_res.id, p_amount_kobo, 'offline', p_method, nullif(trim(p_reference), ''), 'successful',
          (p_paid_on + (now() at time zone 'Africa/Lagos')::time) at time zone 'Africa/Lagos', now(), v_staff, nullif(trim(p_notes), ''))
  returning * into v_pay;

  v_outcome := public._settle_reservation(v_res);
  perform public.log_activity('payment.recorded', 'reservation', v_res.id,
    format('%s payment of ₦%s recorded for %s', initcap(replace(p_method::text, '_', ' ')), to_char(p_amount_kobo / 100.0, 'FM999,999,990'), v_res.reference),
    jsonb_build_object('payment_id', v_pay.id, 'receipt_number', v_pay.receipt_number, 'outcome', v_outcome));
  return query select v_pay.id, v_pay.receipt_number, v_outcome;
exception when unique_violation then
  perform public._fail('CONFLICT', 'A payment with this reference has already been recorded.');
end $$;

-- Staff clear a "needs attention" flag once handled, with a note.
create or replace function public.resolve_attention(p_reservation_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager']::public.staff_role[]);
  v_res public.reservations;
begin
  if length(trim(coalesce(p_note, ''))) < 5 then perform public._fail('VALIDATION', 'Describe how this was resolved.'); end if;
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then perform public._fail('NOT_FOUND', 'Reservation not found.'); end if;
  if v_res.attention_reason is null then return; end if;
  update public.reservations set attention_reason = null where id = v_res.id;
  perform public.log_activity('reservation.attention_resolved', 'reservation', v_res.id,
    format('%s: issue resolved: %s', v_res.reference, trim(p_note)), jsonb_build_object('was', v_res.attention_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Date changes (same room type). Re-checks availability; price uses the rate
-- agreed at booking. If the new total is below what's been paid, flag it.
-- ---------------------------------------------------------------------------
create or replace function public.change_reservation_dates(p_reservation_id uuid, p_check_in date, p_check_out date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := public.require_role(array['owner', 'general_manager', 'front_desk']::public.staff_role[]);
  v_res public.reservations;
  v_cat uuid;
  v_new_total bigint;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then perform public._fail('NOT_FOUND', 'Reservation not found.'); end if;
  if v_res.status not in ('pending_payment', 'confirmed', 'checked_in') then perform public._fail('INVALID_TRANSITION', 'This reservation is closed.'); end if;
  if v_res.status = 'checked_in' and p_check_in <> v_res.check_in then
    perform public._fail('VALIDATION', 'The guest is in house: only the check-out date can change.');
  end if;
  perform public._validate_stay(p_check_in, p_check_out, v_res.guest_count, v_res.status = 'checked_in');
  if (p_check_in, p_check_out) = (v_res.check_in, v_res.check_out) then return; end if;

  v_cat := coalesce((select category_id from public.rooms where id = v_res.room_id), v_res.category_id);
  perform 1 from public.room_categories where id = v_cat for update;
  if public._free_units(v_cat, p_check_in, p_check_out, v_res.id) <= 0 then
    perform public._fail('UNAVAILABLE', 'No availability for the new dates in this room type.');
  end if;

  v_new_total := v_res.nightly_rate_kobo * (p_check_out - p_check_in);
  begin
    update public.reservations set check_in = p_check_in, check_out = p_check_out, total_amount_kobo = v_new_total where id = v_res.id;
  exception when exclusion_violation then
    perform public._fail('CONFLICT', 'The assigned room is booked on some of the new nights. Unassign or change the room first.');
  end;
  if public._net_paid(v_res.id) > v_new_total then
    update public.reservations set attention_reason = 'Dates shortened: the guest has paid more than the new total. Arrange a refund for the difference.' where id = v_res.id;
  end if;
  perform public.log_activity('reservation.dates_changed', 'reservation', v_res.id,
    format('%s dates changed: %s → %s (was %s → %s)', v_res.reference, p_check_in, p_check_out, v_res.check_in, v_res.check_out),
    jsonb_build_object('from_total_kobo', v_res.total_amount_kobo, 'to_total_kobo', v_new_total));
end $$;

-- Receipts: staff look up a receipt by number (RLS on payments applies).
create index if not exists payments_receipt_number_idx on public.payments (receipt_number) where receipt_number is not null;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public._net_paid(uuid), public._settle_reservation(public.reservations),
  public.begin_paystack_payment(uuid),
  public.apply_paystack_result(text, text, bigint, text, timestamptz, text, text)
from public, anon, authenticated;

revoke execute on function
  public.record_offline_payment(uuid, bigint, public.payment_method, text, date, text, boolean),
  public.resolve_attention(uuid, text),
  public.change_reservation_dates(uuid, date, date)
from public, anon;
grant execute on function
  public.record_offline_payment(uuid, bigint, public.payment_method, text, date, text, boolean),
  public.resolve_attention(uuid, text),
  public.change_reservation_dates(uuid, date, date)
to authenticated;
