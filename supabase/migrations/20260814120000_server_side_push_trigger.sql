-- Move push notification triggering from the sender's browser to a Postgres
-- trigger. Previously the sender's client called the push-notifications edge
-- function after inserting a message (fire-and-forget); any sender-side
-- failure — closed tab, dropped network, expired session — meant no push at
-- all. Now a trigger fires the edge function the moment the row lands,
-- independent of the sender's client.
--
-- The trigger needs two runtime values it can't know at migration time: the
-- edge function URL and the shared secret that authenticates trigger-originated
-- calls. Both live in `push_notification_config`, seeded empty here and
-- populated on the hosted project once (see DEPLOYMENT.md):
--
--   insert into push_notification_config (key, value) values
--     ('PUSH_FUNCTION_URL', 'https://<project-ref>.supabase.co/functions/v1/push-notifications'),
--     ('PUSH_INTERNAL_SECRET', '<long-random-string>');
--
-- Until then the triggers skip with a NOTICE (no push, message send unaffected).

-- pg_net lets triggers issue asynchronous HTTP calls without blocking the
-- transaction.
create extension if not exists pg_net;

-- Runtime config for the DB->function call. RLS on with no policies: anon and
-- authenticated roles see zero rows; only service_role and the security-definer
-- helper below can read it.
create table if not exists public.push_notification_config (
  key   text primary key,
  value text not null
);

alter table public.push_notification_config enable row level security;

-- Definer helper so the trigger functions can read the config. Functions are
-- EXECUTE-granted to PUBLIC by default, which would leak the secret via
-- PostgREST RPC; revoke so only the owner (and definer trigger functions) can
-- call it.
create or replace function public.push_notification_config_value(p_key text)
returns text
language sql
security definer
set search_path = public
as $$
  select value from public.push_notification_config where key = p_key
$$;

revoke execute on function public.push_notification_config_value(text) from public;

-- Replaces the original no-op stub: fires push for every new message.
create or replace function public.handle_new_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text := public.push_notification_config_value('PUSH_FUNCTION_URL');
  v_secret text := public.push_notification_config_value('PUSH_INTERNAL_SECRET');
begin
  if v_url is null or v_secret is null then
    raise notice 'push_notification_config not set; skipping push for message %', new.id;
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('table', 'messages', 'message_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 15000
  );
  return new;
end;
$$;

drop trigger if exists on_message_inserted_push_notification on public.messages;
create trigger on_message_inserted_push_notification
after insert on public.messages
for each row
execute function public.handle_new_message_notification();

-- Turn pushes: fires when the GM marks a player active (is_active_player flips
-- false -> true). The WHEN clause keeps deactivations and unrelated updates
-- from triggering anything.
create or replace function public.handle_active_player_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text := public.push_notification_config_value('PUSH_FUNCTION_URL');
  v_secret text := public.push_notification_config_value('PUSH_INTERNAL_SECRET');
begin
  if v_url is null or v_secret is null then
    raise notice 'push_notification_config not set; skipping turn push for member %', new.id;
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('table', 'channel_members', 'member_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 15000
  );
  return new;
end;
$$;

drop trigger if exists on_active_player_notification on public.channel_members;
create trigger on_active_player_notification
after update on public.channel_members
for each row
when (old.is_active_player is distinct from new.is_active_player and new.is_active_player = true)
execute function public.handle_active_player_notification();
