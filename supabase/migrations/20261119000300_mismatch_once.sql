-- A payment whose amount doesn't match is flagged once. Later checks of the
-- same payment (browser return, page refresh, the 10-minute sweep for up to
-- 48 hours) return 'already_flagged' instead of logging and alerting again.
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
      -- Already flagged by an earlier check (callback, page refresh or the
      -- scheduled sweep): don't log or alert again.
      if v_pay.gateway_response like 'Amount/currency mismatch%' then return 'already_flagged'; end if;
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
