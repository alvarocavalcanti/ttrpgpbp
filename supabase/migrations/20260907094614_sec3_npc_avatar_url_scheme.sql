-- Issue #429 / SEC-3 (P2): NPC avatar URLs bypass the URL-scheme contract.
-- channel_npcs.avatar_url (writable directly by the GM through the roster UI
-- and via send_message's roster snapshot) and messages.npc_avatar_url had no
-- scheme check: a GM could store an exotic-scheme value (javascript:, data:,
-- …) that renders as an NPC portrait everyone sees. React 19 blocks
-- javascript: hrefs, so this is defense-in-depth and DB-contract consistency:
-- every avatar field plays by the same WHATWG-normalized rules
-- (20260905144748). messages.npc_avatar_url and channel_npcs.avatar_url
-- already carry the 500-char length caps (20260818140000).

-- Shared guard for both NPC avatar columns; the column differs per table, so
-- route on TG_TABLE_NAME (messages.npc_avatar_url vs channel_npcs.avatar_url).
-- Only fires when the value is non-NULL and non-empty: '' stays legal, matching
-- the channels/channel_members contract.
-- SECURITY DEFINER: the trigger fires on direct client writes (roster UI) by
-- authenticated users, and the helper url_scheme_allowed is owner-only — an
-- invoker-rights body would fail with permission denied (review finding).
CREATE OR REPLACE FUNCTION public.enforce_npc_url_scheme()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
BEGIN
  IF TG_TABLE_NAME = 'messages' THEN
    v_url := NEW.npc_avatar_url;
  ELSE
    v_url := NEW.avatar_url;
  END IF;
  IF v_url IS NOT NULL AND v_url <> ''
     AND NOT public.url_scheme_allowed(v_url) THEN
    RAISE EXCEPTION 'URLs must start with http:// or https://';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS channel_npcs_url_scheme ON channel_npcs;
CREATE TRIGGER channel_npcs_url_scheme
  BEFORE INSERT OR UPDATE ON channel_npcs
  FOR EACH ROW EXECUTE FUNCTION enforce_npc_url_scheme();

DROP TRIGGER IF EXISTS messages_npc_url_scheme ON messages;
CREATE TRIGGER messages_npc_url_scheme
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION enforce_npc_url_scheme();

-- Owner-only (called from trigger bodies); revoke the default grants so the
-- SEC-1 grant-sweep invariant (no anon/PUBLIC EXECUTE in public) keeps holding.
REVOKE ALL ON FUNCTION public.enforce_npc_url_scheme()
  FROM PUBLIC, anon, authenticated, service_role;

-- Scrub any pre-existing non-conforming values (plain links; dropping them
-- loses nothing structural). Relative storage paths and http(s) values are
-- untouched. Runs before the auth guard of prevent_message_update_tampering
-- can matter: migrations execute without a JWT context.
-- channel_npcs.avatar_url is NOT NULL: '' is the legal unset (and skips the
-- trigger guard). messages.npc_avatar_url is nullable, so NULL it directly.
UPDATE channel_npcs
SET avatar_url = ''
WHERE avatar_url IS NOT NULL
  AND avatar_url <> ''
  AND NOT public.url_scheme_allowed(avatar_url);
UPDATE messages
SET npc_avatar_url = NULL
WHERE npc_avatar_url IS NOT NULL
  AND npc_avatar_url <> ''
  AND NOT public.url_scheme_allowed(npc_avatar_url);
