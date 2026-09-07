-- Issue #429 review follow-up: the URL-scheme trigger functions introduced by
-- 20260905144748 (channels + channel_members) are SECURITY INVOKER but call the
-- owner-only helper url_scheme_allowed (revoked from authenticated by that same
-- migration). When an authenticated user writes the row directly, the trigger
-- fires with invoker privileges and fails with "permission denied for function
-- url_scheme_allowed" — e.g. the GM avatar upload path in
-- src/features/channels/useChannelAvatar.ts. The NPC twin
-- (enforce_npc_url_scheme) is fixed as SECURITY DEFINER directly in
-- 20260907094614 (this branch); these two come from a merged migration, so they
-- are replaced here. House pattern: trigger functions that call other helpers
-- run as owner with a pinned search_path (see 20260905153829_sec5_search_path_pin).

CREATE OR REPLACE FUNCTION public.enforce_url_scheme()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
BEGIN
  FOREACH v_url IN ARRAY ARRAY[
    NEW.map_url, NEW.resources_url, NEW.safety_tools_url, NEW.avatar_url
  ] LOOP
    IF v_url IS NOT NULL AND v_url <> ''
       AND NOT public.url_scheme_allowed(v_url) THEN
      RAISE EXCEPTION 'URLs must start with http:// or https://';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_member_url_scheme()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.character_sheet_url IS NOT NULL AND NEW.character_sheet_url <> ''
     AND NOT public.url_scheme_allowed(NEW.character_sheet_url) THEN
    RAISE EXCEPTION 'URLs must start with http:// or https://';
  END IF;
  IF NEW.character_avatar_url IS NOT NULL AND NEW.character_avatar_url <> ''
     AND NOT public.url_scheme_allowed(NEW.character_avatar_url) THEN
    RAISE EXCEPTION 'URLs must start with http:// or https://';
  END IF;
  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE preserves ACLs; restate the revokes so the end state is
-- deterministic regardless of environment default privileges.
REVOKE ALL ON FUNCTION public.enforce_url_scheme()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_member_url_scheme()
  FROM PUBLIC, anon, authenticated, service_role;
