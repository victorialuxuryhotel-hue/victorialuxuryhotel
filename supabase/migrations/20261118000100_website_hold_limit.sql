-- Website holds are created by anonymous visitors. Without a limit, someone
-- could tie up inventory by repeatedly booking without paying. Allow at most
-- three live unpaid website holds per email address.
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
  if (select count(*) from public.reservations r join public.guests g on g.id = r.guest_id
      where lower(g.email) = lower(trim(p_email)) and r.source = 'website'
        and r.status = 'pending_payment' and r.hold_expires_at > now()) >= 3 then
    perform public._fail('CONFLICT', 'You already have bookings waiting for payment. Please complete or wait for those first, or contact the hotel.');
  end if;
  v_res := public._create_reservation(v_cat, p_check_in, p_check_out, p_guests, null, p_full_name, p_email, p_phone,
                                      p_special_requests, 'website', null, make_interval(mins => v_minutes));
  return query select v_res.id, v_res.reference, v_res.public_token, v_res.total_amount_kobo, v_res.hold_expires_at;
end $$;

revoke execute on function public.create_website_reservation(text, date, date, integer, text, text, text, text) from public, anon, authenticated;
