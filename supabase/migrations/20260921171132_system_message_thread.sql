-- Issue #562 P1: a single "System" thread in /messages where safety alerts
-- arrive (CSAM matches via post_system_message, abuse reports via the trigger
-- below). Reuses the admin_threads/admin_messages inbox: the existing
-- realtime, push, and unread-badge machinery surfaces the alert to the
-- server admin with no new notification subsystem.
--
-- Requires the 'system' enum value from 20260921171131 (a new enum value
-- cannot be used in the transaction that adds it).

-- The system thread carries a subject like an announcement, but no
-- participant and no audience (admin-only).
ALTER TABLE public.admin_threads DROP CONSTRAINT admin_threads_type_check;
ALTER TABLE public.admin_threads ADD CONSTRAINT admin_threads_type_check CHECK (
  (type = 'announcement' AND subject IS NOT NULL AND gm_id IS NULL AND audience IS NOT NULL) OR
  (type = 'dm' AND subject IS NULL AND gm_id IS NOT NULL AND audience IS NULL) OR
  (type = 'system' AND subject IS NOT NULL AND gm_id IS NULL AND audience IS NULL)
);

-- At most one system thread: lazy creation (get_or_create_system_thread) is
-- idempotent under concurrency via ON CONFLICT.
CREATE UNIQUE INDEX admin_threads_system_unique
  ON public.admin_threads(type) WHERE type = 'system';

-- Admin-only visibility for the system thread. Permissive policies OR
-- together, so a separate policy avoids rewriting the announcement/DM ones.
CREATE POLICY "Admins can view system threads" ON public.admin_threads
FOR SELECT
USING (
  type = 'system' AND is_server_admin()
);
-- No INSERT policy for system threads: only the service role and the
-- SECURITY DEFINER functions below may create them.

-- System messages have no human sender (scan-upload and the abuse-report
-- trigger author them). The CHECK blocks forged rows either way: a client
-- cannot pass the insert policy with a NULL sender, and cannot set
-- is_system with a sender.
ALTER TABLE public.admin_messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.admin_messages
  ADD COLUMN is_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.admin_messages
  ADD CONSTRAINT admin_messages_system_sender_check CHECK (
    (is_system AND sender_id IS NULL)
    OR (NOT is_system AND sender_id IS NOT NULL)
  );
COMMENT ON COLUMN public.admin_messages.is_system IS
  'True for alerts authored by the system (CSAM matches, abuse reports), never by a browser client. Renders as a notice card; only visible to the server admin.';

-- Thread visibility for messages: mirror the admin_threads change.
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
        OR (
          t.type = 'system'
          AND is_server_admin()
        )
      )
  )
);

-- Admin replies in the system thread (recording an NCMEC/Hotline.ie filing)
-- are ordinary messages with sender_id = auth.uid(). The NULL-sender check
-- below keeps clients from forging is_system rows; the table CHECK backs it.
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
        OR (
          t.type = 'system'
          AND is_server_admin()
        )
      )
  ) AND sender_id = auth.uid()
);

-- Lazy singleton: returns the system thread id, creating it on first use.
-- Returns NULL when no server admin exists (nothing to notify). The partial
-- unique index makes the INSERT safe under concurrency.
CREATE OR REPLACE FUNCTION public.get_or_create_system_thread()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_admin uuid;
BEGIN
  SELECT id INTO v_id FROM public.admin_threads WHERE type = 'system' LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE server_admin LIMIT 1;
  IF v_admin IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.admin_threads (type, subject, gm_id, audience, created_by)
  VALUES ('system', 'System', NULL, NULL, v_admin)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.admin_threads WHERE type = 'system' LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_system_thread()
  FROM PUBLIC, anon, authenticated, service_role;

-- Posts a system alert into the admin's System thread. Best-effort by
-- design: a NULL return from get_or_create_system_thread (no admin yet)
-- silently skips — the scan/abuse evidence rows are the durable record.
-- Service-role only: browser clients must never author system messages.
CREATE OR REPLACE FUNCTION public.post_system_message(p_content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread uuid;
BEGIN
  IF p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'System message content is required';
  END IF;

  v_thread := public.get_or_create_system_thread();
  IF v_thread IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.admin_messages (thread_id, sender_id, content, is_system)
  VALUES (v_thread, NULL, p_content, true);
END;
$$;

REVOKE ALL ON FUNCTION public.post_system_message(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_system_message(TEXT) TO service_role;

-- Every abuse report alerts the admin with full details and links. The
-- message body is markdown (ThreadDetail renders admin_messages as
-- markdown); display names fall back when an account is already gone.
CREATE OR REPLACE FUNCTION public.enqueue_abuse_report_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter text;
  v_reported text;
  v_channel text;
  v_body text;
BEGIN
  SELECT display_name INTO v_reporter FROM public.profiles WHERE id = NEW.reporter_id;
  SELECT display_name INTO v_reported FROM public.profiles WHERE id = NEW.reported_user_id;
  SELECT name INTO v_channel FROM public.channels WHERE id = NEW.channel_id;

  v_body :=
    '**New abuse report**' || E'\n\n'
    || '- **Reporter:** ' || CASE WHEN NEW.reporter_id IS NULL THEN 'Unknown user'
         ELSE '[' || COALESCE(v_reporter, 'Unknown user') || '](/admin?user=' || NEW.reporter_id || ')' END || E'\n'
    || '- **Reported user:** ' || CASE WHEN NEW.reported_user_id IS NULL THEN 'Unknown user'
         ELSE '[' || COALESCE(v_reported, 'Unknown user') || '](/admin?user=' || NEW.reported_user_id || ')' END || E'\n'
    || '- **Channel:** ' || CASE WHEN NEW.channel_id IS NULL THEN '—'
         ELSE '[' || COALESCE(v_channel, 'Unknown channel') || '](/admin/channels/' || NEW.channel_id || ')' END || E'\n'
    || '- **Reason:** ' || NEW.reason || E'\n'
    || '- **Status:** pending — open the report in the [Reports tab](/admin).';

  PERFORM public.post_system_message(v_body);
  RETURN NEW;
END;
$$;

-- Trigger helper: wired via CREATE TRIGGER only (house convention).
REVOKE ALL ON FUNCTION public.enqueue_abuse_report_alert()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS on_abuse_report_alert ON public.abuse_reports;
CREATE TRIGGER on_abuse_report_alert
AFTER INSERT ON public.abuse_reports
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_abuse_report_alert();

-- The read-marker and unread counter must cover the system thread, otherwise
-- the admin's badge never reflects a pending alert.
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
        OR (
          t.type = 'system'
          AND is_server_admin()
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
        is_server_admin()
        OR (
          t.audience = 'all_users'
          AND NOT is_suspended(p_user_id)
        )
        OR (t.audience = 'gms' AND is_active_gm(p_user_id))
      )
    )
    OR (
      t.type = 'system'
      AND is_server_admin()
    )
  )
  AND (r.last_read_at IS NULL OR t.last_message_at > r.last_read_at);
$$;
