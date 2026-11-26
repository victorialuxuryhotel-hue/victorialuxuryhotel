-- =============================================================================
-- LOCAL DEMO DATA ONLY (`pnpm db:fresh`). Invented guests and bookings so every
-- management screen has something to show. Never run against production.
-- Dates are relative to today (hotel time). Runs as the dev front desk account
-- so the activity log and history show a staff member.
-- =============================================================================
INSERT OR REPLACE INTO _ctx (id, actor_id, reason) VALUES (1, '00000000-0000-4000-8000-0000000000a3', NULL);

-- Adaeze Okafor: deluxe, confirmed
INSERT INTO guests (id, full_name, email, phone) VALUES ('00000000-0000-4000-8000-0000000d0001', 'Adaeze Okafor', 'adaeze.okafor@example.com', '+234 803 111 0001');
INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by, attention_reason, created_at)
VALUES ('00000000-0000-4000-8000-0000000e0001', 'VL-DEMO01', '00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-000000000002', (SELECT id FROM rooms WHERE room_number = '204'), date('now', '+1 hour', '+0 days'), date('now', '+1 hour', '+3 days'), 2,
  7500000, 22500000, 'pending_payment', 'website', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 hours'), NULL, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'));
INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, status, paid_at, verified_at, recorded_by, provider_channel)
VALUES ('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000e0001', 22500000, 'paystack', 'card',
  'demo-01-paid', 'successful', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, 'card');
UPDATE reservations SET status = 'confirmed' WHERE id = '00000000-0000-4000-8000-0000000e0001';

-- Tunde Bakare: suite, pending
INSERT INTO guests (id, full_name, email, phone) VALUES ('00000000-0000-4000-8000-0000000d0002', 'Tunde Bakare', 'tunde.bakare@example.com', '+234 806 111 0002');
INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by, attention_reason, created_at)
VALUES ('00000000-0000-4000-8000-0000000e0002', 'VL-DEMO02', '00000000-0000-4000-8000-0000000f0002', '00000000-0000-4000-8000-0000000d0002', '00000000-0000-4000-8000-000000000003', NULL, date('now', '+1 hour', '+0 days'), date('now', '+1 hour', '+1 days'), 2,
  10800000, 10800000, 'pending_payment', 'phone', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 hours'), '00000000-0000-4000-8000-0000000000a3', NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'));

-- Ngozi Uche: standard, confirmed
INSERT INTO guests (id, full_name, email, phone) VALUES ('00000000-0000-4000-8000-0000000d0003', 'Ngozi Uche', 'ngozi.uche@example.com', '+234 809 111 0003');
INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by, attention_reason, created_at)
VALUES ('00000000-0000-4000-8000-0000000e0003', 'VL-DEMO03', '00000000-0000-4000-8000-0000000f0003', '00000000-0000-4000-8000-0000000d0003', '00000000-0000-4000-8000-000000000001', NULL, date('now', '+1 hour', '+0 days'), date('now', '+1 hour', '+2 days'), 1,
  5500000, 11000000, 'pending_payment', 'website', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 hours'), NULL, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'));
INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, status, paid_at, verified_at, recorded_by, provider_channel)
VALUES ('00000000-0000-4000-8000-0000000c0003', '00000000-0000-4000-8000-0000000e0003', 11000000, 'paystack', 'card',
  'demo-03-paid', 'successful', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, 'card');
UPDATE reservations SET status = 'confirmed' WHERE id = '00000000-0000-4000-8000-0000000e0003';

-- Grace Adeyemi: standard, checked_in
INSERT INTO guests (id, full_name, email, phone) VALUES ('00000000-0000-4000-8000-0000000d0004', 'Grace Adeyemi', NULL, '+234 807 111 0004');
INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by, attention_reason, created_at)
VALUES ('00000000-0000-4000-8000-0000000e0004', 'VL-DEMO04', '00000000-0000-4000-8000-0000000f0004', '00000000-0000-4000-8000-0000000d0004', '00000000-0000-4000-8000-000000000001', (SELECT id FROM rooms WHERE room_number = '107'), date('now', '+1 hour', '-3 days'), date('now', '+1 hour', '+0 days'), 1,
  5500000, 16500000, 'pending_payment', 'walk_in', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 hours'), '00000000-0000-4000-8000-0000000000a3', NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days'));
INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, status, paid_at, verified_at, recorded_by, provider_channel)
VALUES ('00000000-0000-4000-8000-0000000c0004', '00000000-0000-4000-8000-0000000e0004', 16500000, 'offline', 'cash',
  NULL, 'successful', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '00000000-0000-4000-8000-0000000000a3', NULL);
UPDATE reservations SET status = 'confirmed' WHERE id = '00000000-0000-4000-8000-0000000e0004';
UPDATE reservations SET status = 'checked_in' WHERE id = '00000000-0000-4000-8000-0000000e0004';

-- Ibrahim Musa: apartment, checked_in
INSERT INTO guests (id, full_name, email, phone) VALUES ('00000000-0000-4000-8000-0000000d0005', 'Ibrahim Musa', 'ibrahim.musa@example.com', '+234 805 111 0005');
INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by, attention_reason, created_at)
VALUES ('00000000-0000-4000-8000-0000000e0005', 'VL-DEMO05', '00000000-0000-4000-8000-0000000f0005', '00000000-0000-4000-8000-0000000d0005', '00000000-0000-4000-8000-000000000004', (SELECT id FROM rooms WHERE room_number = '402'), date('now', '+1 hour', '-8 days'), date('now', '+1 hour', '+10 days'), 4,
  23000000, 414000000, 'pending_payment', 'whatsapp', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 hours'), '00000000-0000-4000-8000-0000000000a3', NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 days'));
INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, status, paid_at, verified_at, recorded_by, provider_channel)
VALUES ('00000000-0000-4000-8000-0000000c0005', '00000000-0000-4000-8000-0000000e0005', 207000000, 'offline', 'bank_transfer',
  NULL, 'successful', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-9 days'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '00000000-0000-4000-8000-0000000000a3', NULL);
UPDATE reservations SET status = 'confirmed' WHERE id = '00000000-0000-4000-8000-0000000e0005';
UPDATE reservations SET status = 'checked_in' WHERE id = '00000000-0000-4000-8000-0000000e0005';

-- Funmi Adebayo: deluxe, checked_in
INSERT INTO guests (id, full_name, email, phone) VALUES ('00000000-0000-4000-8000-0000000d0006', 'Funmi Adebayo', 'funmi.a@example.com', '+234 802 111 0006');
INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by, attention_reason, created_at)
VALUES ('00000000-0000-4000-8000-0000000e0006', 'VL-DEMO06', '00000000-0000-4000-8000-0000000f0006', '00000000-0000-4000-8000-0000000d0006', '00000000-0000-4000-8000-000000000002', (SELECT id FROM rooms WHERE room_number = '201'), date('now', '+1 hour', '-2 days'), date('now', '+1 hour', '+2 days'), 2,
  7500000, 30000000, 'pending_payment', 'website', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 hours'), NULL, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days'));
INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, status, paid_at, verified_at, recorded_by, provider_channel)
VALUES ('00000000-0000-4000-8000-0000000c0006', '00000000-0000-4000-8000-0000000e0006', 30000000, 'paystack', 'card',
  'demo-06-paid', 'successful', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, 'card');
UPDATE reservations SET status = 'confirmed' WHERE id = '00000000-0000-4000-8000-0000000e0006';
UPDATE reservations SET status = 'checked_in' WHERE id = '00000000-0000-4000-8000-0000000e0006';

-- Chioma Eze: standard, confirmed
INSERT INTO guests (id, full_name, email, phone) VALUES ('00000000-0000-4000-8000-0000000d0007', 'Chioma Eze', 'chioma.eze@example.com', '+234 808 111 0007');
INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by, attention_reason, created_at)
VALUES ('00000000-0000-4000-8000-0000000e0007', 'VL-DEMO07', '00000000-0000-4000-8000-0000000f0007', '00000000-0000-4000-8000-0000000d0007', '00000000-0000-4000-8000-000000000001', NULL, date('now', '+1 hour', '+2 days'), date('now', '+1 hour', '+4 days'), 2,
  5500000, 11000000, 'pending_payment', 'website', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 hours'), NULL, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'));
INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, status, paid_at, verified_at, recorded_by, provider_channel)
VALUES ('00000000-0000-4000-8000-0000000c0007', '00000000-0000-4000-8000-0000000e0007', 11000000, 'paystack', 'card',
  'demo-07-paid', 'successful', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-0 days'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, 'card');
UPDATE reservations SET status = 'confirmed' WHERE id = '00000000-0000-4000-8000-0000000e0007';

-- Emeka Nwosu: suite, confirmed
INSERT INTO guests (id, full_name, email, phone) VALUES ('00000000-0000-4000-8000-0000000d0008', 'Emeka Nwosu', 'emeka.nwosu@example.com', '+234 803 111 0008');
INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by, attention_reason, created_at)
VALUES ('00000000-0000-4000-8000-0000000e0008', 'VL-DEMO08', '00000000-0000-4000-8000-0000000f0008', '00000000-0000-4000-8000-0000000d0008', '00000000-0000-4000-8000-000000000003', NULL, date('now', '+1 hour', '+5 days'), date('now', '+1 hour', '+8 days'), 3,
  10800000, 32400000, 'pending_payment', 'website', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 hours'), NULL, 'Paid in full after the hold expired. Confirm a suite is still free.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'));
INSERT INTO payments (id, reservation_id, amount_kobo, provider, method, provider_reference, status, paid_at, verified_at, recorded_by, provider_channel)
VALUES ('00000000-0000-4000-8000-0000000c0008', '00000000-0000-4000-8000-0000000e0008', 32400000, 'paystack', 'card',
  'demo-08-paid', 'successful', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-0 days'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, 'card');
UPDATE reservations SET status = 'confirmed' WHERE id = '00000000-0000-4000-8000-0000000e0008';

-- Kelechi Obi: deluxe, pending
INSERT INTO guests (id, full_name, email, phone) VALUES ('00000000-0000-4000-8000-0000000d0009', 'Kelechi Obi', 'kelechi.obi@example.com', '+234 806 111 0009');
INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by, attention_reason, created_at)
VALUES ('00000000-0000-4000-8000-0000000e0009', 'VL-DEMO09', '00000000-0000-4000-8000-0000000f0009', '00000000-0000-4000-8000-0000000d0009', '00000000-0000-4000-8000-000000000002', NULL, date('now', '+1 hour', '+9 days'), date('now', '+1 hour', '+11 days'), 2,
  7500000, 15000000, 'pending_payment', 'website', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 hours'), NULL, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'));

-- Olumide Ajayi: standard, cancelled
INSERT INTO guests (id, full_name, email, phone) VALUES ('00000000-0000-4000-8000-0000000d0010', 'Olumide Ajayi', 'olumide.ajayi@example.com', '+234 809 111 0010');
INSERT INTO reservations (id, reference, public_token, guest_id, category_id, room_id, check_in, check_out, guest_count,
  nightly_rate_kobo, total_amount_kobo, status, source, hold_expires_at, created_by, attention_reason, created_at)
VALUES ('00000000-0000-4000-8000-0000000e0010', 'VL-DEMO10', '00000000-0000-4000-8000-0000000f0010', '00000000-0000-4000-8000-0000000d0010', '00000000-0000-4000-8000-000000000001', NULL, date('now', '+1 hour', '+1 days'), date('now', '+1 hour', '+3 days'), 1,
  5500000, 11000000, 'pending_payment', 'phone', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 hours'), '00000000-0000-4000-8000-0000000000a3', NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'));
UPDATE reservations SET status = 'confirmed' WHERE id = '00000000-0000-4000-8000-0000000e0010';
UPDATE _ctx SET reason = 'Guest changed travel plans' WHERE id = 1;
UPDATE reservations SET status = 'cancelled', cancellation_reason = 'Guest changed travel plans' WHERE id = '00000000-0000-4000-8000-0000000e0010';
UPDATE _ctx SET reason = NULL WHERE id = 1;

-- A few rooms in other states for the room board.
UPDATE rooms SET readiness = 'needs_cleaning' WHERE room_number IN ('103', '205');
UPDATE rooms SET readiness = 'cleaning_in_progress' WHERE room_number = '108';
UPDATE rooms SET service_status = 'maintenance', maintenance_note = 'Air conditioning repair' WHERE room_number = '303';

-- Something for the room-type pages.
UPDATE room_categories SET
  short_description = '[Sample] Comfortable, well-appointed rooms for a restful stay.',
  description = '[Sample description — replace with the hotel''s own words.] A calm, comfortable room with everything you need for a good night''s rest.',
  amenities = '["[Sample] Double bed", "Free Wi-Fi", "24/7 power", "Air conditioning"]'
WHERE slug = 'standard';

DELETE FROM _ctx;

-- Demo bookings are not real: never email their (invented) guests.
UPDATE email_outbox SET status = 'skipped', last_error = 'demo data' WHERE status = 'pending';
