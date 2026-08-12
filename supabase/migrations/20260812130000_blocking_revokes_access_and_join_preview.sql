-- Audit P0-4/P0-7 (2026-08-12): blocking must revoke access, and the join
-- preview must stop leaking channel internals (invite code, GM-only URLs).

-- ==========================================
-- 1. Blocked members lose channel access
-- ==========================================

-- Redefine membership so blocked members are no longer members for RLS
-- purposes. Every policy built on is_channel_member (channels, messages,
-- reactions, dice rolls, safety tools, member lists) now excludes them, so a
-- blocked user can no longer read or write channel data.
CREATE OR REPLACE FUNCTION is_channel_member(c_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = c_id AND user_id = auth.uid() AND is_blocked = false
  );
$$;

-- Prevent a blocked user from unblocking themselves through the self-update
-- path ("Users can update their own character info"). Only the GM (via
-- is_channel_gm) may change a member's blocked state.
CREATE OR REPLACE FUNCTION prevent_member_self_block_toggle()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL
    AND auth.uid() = OLD.user_id
    AND NOT is_channel_gm(OLD.channel_id)
    AND NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
  THEN
    RAISE EXCEPTION 'players cannot change their own blocked state';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER channel_members_block_self_immutable
  BEFORE UPDATE ON channel_members
  FOR EACH ROW EXECUTE FUNCTION prevent_member_self_block_toggle();

-- ==========================================
-- 2. Safe join preview
-- ==========================================

-- Non-members previously read the full channel row (invite_code, gm_id,
-- map/resources/GM-only URLs) for any channel carrying an invite code. Drop
-- that policy: joining now goes through a SECURITY DEFINER projection that
-- exposes only the fields the join form needs.
DROP POLICY IF EXISTS "Channels are viewable for joining" ON channels;

CREATE OR REPLACE FUNCTION get_join_channel_preview(p_channel_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  game_system TEXT,
  has_password BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.game_system,
    EXISTS (
      SELECT 1 FROM channel_secrets cs
      WHERE cs.channel_id = c.id AND cs.password_hash IS NOT NULL
    ) AS has_password
  FROM channels c
  WHERE c.id = p_channel_id AND c.invite_code IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION get_join_channel_preview(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_join_channel_preview(UUID) TO authenticated;

-- ==========================================
-- 3. GM-only resources URL out of the member-visible channel row
-- ==========================================

-- gm_only_resources_url was readable by every channel member via channels
-- SELECT. Move it to channel_secrets, which is GM-only (RLS), so only the GM
-- can read or change it.
ALTER TABLE channel_secrets ADD COLUMN gm_only_resources_url TEXT;

UPDATE channel_secrets cs
SET gm_only_resources_url = c.gm_only_resources_url
FROM channels c
WHERE c.id = cs.channel_id AND c.gm_only_resources_url IS NOT NULL;

ALTER TABLE channels DROP COLUMN gm_only_resources_url;
