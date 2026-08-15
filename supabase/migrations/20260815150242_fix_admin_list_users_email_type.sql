-- Fix the server admin screen ("Failed to load admin data").
--
-- admin_list_users declared its return email column as TEXT but RETURN QUERY
-- selected auth.users.email uncast (character varying(255)). PostgREST then
-- failed every call with 42804 ("Returned type character varying(255) does
-- not match expected type text in column 3"), which took down the whole admin
-- page (its Promise.all throws on the first failed RPC). Cast the column to
-- the declared type.

CREATE OR REPLACE FUNCTION public.admin_list_users()
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
    SELECT p.id, p.display_name, u.email::text,
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

-- CREATE OR REPLACE keeps prior grants, but re-state them so the invariant
-- survives any future DROP.
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
