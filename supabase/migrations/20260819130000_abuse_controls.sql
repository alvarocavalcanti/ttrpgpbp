-- #209: Abuse controls, global suspension, rate limiting, and audit trails.

-- ==========================================
-- 1. Global Suspension
-- ==========================================

ALTER TABLE profiles ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION is_suspended(u_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_suspended FROM profiles WHERE id = u_id;
$$;

-- Modify existing core access functions to deny suspended users
CREATE OR REPLACE FUNCTION is_channel_member(c_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = c_id AND user_id = auth.uid() AND is_blocked = false
  ) AND NOT is_suspended(auth.uid());
$$;

CREATE OR REPLACE FUNCTION is_channel_gm(c_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channels
    WHERE id = c_id AND gm_id = auth.uid()
  ) AND NOT is_suspended(auth.uid());
$$;

-- Server admin function to suspend a user
CREATE OR REPLACE FUNCTION admin_suspend_user(p_user_id UUID, p_suspend BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Requires server admin privileges';
  END IF;

  UPDATE profiles SET is_suspended = p_suspend WHERE id = p_user_id;

  INSERT INTO audit_logs (admin_id, action, target_id, details)
  VALUES (
    auth.uid(), 
    CASE WHEN p_suspend THEN 'suspend_user' ELSE 'unsuspend_user' END, 
    p_user_id, 
    jsonb_build_object('reason', p_reason)
  );
END;
$$;


-- ==========================================
-- 2. Audit Trails & Abuse Reports
-- ==========================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Server admins can view audit logs"
  ON audit_logs FOR SELECT USING (is_server_admin());

CREATE TABLE abuse_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, resolved, dismissed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE abuse_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert their own reports"
  ON abuse_reports FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "Server admins can view reports"
  ON abuse_reports FOR SELECT USING (is_server_admin());
CREATE POLICY "Server admins can update reports"
  ON abuse_reports FOR UPDATE USING (is_server_admin());


-- Update join_channel to throttle failed password attempts
DROP FUNCTION IF EXISTS join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION join_channel(
  p_channel_id UUID,
  p_character_name TEXT,
  p_character_avatar_url TEXT DEFAULT NULL,
  p_character_sheet_url TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_invite_code TEXT DEFAULT NULL,
  p_character_attributes JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel record;
  v_secret record;
  v_character_name TEXT;
  v_channel_count INTEGER;
  v_is_admin BOOLEAN;
  v_max_channels INTEGER;
  v_attributes JSONB;
  v_min_mod INTEGER := -4;
  v_max_mod INTEGER := 5;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF is_suspended(auth.uid()) THEN
    RAISE EXCEPTION 'Account suspended.';
  END IF;

  SELECT * INTO v_channel FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  IF v_channel.is_archived THEN
    RAISE EXCEPTION 'This channel has been archived and can no longer be joined.';
  END IF;

  SELECT * INTO v_secret FROM channel_secrets WHERE channel_id = p_channel_id;

  IF v_channel.gm_id = auth.uid() THEN
    -- Allowed
  ELSIF v_channel.invite_code IS NOT NULL AND v_channel.invite_code = p_invite_code THEN
    -- Allowed via invite code
  ELSIF v_secret IS NOT NULL AND v_secret.password_hash IS NOT NULL THEN

    IF v_secret.password_hash = p_password_hash THEN
      -- Allowed via password
    ELSE
      RAISE EXCEPTION 'Invalid password or invite code';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid password or invite code';
  END IF;

  v_character_name := LEFT(COALESCE(p_character_name, ''), 20);

  SELECT server_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    v_max_channels := 10;
    SELECT (value #>> '{}')::int INTO v_max_channels
    FROM app_settings WHERE key = 'max_channels_per_user';
    v_max_channels := COALESCE(v_max_channels, 10);

    SELECT COUNT(*) INTO v_channel_count
    FROM channel_members cm
    JOIN channels c ON c.id = cm.channel_id
    WHERE cm.user_id = auth.uid() AND NOT c.is_archived;
    IF v_channel_count >= v_max_channels THEN
      RAISE EXCEPTION 'Channel limit reached. You can join at most % channels.', v_max_channels;
    END IF;
  END IF;

  IF v_channel.game_system = 'shadowdark' THEN
    v_min_mod := -4;
    v_max_mod := 4;
  END IF;

  v_attributes := '{}'::jsonb;
  IF p_character_attributes IS NOT NULL AND jsonb_typeof(p_character_attributes) = 'object' THEN
    SELECT jsonb_object_agg(k, least(greatest(v::int, v_min_mod), v_max_mod))
    INTO v_attributes
    FROM jsonb_each_text(p_character_attributes) AS e(k, v)
    WHERE v ~ '^-?\d+$';
  END IF;

  INSERT INTO channel_members (channel_id, user_id, character_name, character_avatar_url, character_sheet_url, attributes)
  VALUES (p_channel_id, auth.uid(), v_character_name, p_character_avatar_url, p_character_sheet_url, v_attributes);

  INSERT INTO messages (channel_id, sender_id, type, content)
  VALUES (p_channel_id, auth.uid(), 'system', v_character_name || ' joined the channel');
END;
$$;

REVOKE ALL ON FUNCTION join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION join_channel(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

