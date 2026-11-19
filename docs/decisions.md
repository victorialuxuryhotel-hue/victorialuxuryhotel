# Decisions

Business decisions that shape behaviour. Date: 17 Nov 2026 unless noted.

| Decision | Source | Where it lives |
| --- | --- | --- |
| Room split across categories and nightly rates are **configurable**; current figures are test data only | Client (awaiting hotel) | `room_categories`, `rooms`; `supabase/seed.sql` is local only |
| Cancellation policy wording is **configurable** until the hotel clarifies the 24–48 h window | Client | `hotel_settings.cancellation_policy` (empty = not shown as a promise) |
| Unpaid website bookings hold inventory for **30 minutes** (configurable) | Default | `hotel_settings.website_hold_minutes` |
| Unpaid direct bookings (phone, WhatsApp) hold for **24 hours** (configurable) | Client | `hotel_settings.staff_hold_hours` |
| Only owner / general manager may **override the payment requirement** or extend a hold; a reason is required and recorded | Client | `payments.override` permission; activity log |
| Offline payments require staff to **confirm receipt**; screenshots are not proof | Brief | Offline payment form + database function |
| **Room inventory is internal**: the public site never shows room counts or "rooms left" | Client | `AvailabilityOption` carries only `isAvailable` |
| Out of scope for now: guest accounts, SMS, promo codes, add-on services, online self-cancellation | Client | Not built |
| One reservation = one room; a guest booking two rooms makes two reservations | Default | Reservation model |
| Maintenance is a current room status, not a dated block | Default (brief) | `rooms.service_status` |
| Minimum staff password length **10** | Default | `supabase/config.toml`, password form |
