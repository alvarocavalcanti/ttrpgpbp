-- Security fix (2026-09-25 final audit, P1): announcement threads are
-- admin-authored broadcasts. The 20260909145247/20260921171132 INSERT policy
-- mirrored the announcement READ audience, so any non-suspended user could
-- post into an all_users announcement thread; the unconditional
-- on_admin_message_inserted_push trigger then fanned that content out to every
-- user as an "Announcement:" push (mass-notification / impersonation vector).
--
-- Gate announcement (and system) inserts on is_server_admin(). DM inserts keep
-- their participant rule. Reads are unchanged: everyone still sees the
-- announcements addressed to them.

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
          AND is_server_admin()
        )
        OR (
          t.type = 'system'
          AND is_server_admin()
        )
      )
  ) AND sender_id = auth.uid()
);
