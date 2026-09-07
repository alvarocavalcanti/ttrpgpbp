-- Issue #429 review follow-up: the URL-scheme trigger functions must run as
-- SECURITY DEFINER. Their bodies call the owner-only helper url_scheme_allowed
-- (revoked from authenticated), so an invoker-rights body breaks every direct
-- client write guarded by these triggers with "permission denied" — the exact
-- regression the pgTAP suite cannot see (tests run as superuser, which bypasses
-- EXECUTE checks). Assert the definer flag directly.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(3);

SELECT is(
  (SELECT prosecdef FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enforce_url_scheme'),
  true,
  'enforce_url_scheme runs as SECURITY DEFINER'
);

SELECT is(
  (SELECT prosecdef FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enforce_member_url_scheme'),
  true,
  'enforce_member_url_scheme runs as SECURITY DEFINER'
);

SELECT is(
  (SELECT prosecdef FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enforce_npc_url_scheme'),
  true,
  'enforce_npc_url_scheme runs as SECURITY DEFINER'
);

SELECT * FROM finish();
ROLLBACK;
