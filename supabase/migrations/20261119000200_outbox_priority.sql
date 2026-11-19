-- Let the sender claim a specific reservation's emails first, so the email a
-- guest is waiting for is never stuck behind a backlog of older ones.
drop function public.claim_outbox(integer, uuid[]);
create function public.claim_outbox(p_limit integer default 20, p_only uuid[] default null, p_reservation uuid default null)
returns setof public.email_outbox
language sql security definer set search_path = '' as $$
  update public.email_outbox o set
    attempts = o.attempts + 1,
    next_attempt_at = now() + make_interval(mins => least(60, 2 ^ o.attempts)::int)
  where o.id in (
    select id from public.email_outbox
    where status = 'pending' and next_attempt_at <= now()
      and (p_only is null or id = any (p_only))
      and (p_reservation is null or reservation_id = p_reservation)
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning o.*
$$;
revoke execute on function public.claim_outbox(integer, uuid[], uuid) from public, anon, authenticated;
