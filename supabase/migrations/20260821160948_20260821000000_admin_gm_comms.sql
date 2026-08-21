-- 1. Helper function to determine if a user is an active GM
CREATE OR REPLACE FUNCTION public.is_active_gm(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channels
    WHERE gm_id = p_user_id AND is_archived = false
  );
$$;

-- 2. admin_threads table
CREATE TYPE public.admin_thread_type AS ENUM ('announcement', 'dm');

CREATE TABLE public.admin_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type admin_thread_type NOT NULL,
  subject text,
  gm_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT admin_threads_type_check CHECK (
    (type = 'announcement' AND subject IS NOT NULL AND gm_id IS NULL) OR
    (type = 'dm' AND subject IS NULL AND gm_id IS NOT NULL)
  )
);

ALTER TABLE public.admin_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and GMs can view announcements" ON public.admin_threads
FOR SELECT
USING (
  type = 'announcement' AND (is_server_admin() OR is_active_gm(auth.uid()))
);

CREATE POLICY "Participants can view their DMs" ON public.admin_threads
FOR SELECT
USING (
  type = 'dm' AND (is_server_admin() OR auth.uid() = gm_id)
);

CREATE POLICY "Admins can create announcements" ON public.admin_threads
FOR INSERT
WITH CHECK (
  type = 'announcement' AND is_server_admin() AND created_by = auth.uid()
);

CREATE POLICY "Admins and GMs can create DMs" ON public.admin_threads
FOR INSERT
WITH CHECK (
  type = 'dm' AND (is_server_admin() OR (auth.uid() = gm_id AND is_active_gm(auth.uid()))) AND created_by = auth.uid()
);

CREATE POLICY "Only admins can delete threads" ON public.admin_threads
FOR DELETE
USING (
  is_server_admin()
);

-- 3. admin_messages table
CREATE TABLE public.admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.admin_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Can view messages in readable threads" ON public.admin_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admin_threads
    WHERE id = admin_messages.thread_id
  )
);

CREATE POLICY "Can insert messages in readable threads" ON public.admin_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_threads
    WHERE id = admin_messages.thread_id
  ) AND sender_id = auth.uid()
);

CREATE POLICY "Sender or Admin can soft delete messages" ON public.admin_messages
FOR UPDATE
USING (
  (sender_id = auth.uid() OR is_server_admin())
)
WITH CHECK (
  is_deleted = true AND content = ''
);

-- 4. Trigger to update last_message_at on admin_threads
CREATE OR REPLACE FUNCTION public.handle_admin_message_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_threads
  SET last_message_at = NEW.created_at
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_admin_message_inserted
AFTER INSERT ON public.admin_messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_admin_message_inserted();

-- 5. admin_thread_reads table
CREATE TABLE public.admin_thread_reads (
  thread_id uuid NOT NULL REFERENCES public.admin_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.admin_thread_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reads" ON public.admin_thread_reads
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own reads" ON public.admin_thread_reads
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own reads" ON public.admin_thread_reads
FOR UPDATE
USING (user_id = auth.uid());

-- 6. RPC: Mark thread read
CREATE OR REPLACE FUNCTION public.mark_admin_thread_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_thread_reads (thread_id, user_id, last_read_at)
  VALUES (p_thread_id, auth.uid(), now())
  ON CONFLICT (thread_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$$;

-- 7. RPC: Get unread count
CREATE OR REPLACE FUNCTION public.get_admin_unread_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(t.id)::integer
  FROM public.admin_threads t
  LEFT JOIN public.admin_thread_reads r ON r.thread_id = t.id AND r.user_id = p_user_id
  WHERE (
    (t.type = 'announcement' AND (is_server_admin() OR is_active_gm(p_user_id)))
    OR
    (t.type = 'dm' AND (is_server_admin() OR p_user_id = t.gm_id))
  )
  AND (r.last_read_at IS NULL OR t.last_message_at > r.last_read_at);
$$;

-- 8. RPC: List active GMs for admin dropdown
CREATE OR REPLACE FUNCTION public.admin_list_active_gms()
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  JOIN public.channels c ON c.gm_id = p.id
  WHERE is_server_admin() AND c.is_archived = false
  ORDER BY p.display_name;
$$;

-- 9. Update push trigger to use TG_TABLE_NAME and attach to admin_messages
CREATE OR REPLACE FUNCTION public.handle_new_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := public.push_notification_config_value('PUSH_FUNCTION_URL');
  v_secret text := public.push_notification_config_value('PUSH_INTERNAL_SECRET');
  v_request_id bigint;
BEGIN
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'push_notification_config not set; skipping push for % %', TG_TABLE_NAME, NEW.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := v_url,
    body := jsonb_build_object('table', TG_TABLE_NAME, 'message_id', NEW.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 15000
  ) INTO v_request_id;

  INSERT INTO public.push_invocation_log (entity_id, event_kind, request_id)
  VALUES (NEW.id, CASE WHEN TG_TABLE_NAME = 'admin_messages' THEN 'admin_message' ELSE 'message' END, v_request_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_admin_message_inserted_push
AFTER INSERT ON public.admin_messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_message_notification();
