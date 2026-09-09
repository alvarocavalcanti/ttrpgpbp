-- #466 Part B: email consent groundwork (no sending infrastructure).
--
-- Opt-in checkbox (default false) plus a consent timestamp pair for evidence.
-- The existing "Users can update own profile row" UPDATE policy covers the
-- self-write, so no new server code beyond extending admin_list_users with
-- the flag for the admin's opt-in export.

ALTER TABLE public.profiles
  ADD COLUMN email_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN email_opt_in_at timestamptz;

COMMENT ON COLUMN public.profiles.email_opt_in IS
  'User consent to be emailed about product updates, beta invitations, and replies to their feedback or reports. Default false; the transactional carve-out (account/security notices) applies regardless.';
COMMENT ON COLUMN public.profiles.email_opt_in_at IS
  'Timestamp of the last consent change (evidence pair with email_opt_in).';

-- Extend the admin user list with the opt-in flag (drop+recreate is the
-- established pattern for this function).
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
  provider TEXT,
  email_opt_in BOOLEAN
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
                 WHERE i.user_id = p.id ORDER BY i.created_at LIMIT 1)) AS provider,
      p.email_opt_in
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
