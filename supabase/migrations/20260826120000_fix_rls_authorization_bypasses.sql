-- #300: P1 RLS / authorization bypasses.
--
-- Four escalation holes. The sanctioned writer paths (admin_suspend_user,
-- set_active_players, send_message's active-player flip) all run SECURITY
-- DEFINER as postgres *with auth.uid() still set*, so a trigger must gate on
-- the caller's role, not blanket-block column changes.

-- ==========================================
-- 1. is_suspended: users must not set their own suspension through the
--    self-update profile policy. admin_suspend_user still works — the caller
--    is a server admin, so is_server_admin() is true.
-- ==========================================
CREATE OR REPLACE FUNCTION prevent_self_suspension_change()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
     AND NOT is_server_admin()
  THEN
    RAISE EXCEPTION 'is_suspended can only be changed by a server admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_is_suspended_immutable ON profiles;
CREATE TRIGGER profiles_is_suspended_immutable
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_self_suspension_change();

-- ==========================================
-- 2. is_active_player: players must not flip their own active status; only
--    the GM can, via set_active_players / send_message (definer) or the GM
--    manage-members policy. The GM check holds for orphan channels (gm_id
--    NULL) too: no authenticated caller is the GM, so nobody flips the flag.
-- ==========================================
CREATE OR REPLACE FUNCTION prevent_non_gm_active_player_change()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.is_active_player IS DISTINCT FROM OLD.is_active_player
     AND NOT EXISTS (
       SELECT 1 FROM channels WHERE id = OLD.channel_id AND gm_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Only the GM can change active player status';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS channel_members_active_player_gm_only ON channel_members;
CREATE TRIGGER channel_members_active_player_gm_only
  BEFORE UPDATE ON channel_members
  FOR EACH ROW EXECUTE FUNCTION prevent_non_gm_active_player_change();

-- ==========================================
-- 3. Orphan channel takeover: update_channel_settings checked gm_id <> uid,
--    which is NULL (falsy) for orphaned channels, letting any caller mutate
--    them. IS DISTINCT FROM treats NULL gm_id as "not the caller" and rejects.
-- ==========================================
CREATE OR REPLACE FUNCTION update_channel_settings(
  p_channel_id UUID,
  p_name TEXT DEFAULT NULL,
  p_game_system TEXT DEFAULT NULL,
  p_map_url TEXT DEFAULT NULL,
  p_resources_url TEXT DEFAULT NULL,
  p_safety_tools_url TEXT DEFAULT NULL,
  p_gm_only_resources_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_password_salt TEXT DEFAULT NULL,
  p_clear_password BOOLEAN DEFAULT false,
  p_safety_lines TEXT DEFAULT NULL,
  p_safety_veils TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_channel RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;
  IF v_channel.gm_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the GM can change channel settings.';
  END IF;

  UPDATE channels SET
    name = COALESCE(NULLIF(p_name, ''), name),
    game_system = COALESCE(p_game_system, game_system),
    map_url = p_map_url,
    resources_url = p_resources_url,
    safety_tools_url = p_safety_tools_url,
    updated_at = now()
  WHERE id = p_channel_id;

  INSERT INTO channel_secrets (channel_id, gm_only_resources_url)
  VALUES (p_channel_id, NULLIF(p_gm_only_resources_url, ''))
  ON CONFLICT (channel_id) DO UPDATE SET
    gm_only_resources_url = NULLIF(EXCLUDED.gm_only_resources_url, '');

  IF p_clear_password OR p_password_hash IS NOT NULL OR p_password_salt IS NOT NULL THEN
    INSERT INTO channel_secrets (channel_id, password_hash, password_salt)
    VALUES (p_channel_id,
      CASE WHEN p_clear_password THEN NULL ELSE p_password_hash END,
      CASE WHEN p_clear_password THEN NULL ELSE p_password_salt END)
    ON CONFLICT (channel_id) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      password_salt = EXCLUDED.password_salt;
  END IF;

  IF p_safety_lines IS NOT NULL OR p_safety_veils IS NOT NULL THEN
    INSERT INTO channel_safety_tools (channel_id, lines, veils, updated_at)
    VALUES (p_channel_id, COALESCE(p_safety_lines, ''), COALESCE(p_safety_veils, ''), now())
    ON CONFLICT (channel_id) DO UPDATE SET
      lines = COALESCE(p_safety_lines, channel_safety_tools.lines),
      veils = COALESCE(p_safety_veils, channel_safety_tools.veils),
      updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION update_channel_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_channel_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;

-- ==========================================
-- 4. Legacy get_unread_count: SECURITY DEFINER with no membership check and
--    no REVOKE let any caller count messages in arbitrary private channels.
--    Unused (the app uses membership-scoped get_user_channels_unread), so drop
--    it outright to remove the hole.
-- ==========================================
DROP FUNCTION IF EXISTS public.get_unread_count(UUID, timestamp with time zone);