-- Issue #407 [P1]: PUSH_INTERNAL_SECRET readable by anon/authenticated via
-- push_notification_config_value(text). The 20260814120000 migration revoked
-- EXECUTE only FROM PUBLIC, but Supabase default privileges still grant
-- EXECUTE to anon/authenticated explicitly (see issue_335 hardening note).
-- Closing the PostgREST RPC path: the shared push secret must not be callable
-- by any API role. Trigger functions run with owner privileges and are
-- unaffected.

REVOKE ALL ON FUNCTION public.push_notification_config_value(text)
  FROM PUBLIC, anon, authenticated, service_role;
