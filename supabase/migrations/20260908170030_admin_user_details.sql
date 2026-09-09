-- #460: Server admin user details. Enrich the admin user list with the data
-- an admin needs for moderation and support, and add a per-user audit-history
-- lookup.
--
-- admin_list_users previously returned name/email/count/joined/suspended and
-- channel count. It now also carries: last login (auth.users.last_sign_in_at),
-- the user's channel memberships (character + membership flags, as JSONB),
-- their latest message activity, avatar, admin role, email-verification state
-- and identity provider. Membership/message aggregates use scalar subqueries
-- so joining channel_members against messages can't multiply rows.

DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  email TEXT,
  channel_count BIGINT,
  channels JSONB,
  last_login_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  message_count BIGINT,
  created_at TIMESTAMPTZ,
  is_suspended BOOLEAN,
  avatar_url TEXT,
  server_admin BOOLEAN,
  email_verified BOOLEAN,
  provider TEXT
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
    SELECT
      p.id,
      p.display_name,
      u.email::text,
      (SELECT COUNT(*)::bigint
         FROM channel_members cm
         JOIN channels c ON c.id = cm.channel_id
        WHERE cm.user_id = p.id AND NOT c.is_archived) AS channel_count,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
                  'name', c.name,
                  'character_name', cm.character_name,
                  'joined_at', cm.joined_at,
                  'is_blocked', cm.is_blocked,
                  'is_active_player', cm.is_active_player)
                 ORDER BY c.created_at)
           FROM channel_members cm
           JOIN channels c ON c.id = cm.channel_id
          WHERE cm.user_id = p.id AND NOT c.is_archived),
        '[]'::jsonb) AS channels,
      u.last_sign_in_at AS last_login_at,
      ms.last_message_at,
      ms.message_count,
      p.created_at,
      p.is_suspended,
      p.avatar_url,
      p.server_admin,
      (u.email_confirmed_at IS NOT NULL) AS email_verified,
      COALESCE(u.raw_app_meta_data->>'provider',
               (SELECT i.provider FROM auth.identities i
                 WHERE i.user_id = p.id ORDER BY i.created_at LIMIT 1)) AS provider
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN LATERAL (
      SELECT MAX(m.created_at) AS last_message_at, COUNT(*)::bigint AS message_count
      FROM messages m
      WHERE m.sender_id = p.id AND NOT m.is_deleted
    ) ms ON true
    ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Per-user moderation/audit history (suspend/unsuspend actions with reasons).
DROP FUNCTION IF EXISTS public.admin_get_user_history(UUID);

CREATE OR REPLACE FUNCTION public.admin_get_user_history(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  action TEXT,
  reason TEXT,
  admin_name TEXT,
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
    SELECT al.id, al.action,
           al.details->>'reason' AS reason,
           a.display_name AS admin_name,
           al.created_at
    FROM audit_logs al
    LEFT JOIN profiles a ON a.id = al.admin_id
    WHERE al.target_id = p_user_id
    ORDER BY al.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_history(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_history(UUID) TO authenticated;
