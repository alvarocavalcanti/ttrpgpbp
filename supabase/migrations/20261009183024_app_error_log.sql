-- Durable, queryable client-error log (issue #689).
--
-- Supabase free-tier logs (Postgres / PostgREST / Auth) are retained ~1 day
-- with no drains, and console.error output is lost. This table keeps app errors
-- long enough to debug them.
--
-- Writes go only through public.report_app_error(): no direct INSERT grant, and
-- the function clamps every field so a hostile or buggy client cannot bloat the
-- table. Reads are server-admin only. Nothing user-authored (message content,
-- channel text) is stored, and the client sends a pathname, never a query
-- string.
create table public.app_error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete set null,
  route text,
  message text not null,
  detail jsonb,
  user_agent text,
  app_version text
);

create index app_error_log_created_at_idx on public.app_error_log (created_at desc);
create index app_error_log_user_id_idx on public.app_error_log (user_id);

alter table public.app_error_log enable row level security;

create policy "Server admins can read app error log"
  on public.app_error_log for select
  using (is_server_admin());

revoke all on public.app_error_log from anon;
-- Writes go only through report_app_error() (SECURITY DEFINER).
revoke insert, update, delete on public.app_error_log from authenticated;
grant select on public.app_error_log to authenticated;

-- ponytail: no retention job. Errors are exceptional and every field is
-- clamped, so growth is slow; add a scheduled prune only if it ever matters.
-- Manual: delete from public.app_error_log where created_at < now() - interval '90 days';

create or replace function public.report_app_error(
  p_message text,
  p_route text default null,
  p_detail jsonb default null,
  p_user_agent text default null,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.app_error_log (user_id, route, message, detail, user_agent, app_version)
  values (
    auth.uid(),
    -- Pathname only: drop any query string defensively, even though the client
    -- already sends one, so search terms can never reach the table.
    left(split_part(p_route, '?', 1), 200),
    left(coalesce(p_message, ''), 500),
    case
      when p_detail is null or jsonb_typeof(p_detail) <> 'object' then null
      when length(p_detail::text) > 2000 then jsonb_build_object('truncated', true)
      else p_detail
    end,
    left(p_user_agent, 300),
    left(p_app_version, 50)
  );
end;
$$;

revoke all on function public.report_app_error(text, text, jsonb, text, text) from public, anon;
grant execute on function public.report_app_error(text, text, jsonb, text, text) to authenticated;
