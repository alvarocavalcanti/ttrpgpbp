-- Issue #402 / SEC-1: class fix for the "REVOKE … FROM PUBLIC is not enough"
-- pattern. Supabase's default privileges grant EXECUTE on every new function
-- to anon/authenticated/service_role explicitly, so every bare
-- `REVOKE … FROM PUBLIC` in earlier migrations still left anon/authenticated
-- EXECUTE in place (the trap documented and partially fixed in issue_335,
-- and completed for push_notification_config_value in #407).
--
-- Sweep:
--   1. anon loses EXECUTE on every function in public. There are no anon RLS
--      policies on public tables and no pre-auth RPC call in the client, so
--      nothing legitimate breaks; policies that call helpers only ever run
--      for authenticated callers.
--   2. Server-only helpers lose EXECUTE for every API role. Their callers
--      (SECURITY DEFINER trigger/command functions) run with owner
--      privileges and are unaffected.

-- 1. Blanket strip across the schema: PUBLIC and anon both lose EXECUTE
-- (PUBLIC would keep anon callable through its implicit membership).
-- authenticated/service_role keep their explicit default grants, so
-- client-facing RPCs and policy helpers keep working.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- 2. Server-only helpers: no API role at all.
-- Returns push pipeline secrets; fully revoked already in 20260905135533
-- (issue #407), restated so this sweep is self-contained.
REVOKE ALL ON FUNCTION public.push_notification_config_value(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Re-dispatches failed push invocations; no frontend, cron, or trigger caller
-- — owner-only operational entry point.
REVOKE ALL ON FUNCTION public.retry_failed_push_invocations(integer)
  FROM PUBLIC, anon, authenticated, service_role;

-- Internal dice-content builder used only by SECURITY DEFINER command
-- functions running as owner.
REVOKE ALL ON FUNCTION public.build_dice_content(text, integer[], integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
