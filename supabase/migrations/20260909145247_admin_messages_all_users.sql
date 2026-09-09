-- #466 Part A: Messages for everyone.
--
-- Extends admin/GM messaging into a platform-wide Messages feature:
--  - announcements gain an `audience` ('all_users' | 'gms')
--  - suspended users stop seeing 'gms' announcements (is_active_gm parity)
--  - any user can open a DM with the server admin (support inbox); the
--    per-user thread is reused by the client (check-then-create, same race
--    class as the existing GM flow)
--  - `gm_id` stays as-is: it already means "the non-admin participant of a
--    dm thread" (GM-initiated DMs set it to themselves today; user-initiated
--    support threads do the same). Renaming to participant_id would churn ~8
--    files for cosmetics.
--
-- The 20260831 hardening migrations re-declared the visibility predicates
-- inline (admin_messages policies + mark_admin_thread_read), so final
-- versions are written fresh here.

CREATE TYPE public.admin_thread_audience AS ENUM ('all_users', 'gms');

-- NOT NULL for announcements, NULL for dms (enforced by the extended
-- admin_threads_type_check below).
ALTER TABLE public.admin_threads
  ADD COLUMN audience public.admin_thread_audience;

UPDATE public.admin_threads SET audience = 'gms' WHERE type = 'announcement';

-- No column default: a dm row requires audience IS NULL (type_check), so a
-- DEFAULT 'gms' would break every dm insert that omits the column (existing
-- client code and fixtures). Announcements must pass audience explicitly —
-- the type check rejects announcement rows without one.
-- Re-create the type check with audience: announcements must have a subject,
-- an audience and no participant; dms must have a participant, no subject
-- and no audience.
ALTER TABLE public.admin_threads DROP CONSTRAINT admin_threads_type_check;
ALTER TABLE public.admin_threads ADD CONSTRAINT admin_threads_type_check CHECK (
  (type = 'announcement' AND subject IS NOT NULL AND gm_id IS NULL AND audience IS NOT NULL) OR
  (type = 'dm' AND subject IS NULL AND gm_id IS NOT NULL AND audience IS NULL)
);

COMMENT ON COLUMN public.admin_threads.gm_id IS
  'The non-admin participant of a dm thread. GM-initiated DMs set it to themselves; user-initiated support threads set it to the signed-in user. Announcements leave it NULL.';

-- ===== RLS rewrites =====

-- Announcements: admin always; 'gms' audience to active (non-suspended) GMs
-- (is_active_gm is suspension-aware); 'all_users' to everyone who is not
-- suspended. The suspension check is inlined (not via is_suspended) because
-- RLS evaluates with caller privileges and is_suspended is not callable by
-- authenticated (#335).
DROP POLICY "Admin and GMs can view announcements" ON public.admin_threads;
CREATE POLICY "Admin and GMs can view announcements" ON public.admin_threads
FOR SELECT
USING (
  type = 'announcement' AND (
    is_server_admin()
    OR (
      audience = 'all_users'
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_suspended
      )
    )
    OR (audience = 'gms' AND is_active_gm(auth.uid()))
  )
);

-- DMs: admin or the thread's non-admin participant. The GM gate
-- (is_active_gm) is dropped so any user can open a support thread; the
-- GM-initiated flow is unchanged (gm_id = auth.uid() was already its shape).
DROP POLICY "Participants can view their DMs" ON public.admin_threads;
CREATE POLICY "Participants can view their DMs" ON public.admin_threads
FOR SELECT
USING (
  type = 'dm' AND (is_server_admin() OR auth.uid() = gm_id)
);

DROP POLICY "Admins and GMs can create DMs" ON public.admin_threads;
CREATE POLICY "Admins and GMs can create DMs" ON public.admin_threads
FOR INSERT
WITH CHECK (
  type = 'dm' AND (is_server_admin() OR auth.uid() = gm_id) AND created_by = auth.uid()
);

-- Announcement visibility flows through the thread check inlined in the
-- admin_messages policies (the 20260831 hardening inlined it instead of
-- relying on admin_threads RLS); rewrite both with the audience logic.
DROP POLICY "Can view messages in readable threads" ON public.admin_messages;
CREATE POLICY "Can view messages in readable threads" ON public.admin_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admin_threads t
    WHERE t.id = admin_messages.thread_id
      AND (
        (
          t.type = 'dm'
          AND (is_server_admin() OR auth.uid() = t.gm_id)
        )
        OR (
          t.type = 'announcement'
          AND (
            is_server_admin()
            OR (
              t.audience = 'all_users'
              AND NOT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND is_suspended
              )
            )
            OR (t.audience = 'gms' AND is_active_gm(auth.uid()))
          )
        )
      )
  )
);

DROP POLICY "Can insert messages in readable threads" ON public.admin_messages;
CREATE POLICY "Can insert messages in readable threads" ON public.admin_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_threads t
    WHERE t.id = admin_messages.thread_id
      AND (
        (
          t.type = 'dm'
          AND (is_server_admin() OR auth.uid() = t.gm_id)
        )
        OR (
          t.type = 'announcement'
          AND (
            is_server_admin()
            OR (
              t.audience = 'all_users'
              AND NOT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND is_suspended
              )
            )
            OR (t.audience = 'gms' AND is_active_gm(auth.uid()))
          )
        )
      )
  ) AND sender_id = auth.uid()
);

-- mark_admin_thread_read: same visibility gate, so a user cannot mark a
-- thread they cannot read.
CREATE OR REPLACE FUNCTION public.mark_admin_thread_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_threads t
    WHERE t.id = p_thread_id
      AND (
        (
          t.type = 'dm'
          AND (is_server_admin() OR auth.uid() = t.gm_id)
        )
        OR (
          t.type = 'announcement'
          AND (
            is_server_admin()
            OR (
              t.audience = 'all_users'
              AND NOT is_suspended(auth.uid())
            )
            OR (t.audience = 'gms' AND is_active_gm(auth.uid()))
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Thread not found.';
  END IF;

  INSERT INTO public.admin_thread_reads (thread_id, user_id, last_read_at)
  VALUES (p_thread_id, auth.uid(), now())
  ON CONFLICT (thread_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$$;

-- Unread badge: mirrors the audience visibility (self/admin-only guard from
-- #335 kept).
CREATE OR REPLACE FUNCTION public.get_admin_unread_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(t.id)::integer
  FROM public.admin_threads t
  LEFT JOIN public.admin_thread_reads r ON r.thread_id = t.id AND r.user_id = p_user_id
  WHERE (
    auth.uid() IS NOT NULL
    AND (is_server_admin() OR p_user_id = auth.uid())
  )
  AND (
    (
      t.type = 'dm'
      AND (is_server_admin() OR p_user_id = t.gm_id)
    )
    OR (
      t.type = 'announcement'
      AND (
        (
          t.audience = 'all_users'
          AND NOT is_suspended(p_user_id)
        )
        OR (t.audience = 'gms' AND is_active_gm(p_user_id))
      )
    )
  )
  AND (r.last_read_at IS NULL OR t.last_message_at > r.last_read_at);
$$;

-- Recipient picker for the admin's DM composer: every non-suspended user
-- (GMs included — the admin can DM anyone). Replaces admin_list_active_gms,
-- which listed only users who GM a non-archived channel.
CREATE OR REPLACE FUNCTION public.admin_list_message_recipients()
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text
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
    SELECT p.id, p.display_name, p.avatar_url
    FROM public.profiles p
    WHERE NOT p.is_suspended
    ORDER BY p.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_message_recipients() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_message_recipients() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_active_gms();
