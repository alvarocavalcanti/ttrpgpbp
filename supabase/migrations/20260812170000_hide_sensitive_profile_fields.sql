-- H1 / P0-3: stop exposing sensitive profile fields to every authenticated user.
--
-- Approach: profiles keeps the row-level "everyone" SELECT policy because chat
-- legitimately needs cross-user display names/avatars for messages, members,
-- rolls, etc. The sensitive data is removed at the column level instead:
--   * email is dropped entirely. auth.users is the source of truth; the app
--     shows user?.email from the session. With no column, there is nothing to
--     enumerate. Server admins still see emails via admin_list_users, which
--     reads from auth.users through a SECURITY DEFINER gate.
--   * server_admin is revoked from authenticated. The is_server_admin() RPC
--     (SECURITY DEFINER, existing) is the only remaining read path and is what
--     client admin gating uses.

-- admin_list_users reads profiles.email today; recreate it against auth.users
-- first so the column drop below has no dependents.
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
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT p.id, p.display_name, u.email,
      COUNT(cm.id) FILTER (WHERE NOT c.is_archived) AS channel_count,
      p.created_at
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN channel_members cm ON cm.user_id = p.id
    LEFT JOIN channels c ON c.id = cm.channel_id
    GROUP BY p.id, u.email
    ORDER BY p.created_at DESC;
END;
$$;

-- Drop the email column (removes the enumeration target) and stop the signup
-- trigger from writing it.
ALTER TABLE profiles DROP COLUMN email;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hide server_admin from the API surface; only is_server_admin() can read it.
REVOKE SELECT (server_admin) ON profiles FROM authenticated;
