-- Delivery observability and retry for push notifications (#191).
--
-- Two new tables make push delivery queryable end to end:
--   * push_delivery_log    -- one row per outcome, written by the edge
--     function: invocation (function started), sent, transient (retries
--     exhausted), invalid (subscription gone, HTTP 404/410), failed (other
--     provider error). Never contains message content or push credentials.
--   * push_invocation_log  -- one row per trigger dispatch, capturing the
--     pg_net request id so Edge Function invocations that failed at the HTTP
--     layer (non-2xx response, timeout, transport error) can be correlated and
--     re-queued with retry_failed_push_invocations().

create table if not exists public.push_delivery_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  event_kind text not null,
  user_id uuid,
  subscription_id uuid,
  status text not null
    check (status in ('invocation', 'sent', 'transient', 'invalid', 'failed')),
  error_category text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists push_delivery_log_event_id_idx
  on public.push_delivery_log (event_id);
create index if not exists push_delivery_log_created_at_idx
  on public.push_delivery_log (created_at desc);

alter table public.push_delivery_log enable row level security;
-- No policies: anon and authenticated roles see nothing. The edge function
-- writes via service_role and admins query via the SQL editor / service role.

create table if not exists public.push_invocation_log (
  id bigserial primary key,
  request_id bigint not null,
  event_kind text not null,
  entity_id uuid not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists push_invocation_log_request_id_idx
  on public.push_invocation_log (request_id);
create index if not exists push_invocation_log_created_at_idx
  on public.push_invocation_log (created_at desc);

alter table public.push_invocation_log enable row level security;

-- Admin helper: re-queues trigger dispatches whose Edge Function invocation
-- failed at the HTTP layer (non-2xx response, timeout, or transport error),
-- reading the response pg_net recorded. Returns the number re-queued; the
-- triggers record the new requests in push_invocation_log. Call from the SQL
-- editor:  select public.retry_failed_push_invocations();
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

-- Updated triggers: capture the pg_net request id so each dispatch can be
-- correlated (and re-queued) from push_invocation_log.
create or replace function public.handle_new_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := public.push_notification_config_value('PUSH_FUNCTION_URL');
  v_secret text := public.push_notification_config_value('PUSH_INTERNAL_SECRET');
  v_request_id bigint;
begin
  if v_url is null or v_secret is null then
    raise notice 'push_notification_config not set; skipping push for message %', new.id;
    return new;
  end if;

  select net.http_post(
    url := v_url,
    body := jsonb_build_object('table', 'messages', 'message_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 15000
  ) into v_request_id;

  insert into public.push_invocation_log (request_id, event_kind, entity_id)
  values (v_request_id, 'messages', new.id);

  return new;
end;
$$;

create or replace function public.handle_active_player_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := public.push_notification_config_value('PUSH_FUNCTION_URL');
  v_secret text := public.push_notification_config_value('PUSH_INTERNAL_SECRET');
  v_request_id bigint;
begin
  if v_url is null or v_secret is null then
    raise notice 'push_notification_config not set; skipping turn push for member %', new.id;
    return new;
  end if;

  select net.http_post(
    url := v_url,
    body := jsonb_build_object('table', 'channel_members', 'member_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 15000
  ) into v_request_id;

  insert into public.push_invocation_log (request_id, event_kind, entity_id)
  values (v_request_id, 'channel_members', new.id);

  return new;
end;
$$;
