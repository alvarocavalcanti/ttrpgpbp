-- Push invocation retries were manual and could double-send: every call
-- re-queued every failed invocation in the 7-day window, with no record that
-- it had already been retried. Two changes make an automatic retry safe:
--
--   1. push_invocation_log gains retried_at; a retried invocation is skipped
--      next time. Each retry is written back as a fresh invocation row so its
--      own outcome is tracked and can itself be retried — bounded by `attempt`
--      so a permanently failing event (deleted message, bad config) stops
--      instead of looping forever every 30 minutes.
--   2. retry_failed_push_invocations filters on a PRESENT failed pg_net
--      response: >= 400, timed out, or a recorded NULL status (a transport/DNS
--      failure pg_net surfaces without an HTTP code). pg_net prunes old
--      responses, so the inner join already excludes pruned ones.
--
-- Scheduling is pg_cron (platform-native, no external scheduler and no stored
-- database credentials). It runs as the extension owner, so the revoked
-- EXECUTE grants below do not block it.

alter table public.push_invocation_log
  add column if not exists retried_at timestamp with time zone;

alter table public.push_invocation_log
  add column if not exists attempt integer not null default 0;

create or replace function public.retry_failed_push_invocations(p_max int default 50)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := public.push_notification_config_value('PUSH_FUNCTION_URL');
  v_secret text := public.push_notification_config_value('PUSH_INTERNAL_SECRET');
  r record;
  v_request_id bigint;
  v_count int := 0;
begin
  if v_url is null or v_secret is null then
    raise notice 'push_notification_config not set; cannot retry';
    return 0;
  end if;

  for r in
    select i.id, i.event_kind, i.entity_id, i.attempt
    from public.push_invocation_log i
    join net._http_response resp on resp.id = i.request_id
    where i.retried_at is null
      and i.attempt < 5
      and (resp.status_code is null or resp.status_code >= 400 or resp.timed_out)
      and i.created_at > now() - interval '7 days'
    order by i.created_at desc
    limit greatest(p_max, 0)
  loop
    if r.event_kind = 'channel_members' then
      select net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'channel_members', 'member_id', r.entity_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 15000
      ) into v_request_id;
    elseif r.event_kind = 'admin_message' then
      select net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'admin_messages', 'message_id', r.entity_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 15000
      ) into v_request_id;
    else
      select net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'messages', 'message_id', r.entity_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 15000
      ) into v_request_id;
    end if;

    insert into public.push_invocation_log (request_id, event_kind, entity_id, attempt)
    values (v_request_id, r.event_kind, r.entity_id, r.attempt + 1);

    update public.push_invocation_log
      set retried_at = now()
      where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.retry_failed_push_invocations(integer)
  from public, anon, authenticated, service_role;

create extension if not exists pg_cron;

-- Idempotent on re-run (cron.schedule upserts by name in pg_cron >= 1.4).
select cron.schedule(
  'retry-failed-push-invocations',
  '*/30 * * * *',
  $$select public.retry_failed_push_invocations()$$
);
