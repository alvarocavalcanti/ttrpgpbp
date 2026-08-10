-- Server admin view: app_settings table + admin list RPCs.
-- Admin can configure max_channels_per_user (min 10) and see all users/channels.

-- Helper: is the current user a server admin? Used in RLS and RPC guards.
CREATE OR REPLACE FUNCTION auth.is_server_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT server_admin FROM profiles WHERE id = auth.uid()), false)
$$;

-- Key/value settings. Only server_admin can write; anyone can read (cap value is
-- not sensitive — the client needs it to disable the Create Channel button).
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO app_settings (key, value) VALUES ('max_channels_per_user', '10');

CREATE POLICY app_settings_select ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY app_settings_insert ON app_settings FOR INSERT TO authenticated WITH CHECK (auth.is_server_admin());
CREATE POLICY app_settings_update ON app_settings FOR UPDATE TO authenticated USING (auth.is_server_admin());
CREATE POLICY app_settings_delete ON app_settings FOR DELETE TO authenticated USING (auth.is_server_admin());

-- Admin: list users with their non-archived channel count.
-- SECURITY DEFINER so the admin can count channels the user belongs to without
-- relying on channel_members RLS (which is member-scoped).
CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  email TEXT,
  channel_count BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT auth.is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT p.id, p.display_name, p.email,
      COUNT(cm.id) FILTER (WHERE NOT c.is_archived) AS channel_count,
      p.created_at
    FROM profiles p
    LEFT JOIN channel_members cm ON cm.user_id = p.id
    LEFT JOIN channels c ON c.id = cm.channel_id
    GROUP BY p.id
    ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_users() TO authenticated;

-- Admin: list channels with member count, system, created/last active.
CREATE OR REPLACE FUNCTION admin_list_channels()
RETURNS TABLE (
  id UUID,
  name TEXT,
  game_system TEXT,
  member_count BIGINT,
  created_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  gm_display_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT auth.is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT c.id, c.name, c.game_system,
      COUNT(cm.id) AS member_count,
      c.created_at,
      c.last_message_at,
      gm.display_name AS gm_display_name
    FROM channels c
    LEFT JOIN channel_members cm ON cm.channel_id = c.id
    LEFT JOIN profiles gm ON gm.id = c.gm_id
    WHERE NOT c.is_archived
    GROUP BY c.id, gm.display_name
    ORDER BY c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_channels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_channels() TO authenticated;
