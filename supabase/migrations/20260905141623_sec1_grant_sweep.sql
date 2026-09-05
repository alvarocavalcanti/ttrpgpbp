-- Issue #402 / SEC-1: class fix for the "REVOKE … FROM PUBLIC is not enough"
-- pattern. Supabase's default privileges (and PUBLIC membership) leave
-- EXECUTE reachable by anon on functions whose only revoke was
-- `… FROM PUBLIC`; and default grants vary between long-lived local stacks
-- and fresh CI clusters. This sweep pins one deterministic baseline.
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
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- 2. Normalize the app roles: explicit EXECUTE for authenticated and
-- service_role on every function in public. Default privileges differ
-- between environments (long-lived local stacks vs fresh CI clusters), so
-- the sweep pins the intended baseline instead of relying on them: client
-- RPCs and policy/RLS helpers keep working for authenticated callers, and
-- the push pipeline's service_role RPC keeps working.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- 3. Server-only helpers: no API role at all (granted above, revoked here —
-- statement order makes the end state deterministic). Their real callers
-- (SECURITY DEFINER trigger/command functions) run with owner privileges.
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

-- Already fully revoked in 20260831140000 (issue_335); restated so the
-- blanket grant above cannot silently resurrect them.
REVOKE ALL ON FUNCTION public.is_suspended(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_mention_user_ids(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.roll_dice_unchecked(uuid, text, uuid, text, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
