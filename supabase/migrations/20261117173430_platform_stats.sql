-- #808: platform activity numbers on the public directory and Discover.
--
-- The public /directory page is the first screen a prospective player sees, and
-- until now it could only show its recruiting slice. This migration adds the
-- platform-wide totals behind one role-agnostic function so the anonymous page
-- and the signed-in Discover tab can never disagree.
--
-- Shape:
--
--   pg_cron (hourly) --> platform_stats (one cached row)
--                              |
--                              v
--                    get_platform_stats()  -- SECURITY DEFINER, STABLE
--                      EXECUTE: anon, authenticated, service_role
--
-- The cache matters: anonymous traffic must never trigger COUNT(DISTINCT ...)
-- over messages. The numbers are derived from real data every hour, never
-- hand-maintained, so "live" still means "not a constant".

-- ==========================================
-- 1. The cache (one row, no API read path)
-- ==========================================

CREATE TABLE public.platform_stats (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  games BIGINT NOT NULL DEFAULT 0,
  messages BIGINT NOT NULL DEFAULT 0,
  members BIGINT NOT NULL DEFAULT 0,
  active_games BIGINT NOT NULL DEFAULT 0,
  recruiting_games BIGINT NOT NULL DEFAULT 0,
  new_games_week BIGINT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS with no policies: reachable, readable by nobody through the Data API.
-- Only get_platform_stats() (SECURITY DEFINER, owned by postgres) reads it.
-- Do not add a policy and do not grant anon: the anonymous surface is the
-- function's six scalars, not this table.
ALTER TABLE public.platform_stats ENABLE ROW LEVEL SECURITY;

-- authenticated SELECT is required by
-- 20261021091717_public_table_grant_coverage.sql invariant 5; RLS is what keeps
-- the rows out of reach. anon gets nothing, so the anon-readable list is
-- unchanged.
REVOKE ALL ON public.platform_stats FROM PUBLIC, anon;
GRANT SELECT ON public.platform_stats TO authenticated, service_role;

-- ==========================================
-- 2. The refresh (owner-only; cron calls it)
-- ==========================================

-- Definitions (keep in sync with the usage-report skill and docs/SCHEMA.md):
--   Game             non-archived channels row, private or listed.
--   Recruiting game  non-archived channel with join_mode = 'approval'.
--   Active game      non-archived channel with >= 2 distinct human senders AND
--                    >= 15 non-system human messages, both within 14 days.
--   Member           account with at least one channel_members row. Counted
--                    without joining channels: a member row means "currently in
--                    a game", and archived games still hold members.
--   Messages sent    non-system messages with a sender, all time. Soft-deleted
--                    rows count: they were activity when posted.
--
-- No messages(created_at) index: this runs once an hour off the request path,
-- so a scan is cheaper than the write cost of an index nothing else uses.
CREATE OR REPLACE FUNCTION public.refresh_platform_stats()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.platform_stats AS s (
    id, games, messages, members, active_games, recruiting_games,
    new_games_week, computed_at
  )
  SELECT
    1,
    (SELECT COUNT(*) FROM channels c WHERE NOT c.is_archived),
    (SELECT COUNT(*) FROM messages m
      WHERE m.sender_id IS NOT NULL AND m.type <> 'system'),
    (SELECT COUNT(DISTINCT cm.user_id) FROM channel_members cm),
    (SELECT COUNT(*)
       FROM (
         SELECT m.channel_id
         FROM messages m
         WHERE m.sender_id IS NOT NULL
           AND m.type <> 'system'
           AND m.created_at >= now() - interval '14 days'
         GROUP BY m.channel_id
         HAVING COUNT(DISTINCT m.sender_id) >= 2
            AND COUNT(*) >= 15
       ) active
       JOIN channels c ON c.id = active.channel_id AND NOT c.is_archived),
    (SELECT COUNT(*) FROM channels c
      WHERE NOT c.is_archived AND c.join_mode = 'approval'),
    (SELECT COUNT(*) FROM channels c
      WHERE NOT c.is_archived AND c.created_at >= now() - interval '7 days'),
    now()
  ON CONFLICT (id) DO UPDATE SET
    games = EXCLUDED.games,
    messages = EXCLUDED.messages,
    members = EXCLUDED.members,
    active_games = EXCLUDED.active_games,
    recruiting_games = EXCLUDED.recruiting_games,
    new_games_week = EXCLUDED.new_games_week,
    computed_at = EXCLUDED.computed_at;
$$;

-- Owner-only, including service_role (matching retry_failed_push_invocations).
-- A callable refresh is a free DoS lever for anyone who can reach the API.
REVOKE ALL ON FUNCTION public.refresh_platform_stats()
  FROM PUBLIC, anon, authenticated, service_role;

-- ==========================================
-- 3. The public projection
-- ==========================================

-- The third reviewed exception to "anon holds zero function EXECUTE"
-- (20260905141623_sec1_grant_sweep.sql): platform totals only. No ids, no
-- names, no per-game figures, no member identities. Allowlisted by name in the
-- sweep test and pinned by its own projection assertion.
--
-- Role-agnostic: same answer for anon, authenticated and service_role, so the
-- public band and the Discover band cannot drift. COALESCE keeps the contract
-- at "one row of six numbers" even if the cache row is missing.
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS TABLE (
  games BIGINT,
  messages BIGINT,
  members BIGINT,
  active_games BIGINT,
  recruiting_games BIGINT,
  new_games_week BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(s.games, 0),
    COALESCE(s.messages, 0),
    COALESCE(s.members, 0),
    COALESCE(s.active_games, 0),
    COALESCE(s.recruiting_games, 0),
    COALESCE(s.new_games_week, 0)
  FROM (SELECT 1 AS id) one
  LEFT JOIN public.platform_stats s ON s.id = one.id;
$$;

REVOKE ALL ON FUNCTION public.get_platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_stats()
  TO anon, authenticated, service_role;

-- ==========================================
-- 4. Hourly refresh
-- ==========================================

-- Seed first: the band must show real numbers from the first request after the
-- deploy, not zeros until the first tick.
SELECT public.refresh_platform_stats();

-- pg_cron is already installed (20261010115743_push_retry_idempotency.sql).
-- Idempotent on re-run (cron.schedule upserts by name in pg_cron >= 1.4).
-- Minute 7: the push-retry job already owns */30.
SELECT cron.schedule(
  'refresh-platform-stats',
  '7 * * * *',
  $$SELECT public.refresh_platform_stats()$$
);
