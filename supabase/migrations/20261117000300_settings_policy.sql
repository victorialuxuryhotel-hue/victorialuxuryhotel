-- Cancellation policy wording is configurable: the hotel has not yet confirmed
-- what applies between 24 and 48 hours before arrival. Shown to guests before
-- payment; null means "not yet set" and the site says so rather than guessing.
alter table public.hotel_settings
  add column cancellation_policy text check (length(cancellation_policy) <= 2000);

-- Settings changes are configuration changes: audit them.
create or replace function public.hotel_settings_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_activity('settings.updated', 'hotel_settings', null, 'Booking rules updated',
    jsonb_build_object(
      'check_in_time', new.check_in_time, 'check_out_time', new.check_out_time,
      'website_hold_minutes', new.website_hold_minutes, 'staff_hold_hours', new.staff_hold_hours,
      'cancellation_policy_changed', new.cancellation_policy is distinct from old.cancellation_policy));
  return null;
end $$;
create trigger hotel_settings_audit after update on public.hotel_settings
  for each row execute function public.hotel_settings_audit();
