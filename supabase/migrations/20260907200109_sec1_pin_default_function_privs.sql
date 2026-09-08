-- Issue #450: the sec1 grant sweep (20260905141623) only strips anon EXECUTE
-- from functions that exist at sweep time. On long-lived local stacks the
-- postgres default privileges in schema public grant EXECUTE to anon on every
-- future function (visible in pg_default_acl); resolve_safety_card_events
-- (20260907133713) inherited that grant on drifted stacks, so
-- supabase/tests/20260905141623_sec1_grant_sweep.sql failed its invariant
-- "anon has EXECUTE on no user-defined function in public" (have: 1).
-- Fresh CI clusters never see it — their default privileges differ.
--
-- Two-part pin:
--   1. Strip the inherited anon grant on the drifted function (same pattern
--      as 20260907132031 for mark_channel_read).
--   2. Pin default privileges so no future function inherits the grants —
--      the sweep's baseline becomes forward-idempotent instead of
--      per-migration whack-a-mole:
--        * Per-schema (public): revoke anon, keeping the entry's
--          authenticated/service_role EXECUTE so client RPCs keep their
--          default access and server-only helpers stay pinned by the
--          explicit per-function revokes.
--        * Global: revoke PUBLIC and anon. The global entry is what
--          suppresses Postgres's built-in PUBLIC EXECUTE on future
--          functions (verified on PG 17.6.1: a function created with only
--          the per-schema entry still gets `=X` in proacl; with the global
--          entry the new function's proacl is exactly
--          {postgres=X, authenticated=X, service_role=X}). Scope: functions
--          only — tables/sequences are untouched. Any future
--          postgres-created function outside public (e.g. from a
--          CREATE EXTENSION in a migration) that needs EXECUTE for other
--          roles must grant it explicitly.

REVOKE EXECUTE ON FUNCTION public.resolve_safety_card_events(UUID) FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
