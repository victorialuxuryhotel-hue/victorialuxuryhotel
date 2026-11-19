-- =============================================================================
-- LOCAL DEMO DATA ONLY (`pnpm db:demo`). Invented guests and bookings so every
-- management screen has something to show. Never run against production.
-- Requires the dev staff accounts (pnpm db:seed-staff).
-- =============================================================================
do $$
declare
  t date := public.hotel_today();
  desk uuid := (select id from public.staff_profiles where email = 'frontdesk@victoria.test');
  cat_std uuid := (select id from public.room_categories where slug = 'standard');
  cat_dlx uuid := (select id from public.room_categories where slug = 'deluxe');
  cat_ste uuid := (select id from public.room_categories where slug = 'suite');
  cat_apt uuid := (select id from public.room_categories where slug = 'apartment');
  g uuid; r uuid;
  rate bigint;
begin
  if desk is null then raise exception 'Run pnpm db:seed-staff first'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', desk)::text, true);

  -- helper: create guest + reservation + optional room/payment/status
  create temp table demo (name text, phone text, email text, cat uuid, room text, ci int, co int, guests int, status text, paid_pct int, src text, attention text) on commit drop;
  insert into demo values
    ('Adaeze Okafor',  '+234 803 111 0001', 'adaeze.okafor@example.com', cat_dlx, '204', 0, 3, 2, 'confirmed',   100, 'website',  null),
    ('Tunde Bakare',   '+234 806 111 0002', 'tunde.bakare@example.com',  cat_ste, null,  0, 1, 2, 'pending',       0, 'phone',    null),
    ('Ngozi Uche',     '+234 809 111 0003', 'ngozi.uche@example.com',    cat_std, null,  0, 2, 1, 'confirmed',   100, 'website',  null),
    ('Grace Adeyemi',  '+234 807 111 0004', null,                        cat_std, '107', -3, 0, 1, 'checked_in', 100, 'walk_in',  null),
    ('Ibrahim Musa',   '+234 805 111 0005', 'ibrahim.musa@example.com',  cat_apt, '402', -8, 10, 4, 'checked_in', 50, 'whatsapp', null),
    ('Funmi Adebayo',  '+234 802 111 0006', 'funmi.a@example.com',       cat_dlx, '201', -2, 2, 2, 'checked_in', 100, 'website',  null),
    ('Chioma Eze',     '+234 808 111 0007', 'chioma.eze@example.com',    cat_std, null,  2, 4, 2, 'confirmed',   100, 'website',  null),
    ('Emeka Nwosu',    '+234 803 111 0008', 'emeka.nwosu@example.com',   cat_ste, null,  5, 8, 3, 'confirmed',   100, 'website',  'Paid in full after the hold expired. Confirm a suite is still free.'),
    ('Kelechi Obi',    '+234 806 111 0009', 'kelechi.obi@example.com',   cat_dlx, null,  9, 11, 2, 'pending',      0, 'website',  null),
    ('Olumide Ajayi',  '+234 809 111 0010', 'olumide.ajayi@example.com', cat_std, null,  1, 3, 1, 'cancelled',    0, 'phone',    null);

  for g, r in select null::uuid, null::uuid loop end loop;

  declare d record;
  begin
    for d in select * from demo loop
      insert into public.guests (full_name, phone, email) values (d.name, d.phone, d.email)
        on conflict ((lower(email))) where email is not null do update set phone = excluded.phone
        returning id into g;
      rate := (select nightly_rate_kobo from public.room_categories where id = d.cat);
      insert into public.reservations (guest_id, category_id, room_id, check_in, check_out, guest_count, nightly_rate_kobo, total_amount_kobo,
                                       status, source, hold_expires_at, created_by, attention_reason, created_at)
      values (g, d.cat, (select id from public.rooms where room_number = d.room), t + d.ci, t + d.co, d.guests, rate, rate * (d.co - d.ci),
              'pending_payment', d.src::public.booking_source, now() + interval '20 hours', case when d.src = 'website' then null else desk end,
              d.attention, now() - make_interval(days => greatest(1, -d.ci + 2)))
      returning id into r;
      if d.paid_pct > 0 then
        insert into public.payments (reservation_id, amount_kobo, provider, method, provider_reference, status, paid_at, verified_at, recorded_by, provider_channel)
        values (r, rate * (d.co - d.ci) * d.paid_pct / 100,
                case when d.src = 'website' then 'paystack' else 'offline' end::public.payment_provider,
                case when d.src = 'website' then 'card' when d.src = 'walk_in' then 'cash' else 'bank_transfer' end::public.payment_method,
                case when d.src = 'website' then 'demo-' || substr(md5(r::text), 1, 10) else null end,
                'successful', now() - make_interval(days => greatest(0, -d.ci + 1)), now(),
                case when d.src = 'website' then null else desk end,
                case when d.src = 'website' then 'card' else null end);
      end if;
      if d.status in ('confirmed', 'checked_in', 'cancelled') then
        update public.reservations set status = 'confirmed' where id = r;
      end if;
      if d.status = 'checked_in' then update public.reservations set status = 'checked_in' where id = r; end if;
      if d.status = 'cancelled' then
        perform set_config('app.status_reason', 'Guest changed travel plans', true);
        update public.reservations set status = 'cancelled', cancellation_reason = 'Guest changed travel plans' where id = r;
      end if;
    end loop;
  end;

  -- A few rooms in other states for the room board.
  update public.rooms set readiness = 'needs_cleaning' where room_number in ('103', '205');
  update public.rooms set readiness = 'cleaning_in_progress' where room_number = '108';
  update public.rooms set service_status = 'maintenance', maintenance_note = 'Air conditioning repair' where room_number = '303';

  -- Something for the room-type pages.
  update public.room_categories set
    short_description = '[Sample] Comfortable, well-appointed rooms for a restful stay.',
    description = '[Sample description — replace with the hotel''s own words.] A calm, comfortable room with everything you need for a good night''s rest.',
    amenities = array['[Sample] Double bed', 'Free Wi-Fi', '24/7 power', 'Air conditioning']
  where slug = 'standard';
end $$;

-- Demo bookings are not real: never email their (invented) guests.
update public.email_outbox set status = 'skipped', last_error = 'demo data' where status = 'pending';
