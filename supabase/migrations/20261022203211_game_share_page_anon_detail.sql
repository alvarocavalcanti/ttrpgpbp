-- #755: the shareable public game page (/game/:id).
--
-- A GM posts this link outside the app (Reddit, forums, Discord), so a
-- signed-out visitor must be able to read the listing before signing in to
-- apply. This is the second anon-granted function, after the /directory list
-- projection (20261015164136_public_channels_anon_directory.sql), and it
-- follows the same rules:
--
--   * SECURITY DEFINER, so anon needs EXECUTE and nothing else — no table or
--     schema privilege is widened and every content policy stays as it is.
--   * A role-agnostic projection: it answers the same for anon, authenticated,
--     or service_role, so there is no signed-in variant to drift from.
--   * Deliberately smaller than get_public_channel (signed-in detail): no id,
--     no member count, no activity timestamp, no membership/application state.
--     Name, system, GM display name, and the GM-authored copy only.
--   * Non-listed, archived, and unknown ids return no row, so a shared link to
--     a delisted game shows a plain "not listed" page instead of leaking that
--     the channel exists.
--
-- The grant sweep allowlists it by name and its own pgTAP file pins the
-- projection; any third anon grant goes through the same review.

CREATE OR REPLACE FUNCTION public.get_public_channel_anon(p_channel_id UUID)
RETURNS TABLE (
  name TEXT,
  game_system TEXT,
  description TEXT,
  constraints TEXT,
  application_prompt TEXT,
  gm_display_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.name, c.game_system, c.description, c.constraints,
         c.application_prompt, gm.display_name
  FROM channels c
  LEFT JOIN profiles gm ON gm.id = c.gm_id
  WHERE c.id = p_channel_id
    AND c.join_mode = 'approval'
    AND NOT c.is_archived;
$$;

REVOKE ALL ON FUNCTION public.get_public_channel_anon(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_channel_anon(UUID)
  TO anon, authenticated, service_role;
