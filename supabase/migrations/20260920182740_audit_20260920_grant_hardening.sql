-- Audit 2026-09-20 (issue #558) P2-1: grant-sweep durability.
--
-- The sec1 grant sweep (20260905141623, extended by 20260907093802) closed
-- direct EXECUTE on trigger helpers with an explicit list, and
-- 20260907200109 only made the anon/PUBLIC side durable. The per-schema
-- default privileges still grant EXECUTE to authenticated/service_role on
-- every new function in public, so three trigger helpers merged 2026-09-09
-- shipped without the house revoke. Verified live: exactly these three have
-- authenticated/service_role EXECUTE.
--
-- Trigger functions are wired via CREATE TRIGGER only and must never be
-- directly callable by an API role.

REVOKE ALL ON FUNCTION public.enforce_abuse_report_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_abuse_report_immutable_report_target()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_email_opt_in_change()
  FROM PUBLIC, anon, authenticated, service_role;

-- Audit 2026-09-20 (issue #558) P2-3: get_unread_totals retains authenticated
-- EXECUTE and takes arbitrary user ids — the batch sibling of the
-- cross-user metadata read fixed in sec-20260907#1. Its only legitimate
-- caller is the push edge function (service_role), so authenticated should
-- never have had it. Same REVOKE/GRANT shape as get_admin_unread_totals in
-- the sibling migration.

REVOKE ALL ON FUNCTION public.get_unread_totals(UUID[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unread_totals(UUID[]) TO service_role;
