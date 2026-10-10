-- The batch admin-unread totals used by the push pipeline did not mirror the
-- per-user get_admin_unread_count: it omitted the 'system' thread entirely and
-- only credited DMs to the GM participant, never to the server admin. So the
-- admin's home-screen badge (and every recipient's, via the shared total) was
-- under-counted relative to the in-app Messages dot. Mirror the per-user
-- audience predicate here, reading profiles.server_admin inline because the
-- edge caller is the service role (auth.uid() is NULL, so is_server_admin()
-- and is_suspended() cannot be used directly).

CREATE OR REPLACE FUNCTION public.get_admin_unread_totals(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, COUNT(t.id)::BIGINT
  FROM (SELECT DISTINCT id FROM unnest(p_user_ids) AS uid(id)) u
  LEFT JOIN public.profiles pu ON pu.id = u.id
  JOIN public.admin_threads t ON (
    (
      t.type = 'dm'
      AND (COALESCE(pu.server_admin, false) OR u.id = t.gm_id)
    )
    OR (
      t.type = 'announcement'
      AND (
        COALESCE(pu.server_admin, false)
        OR (t.audience = 'all_users' AND NOT is_suspended(u.id))
        OR (t.audience = 'gms' AND is_active_gm(u.id))
      )
    )
    OR (
      t.type = 'system'
      AND COALESCE(pu.server_admin, false)
    )
  )
  LEFT JOIN public.admin_thread_reads r ON r.thread_id = t.id AND r.user_id = u.id
  WHERE r.last_read_at IS NULL OR t.last_message_at > r.last_read_at
  GROUP BY u.id
$$;

REVOKE ALL ON FUNCTION public.get_admin_unread_totals(UUID[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_unread_totals(UUID[]) TO service_role;
