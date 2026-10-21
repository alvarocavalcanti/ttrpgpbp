-- Data API grant coverage guard (runs on every PR via `supabase test db`).
--
-- Supabase's 2026-10-30 rollout stops granting table privileges to the Data
-- API roles through the postgres role's default privileges
-- (20261021091717_mirror_data_api_grant_revoke applies the same revoke
-- locally). From now on a table created in public without explicit GRANTs is
-- invisible to supabase-js / PostgREST, so every table-creating migration must
-- grant explicitly. This file fails the PR that forgets.
--
-- Five invariants:
--   1. No orphan relation: every public table/view has at least one DML
--      privilege for anon, authenticated or service_role. A relation with no
--      grants at all is the exact break the rollout causes, and it is
--      invisible until a client queries it.
--   2. The anon-readable surface is pinned to a reviewed list. A new table
--      must not become anonymously readable by accident; adding a name here
--      is a deliberate exposure decision and shows up in the diff.
--   3. The anon-writable surface is pinned separately, so a new table cannot
--      pick up anonymous INSERT/UPDATE/DELETE either. Read and write are
--      listed apart because they differ today: profiles is writable by anon
--      but not readable, and app_error_log is neither.
--   4. Every public table has RLS enabled. Grants decide whether a table is
--      reachable; RLS decides which rows a role sees. A table with grants but
--      no RLS would hand the rows to anyone who can reach it.
--   5. Every non-internal relation is readable by authenticated, so a table
--      granted to service_role only, by accident, fails here.
--
-- The lists below are the historical default-privilege surface: those
-- relations were created while Supabase still auto-granted anon DML. The
-- grants are real today (RLS still governs which rows each role sees) and
-- shrinking them is separate hardening work, not part of this change. The
-- lists exist to keep the surface from growing, not to endorse it.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(5);

-- 1. No public relation without a single Data API grant.
SELECT is(
  (SELECT count(*)
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p', 'v', 'm')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
     AND NOT (has_table_privilege('anon', c.oid, 'SELECT')
           OR has_table_privilege('anon', c.oid, 'INSERT')
           OR has_table_privilege('anon', c.oid, 'UPDATE')
           OR has_table_privilege('anon', c.oid, 'DELETE')
           OR has_table_privilege('authenticated', c.oid, 'SELECT')
           OR has_table_privilege('authenticated', c.oid, 'INSERT')
           OR has_table_privilege('authenticated', c.oid, 'UPDATE')
           OR has_table_privilege('authenticated', c.oid, 'DELETE')
           OR has_table_privilege('service_role', c.oid, 'SELECT')
           OR has_table_privilege('service_role', c.oid, 'INSERT')
           OR has_table_privilege('service_role', c.oid, 'UPDATE')
           OR has_table_privilege('service_role', c.oid, 'DELETE'))),
  0::bigint,
  'no public relation is left without a Data API grant'
);

-- 2. The anon-readable surface matches the reviewed list.
WITH expected(relname) AS (
  VALUES ('abuse_reports'),
         ('admin_messages'),
         ('admin_thread_reads'),
         ('admin_threads'),
         ('app_settings'),
         ('audit_logs'),
         ('channel_join_failures'),
         ('channel_join_requests'),
         ('channel_members'),
         ('channel_npcs'),
         ('channel_safety_tools'),
         ('channel_secrets'),
         ('channels'),
         ('dice_roll_favorites'),
         ('dice_rolls'),
         ('image_cleanup_audit'),
         ('message_favorites'),
         ('message_reactions'),
         ('messages'),
         ('notification_preferences'),
         ('push_client_log'),
         ('push_delivery_log'),
         ('push_invocation_log'),
         ('push_notification_config'),
         ('push_subscriptions'),
         ('safety_card_events'),
         ('sub_channel_members'),
         ('sub_channel_reads'),
         ('sub_channels')
)
SELECT is(
  (SELECT coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '')
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p', 'v', 'm')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
     AND has_table_privilege('anon', c.oid, 'SELECT')),
  (SELECT coalesce(string_agg(relname, ',' ORDER BY relname), '') FROM expected),
  'the anon-readable public surface matches the reviewed list'
);

-- 3. The anon-writable surface matches the reviewed list, so a new table
--    cannot pick up anonymous INSERT/UPDATE/DELETE unnoticed.
WITH expected(relname) AS (
  VALUES ('abuse_reports'),
         ('admin_messages'),
         ('admin_thread_reads'),
         ('admin_threads'),
         ('app_settings'),
         ('audit_logs'),
         ('channel_join_failures'),
         ('channel_join_requests'),
         ('channel_members'),
         ('channel_npcs'),
         ('channel_safety_tools'),
         ('channel_secrets'),
         ('channels'),
         ('dice_roll_favorites'),
         ('dice_rolls'),
         ('image_cleanup_audit'),
         ('message_favorites'),
         ('message_reactions'),
         ('messages'),
         ('notification_preferences'),
         ('profiles'),
         ('push_client_log'),
         ('push_delivery_log'),
         ('push_invocation_log'),
         ('push_notification_config'),
         ('push_subscriptions'),
         ('safety_card_events'),
         ('sub_channel_members'),
         ('sub_channel_reads'),
         ('sub_channels')
)
SELECT is(
  (SELECT coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '')
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p', 'v', 'm')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
     AND (has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE')
       OR has_table_privilege('anon', c.oid, 'DELETE'))),
  (SELECT coalesce(string_agg(relname, ',' ORDER BY relname), '') FROM expected),
  'the anon-writable public surface matches the reviewed list'
);

-- 4. Every public table has RLS enabled. Views are excluded: they carry
--    their own access rules through security_invoker and their underlying
--    tables.
WITH rls_disabled(relname) AS (
  SELECT ''::text WHERE false
)
SELECT is(
  (SELECT count(*)
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
     AND NOT c.relrowsecurity
     AND c.relname NOT IN (SELECT relname FROM rls_disabled)),
  0::bigint,
  'every public table has row level security enabled'
);

-- 5. Every non-internal relation is readable by authenticated, so a table
--    granted to service_role only, by accident, fails here.
WITH internal(relname) AS (
  SELECT ''::text WHERE false
)
SELECT is(
  (SELECT count(*)
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p', 'v', 'm')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
     AND c.relname NOT IN (SELECT relname FROM internal)
     AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')),
  0::bigint,
  'every non-internal public relation grants authenticated SELECT'
);

SELECT * FROM finish();
ROLLBACK;
