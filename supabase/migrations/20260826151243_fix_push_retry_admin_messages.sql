-- Issue #302: admin-message push retries were re-queued to the `messages`
-- table. retry_failed_push_invocations() only branched on channel_members and
-- fell through to `messages` for everything else, but the admin_messages
-- trigger logs event_kind = 'admin_message'. Those retries posted the admin
-- message id to buildMessageEvent (which reads `messages`), so they 404'd and
-- were never delivered. Route admin_message retries to `admin_messages`.

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
  v_count int := 0;
begin
  if v_url is null or v_secret is null then
    raise notice 'push_notification_config not set; cannot retry';
    return 0;
  end if;

  for r in
    select i.event_kind, i.entity_id
    from public.push_invocation_log i
    join net._http_response resp on resp.id = i.request_id
    where (resp.status_code is null or resp.status_code >= 400)
      and i.created_at > now() - interval '7 days'
    order by i.created_at desc
    limit greatest(p_max, 0)
  loop
    if r.event_kind = 'channel_members' then
      perform net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'channel_members', 'member_id', r.entity_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 15000
      );
    elseif r.event_kind = 'admin_message' then
      perform net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'admin_messages', 'message_id', r.entity_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 15000
      );
    else
      perform net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'messages', 'message_id', r.entity_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 15000
      );
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.retry_failed_push_invocations(integer) from public;
