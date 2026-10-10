-- Client-side push observability: today the server knows a push was accepted
-- by the push service (push_delivery_log.status = 'sent') but is blind past
-- that point — whether the device received it, whether the service worker
-- parsed the payload, and whether the OS displayed it. This adds the missing
-- leg so "notifications are unreliable" becomes a per-device trail instead of
-- a guess.

-- Per-device acknowledgement token. It travels inside that device's push
-- payload and gates the unauthenticated push-receipt endpoint: only a device
-- that actually received a push can report an outcome for it. Not a secret
-- credential (it grants no read access), just an unguessable per-row handle.
alter table public.push_subscriptions
  add column if not exists ack_token uuid not null default gen_random_uuid();

-- One row per client-side milestone. No message content, no endpoints, no push
-- keys — only ids, a status, and the reporting user agent (for the platform
-- split: Apple vs FCM vs Mozilla).
create table if not exists public.push_client_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  subscription_id uuid,
  -- Cascades from profiles so account erasure removes this telemetry with the
  -- rest of the user's data (subscription_id is intentionally not a FK: the
  -- log should outlive the subscription row it describes).
  user_id uuid references public.profiles(id) on delete cascade,
  event_kind text,
  status text not null check (status in (
    'received',
    'invalid_payload',
    'shown',
    'show_error',
    'clicked',
    'subscribed',
    'unsubscribed',
    'reconcile_ok',
    'reconcile_error'
  )),
  detail text,
  user_agent text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists push_client_log_event_id_idx
  on public.push_client_log (event_id);
create index if not exists push_client_log_subscription_id_idx
  on public.push_client_log (subscription_id);
create index if not exists push_client_log_created_at_idx
  on public.push_client_log (created_at desc);

alter table public.push_client_log enable row level security;

-- The authenticated page path writes/reads its own rows. The service worker
-- path goes through the push-receipt edge function with the service role,
-- which bypasses RLS after validating the subscription's ack_token.
create policy "Users insert own push client logs"
  on public.push_client_log for insert
  with check (auth.uid() = user_id);

create policy "Users read own push client logs"
  on public.push_client_log for select
  using (auth.uid() = user_id);
