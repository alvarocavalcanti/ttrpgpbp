-- Issue #824: polls in the Messages inbox.
--
-- A poll is an admin_threads row of type 'poll' addressed to an audience
-- ('all_users' | 'gms'), reusing the existing inbox, read markers, unread
-- badge and push pipeline. The poll's own schema hangs off that thread:
--
--   admin_polls          1:1 poll metadata (optional description, closed_at)
--   admin_poll_questions ordered questions with 2-5 options for choice types
--   admin_poll_responses one final submission per user (UNIQUE thread,user)
--   admin_poll_answers   one answer per question per response
--
-- Every mutation goes through a SECURITY DEFINER RPC (create_admin_poll,
-- submit_admin_poll_response, close_admin_poll) and the admin report is
-- aggregated server-side (get_admin_poll_report) so per-user attribution never
-- reaches the browser.
--
-- Requires the 'poll' enum value from 20261125184906 (a new enum value cannot
-- be used in the transaction that adds it).

-- ===== Thread shape =====

-- Polls carry a subject and an audience like announcements, no participant.
ALTER TABLE public.admin_threads DROP CONSTRAINT admin_threads_type_check;
ALTER TABLE public.admin_threads ADD CONSTRAINT admin_threads_type_check CHECK (
  (type = 'announcement' AND subject IS NOT NULL AND gm_id IS NULL AND audience IS NOT NULL) OR
  (type = 'poll' AND subject IS NOT NULL AND gm_id IS NULL AND audience IS NOT NULL) OR
  (type = 'dm' AND subject IS NULL AND gm_id IS NOT NULL AND audience IS NULL) OR
  (type = 'system' AND subject IS NOT NULL AND gm_id IS NULL AND audience IS NULL)
);

-- Poll visibility mirrors announcement visibility. Permissive policies OR
-- together, so a separate policy leaves the announcement/DM ones untouched.
CREATE POLICY "Audience can view polls" ON public.admin_threads
FOR SELECT
USING (
  type = 'poll' AND (
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
-- No INSERT policy for polls: only create_admin_poll (SECURITY DEFINER) writes
-- them, so a browser client cannot publish a poll with a forged audience.

-- ===== Messages in a poll thread =====

-- The thread's first message is the intro note (or the subject). Reads mirror
-- the poll audience; inserts stay admin-only (same rule as announcements).
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
          t.type IN ('announcement', 'poll')
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
          t.type IN ('announcement', 'poll')
          AND is_server_admin()
        )
        OR (
          t.type = 'system'
          AND is_server_admin()
        )
      )
  ) AND sender_id = auth.uid()
);

-- ===== Poll tables =====

CREATE TABLE public.admin_polls (
  thread_id uuid PRIMARY KEY REFERENCES public.admin_threads(id) ON DELETE CASCADE,
  description text,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_polls_description_check CHECK (
    description IS NULL OR char_length(description) <= 2000
  )
);

CREATE TABLE public.admin_poll_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.admin_polls(thread_id) ON DELETE CASCADE,
  position integer NOT NULL,
  prompt text NOT NULL,
  question_type text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT admin_poll_questions_position_check CHECK (position >= 0),
  CONSTRAINT admin_poll_questions_prompt_check CHECK (
    char_length(btrim(prompt)) BETWEEN 1 AND 300
  ),
  CONSTRAINT admin_poll_questions_type_check CHECK (
    question_type IN ('short_text', 'single_choice', 'multi_choice')
  ),
  -- Label trimming/length is enforced by create_admin_poll: a CHECK cannot hold
  -- a subquery over the array elements.
  CONSTRAINT admin_poll_questions_options_check CHECK (
    (question_type = 'short_text' AND options = '[]'::jsonb)
    OR (
      question_type IN ('single_choice', 'multi_choice')
      AND jsonb_typeof(options) = 'array'
      AND jsonb_array_length(options) BETWEEN 2 AND 5
    )
  ),
  UNIQUE (thread_id, position)
);

CREATE TABLE public.admin_poll_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.admin_polls(thread_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  -- One final submission per user.
  UNIQUE (thread_id, user_id)
);

CREATE TABLE public.admin_poll_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.admin_poll_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.admin_poll_questions(id) ON DELETE CASCADE,
  selected_options integer[] NOT NULL DEFAULT '{}',
  text_answer text,
  CONSTRAINT admin_poll_answers_text_check CHECK (
    text_answer IS NULL OR char_length(text_answer) <= 500
  ),
  UNIQUE (response_id, question_id)
);

-- UNIQUE (thread_id, user_id) already indexes thread lookups, so the responses
-- table needs no extra index. Answers are looked up by question for the report.
CREATE INDEX admin_poll_answers_question_idx ON public.admin_poll_answers(question_id);

-- Grants are explicit (20261021091717): no anon access at any level.
REVOKE ALL ON TABLE public.admin_polls FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.admin_poll_questions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.admin_poll_responses FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.admin_poll_answers FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_polls TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_poll_questions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_poll_responses TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_poll_answers TO authenticated, service_role;

ALTER TABLE public.admin_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_poll_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_poll_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_poll_answers ENABLE ROW LEVEL SECURITY;

-- Read access follows the poll's audience (same predicate as the thread RLS).
-- No INSERT/UPDATE/DELETE policies: the RPCs are the only writers.
CREATE POLICY "Audience can view polls" ON public.admin_polls
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admin_threads t
    WHERE t.id = admin_polls.thread_id
      AND t.type = 'poll'
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
);

CREATE POLICY "Audience can view poll questions" ON public.admin_poll_questions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_polls p
    JOIN public.admin_threads t ON t.id = p.thread_id
    WHERE p.thread_id = admin_poll_questions.thread_id
      AND t.type = 'poll'
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
);

-- Respondents read only their own submission; the server admin's only read
-- path is the aggregated get_admin_poll_report RPC, so per-user attribution
-- never reaches a browser session. Raw rows stay in the database.
CREATE POLICY "Own poll response" ON public.admin_poll_responses
FOR SELECT
USING (
  user_id = auth.uid()
);

CREATE POLICY "Own poll answers" ON public.admin_poll_answers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admin_poll_responses r
    WHERE r.id = admin_poll_answers.response_id
      AND r.user_id = auth.uid()
  )
);

-- ===== Read markers and unread badge cover poll threads =====

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
          t.type IN ('announcement', 'poll')
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
      t.type IN ('announcement', 'poll')
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
      t.type IN ('announcement', 'poll')
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

-- ===== Poll RPCs =====

-- Publishes a poll: thread + poll row + ordered questions + intro message, and
-- marks it read for the author so their own poll is not an unread dot.
CREATE OR REPLACE FUNCTION public.create_admin_poll(
  p_subject text,
  p_audience public.admin_thread_audience,
  p_description text,
  p_questions jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id uuid;
  v_subject text := btrim(COALESCE(p_subject, ''));
  v_description text := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_question jsonb;
  v_options jsonb;
  v_option text;
  v_labels jsonb;
  v_prompt text;
  v_type text;
  v_required boolean;
  v_position integer := 0;
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF char_length(v_subject) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'A subject is required (100 characters max).';
  END IF;

  IF p_audience IS NULL THEN
    RAISE EXCEPTION 'An audience is required.';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 2000 THEN
    RAISE EXCEPTION 'The description must be 2000 characters max.';
  END IF;

  IF p_questions IS NULL
     OR jsonb_typeof(p_questions) <> 'array'
     OR jsonb_array_length(p_questions) < 1 THEN
    RAISE EXCEPTION 'A poll needs at least one question.';
  END IF;

  -- Validate everything before writing, so a bad question leaves nothing behind.
  FOR v_question IN SELECT q.value FROM jsonb_array_elements(p_questions) AS q(value) LOOP
    IF jsonb_typeof(v_question) <> 'object' THEN
      RAISE EXCEPTION 'Invalid question.';
    END IF;

    v_prompt := btrim(COALESCE(v_question->>'prompt', ''));
    IF char_length(v_prompt) NOT BETWEEN 1 AND 300 THEN
      RAISE EXCEPTION 'A question prompt is required (300 characters max).';
    END IF;

    v_type := COALESCE(v_question->>'question_type', '');
    IF v_type NOT IN ('short_text', 'single_choice', 'multi_choice') THEN
      RAISE EXCEPTION 'Invalid question type.';
    END IF;

    IF (v_question->'is_required') IS NOT NULL
       AND jsonb_typeof(v_question->'is_required') <> 'boolean' THEN
      RAISE EXCEPTION 'Invalid required flag.';
    END IF;

    IF v_type <> 'short_text' THEN
      v_options := v_question->'options';
      IF v_options IS NULL
         OR jsonb_typeof(v_options) <> 'array'
         OR jsonb_array_length(v_options) NOT BETWEEN 2 AND 5 THEN
        RAISE EXCEPTION 'Choice questions need 2 to 5 options.';
      END IF;
      -- Every label must be a JSON string: a JSON null would otherwise pass the
      -- length check (NULL comparisons are NULL) and land as a null option.
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_options) AS o(value)
        WHERE jsonb_typeof(o.value) <> 'string'
      ) THEN
        RAISE EXCEPTION 'Each option needs a label (150 characters max).';
      END IF;
      FOR v_option IN SELECT o.value FROM jsonb_array_elements_text(v_options) AS o(value) LOOP
        IF char_length(btrim(v_option)) NOT BETWEEN 1 AND 150 THEN
          RAISE EXCEPTION 'Each option needs a label (150 characters max).';
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  INSERT INTO public.admin_threads (type, subject, audience, gm_id, created_by)
  VALUES ('poll', v_subject, p_audience, NULL, auth.uid())
  RETURNING id INTO v_thread_id;

  INSERT INTO public.admin_polls (thread_id, description)
  VALUES (v_thread_id, v_description);

  FOR v_question IN SELECT q.value FROM jsonb_array_elements(p_questions) AS q(value) LOOP
    v_type := v_question->>'question_type';
    v_options := v_question->'options';
    IF v_type = 'short_text' THEN
      v_labels := '[]'::jsonb;
    ELSE
      SELECT jsonb_agg(to_jsonb(btrim(o.value)) ORDER BY o.idx)
      INTO v_labels
      FROM jsonb_array_elements_text(v_options) WITH ORDINALITY AS o(value, idx);
    END IF;

    INSERT INTO public.admin_poll_questions
      (thread_id, position, prompt, question_type, is_required, options)
    VALUES (
      v_thread_id,
      v_position,
      btrim(v_question->>'prompt'),
      v_type,
      COALESCE((v_question->'is_required')::boolean, true),
      v_labels
    );

    v_position := v_position + 1;
  END LOOP;

  -- The intro message keeps the inbox preview meaningful and fires the existing
  -- push trigger for the target audience.
  INSERT INTO public.admin_messages (thread_id, sender_id, content)
  VALUES (v_thread_id, auth.uid(), COALESCE(v_description, v_subject));

  INSERT INTO public.admin_thread_reads (thread_id, user_id, last_read_at)
  VALUES (v_thread_id, auth.uid(), now())
  ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = now();

  RETURN v_thread_id;
END;
$$;

-- Records the caller's single final submission. Validates audience eligibility,
-- the closed state, one-submission-per-user, per-question bounds, and the
-- at-least-one-answer rule that keeps a blank submission out of the reply count.
CREATE OR REPLACE FUNCTION public.submit_admin_poll_response(
  p_thread_id uuid,
  p_answers jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll public.admin_polls%ROWTYPE;
  v_thread public.admin_threads%ROWTYPE;
  v_question public.admin_poll_questions%ROWTYPE;
  v_answer jsonb;
  v_response_id uuid;
  v_text text;
  v_selected integer[];
  v_option_count integer;
  v_answered integer := 0;
  v_idx integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- FOR SHARE: concurrent submissions take compatible locks, while a thread
  -- delete waits instead of cascading away the poll mid-submission. Same lock
  -- order as the delete (thread, then poll).
  SELECT * INTO v_thread FROM public.admin_threads
  WHERE id = p_thread_id AND type = 'poll'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll not found.';
  END IF;

  IF NOT (
    is_server_admin()
    OR (
      v_thread.audience = 'all_users'
      AND NOT is_suspended(auth.uid())
    )
    OR (v_thread.audience = 'gms' AND is_active_gm(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Poll not found.';
  END IF;

  -- Lock the poll row so a concurrent close_admin_poll cannot slip between this
  -- check and the response insert (the close then waits and re-reads closed_at).
  SELECT * INTO v_poll FROM public.admin_polls WHERE thread_id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll not found.';
  END IF;

  IF v_poll.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This poll is closed.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_poll_responses
    WHERE thread_id = p_thread_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You have already submitted a response to this poll.';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Invalid answers.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_answers) AS a(entry)
    WHERE jsonb_typeof(a.entry) <> 'object'
       OR (a.entry->>'question_id') IS NULL
       OR (a.entry->>'question_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'Invalid answers.';
  END IF;

  IF (SELECT count(*) FROM jsonb_array_elements(p_answers) AS a(entry))
     <> (SELECT count(DISTINCT (a.entry->>'question_id')::uuid) FROM jsonb_array_elements(p_answers) AS a(entry)) THEN
    RAISE EXCEPTION 'Invalid answers.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_answers) AS a(entry)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.admin_poll_questions q
      WHERE q.id = (a.entry->>'question_id')::uuid
        AND q.thread_id = p_thread_id
    )
  ) THEN
    RAISE EXCEPTION 'Invalid answers.';
  END IF;

  FOR v_question IN
    SELECT * FROM public.admin_poll_questions
    WHERE thread_id = p_thread_id
    ORDER BY position
  LOOP
    SELECT a.entry INTO v_answer
    FROM jsonb_array_elements(p_answers) AS a(entry)
    WHERE (a.entry->>'question_id')::uuid = v_question.id;

    IF v_answer IS NOT NULL
       AND (v_answer->'text_answer') IS NOT NULL
       AND jsonb_typeof(v_answer->'text_answer') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Invalid answers.';
    END IF;
    IF v_answer IS NOT NULL
       AND (v_answer->'selected_options') IS NOT NULL
       AND jsonb_typeof(v_answer->'selected_options') NOT IN ('array', 'null') THEN
      RAISE EXCEPTION 'Invalid answers.';
    END IF;

    v_text := NULLIF(btrim(COALESCE(v_answer->>'text_answer', '')), '');
    IF v_text IS NOT NULL AND char_length(v_text) > 500 THEN
      RAISE EXCEPTION 'Text answers are limited to 500 characters.';
    END IF;

    v_selected := '{}';
    IF v_answer IS NOT NULL AND jsonb_typeof(v_answer->'selected_options') = 'array' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_answer->'selected_options') AS s(entry)
        WHERE jsonb_typeof(s.entry) <> 'number' OR (s.entry)::text !~ '^[0-9]{1,6}$'
      ) THEN
        RAISE EXCEPTION 'Invalid option selection.';
      END IF;
      SELECT COALESCE(array_agg((s.entry)::text::integer), '{}')
      INTO v_selected
      FROM jsonb_array_elements(v_answer->'selected_options') AS s(entry);
    END IF;

    v_option_count := jsonb_array_length(v_question.options);

    IF v_question.question_type = 'short_text' THEN
      IF cardinality(v_selected) > 0 THEN
        RAISE EXCEPTION 'Invalid answer for a text question.';
      END IF;
      IF v_question.is_required AND v_text IS NULL THEN
        RAISE EXCEPTION 'Please answer all required questions.';
      END IF;
    ELSE
      IF v_text IS NOT NULL THEN
        RAISE EXCEPTION 'Invalid answer for a choice question.';
      END IF;
      IF (SELECT count(DISTINCT i) FROM unnest(v_selected) AS i) <> cardinality(v_selected) THEN
        RAISE EXCEPTION 'Duplicate option selection.';
      END IF;
      IF v_question.question_type = 'single_choice' AND cardinality(v_selected) > 1 THEN
        RAISE EXCEPTION 'Only one option may be selected.';
      END IF;
      FOREACH v_idx IN ARRAY v_selected LOOP
        IF v_idx >= v_option_count THEN
          RAISE EXCEPTION 'Invalid option selection.';
        END IF;
      END LOOP;
      IF v_question.is_required AND cardinality(v_selected) = 0 THEN
        RAISE EXCEPTION 'Please answer all required questions.';
      END IF;
    END IF;

    IF v_text IS NOT NULL OR cardinality(v_selected) > 0 THEN
      v_answered := v_answered + 1;
    END IF;
  END LOOP;

  IF v_answered = 0 THEN
    RAISE EXCEPTION 'Please answer at least one question before submitting.';
  END IF;

  -- The pre-check above answers the common case; this catches the real race
  -- (two tabs, a retried stalled request) with the same friendly message.
  BEGIN
    INSERT INTO public.admin_poll_responses (thread_id, user_id)
    VALUES (p_thread_id, auth.uid())
    RETURNING id INTO v_response_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You have already submitted a response to this poll.';
  END;

  FOR v_question IN
    SELECT * FROM public.admin_poll_questions
    WHERE thread_id = p_thread_id
    ORDER BY position
  LOOP
    SELECT a.entry INTO v_answer
    FROM jsonb_array_elements(p_answers) AS a(entry)
    WHERE (a.entry->>'question_id')::uuid = v_question.id;

    v_text := NULLIF(btrim(COALESCE(v_answer->>'text_answer', '')), '');
    v_selected := '{}';
    IF v_answer IS NOT NULL AND jsonb_typeof(v_answer->'selected_options') = 'array' THEN
      SELECT COALESCE(array_agg((s.entry)::text::integer ORDER BY (s.entry)::text::integer), '{}')
      INTO v_selected
      FROM jsonb_array_elements(v_answer->'selected_options') AS s(entry);
    END IF;

    IF v_text IS NOT NULL OR cardinality(v_selected) > 0 THEN
      INSERT INTO public.admin_poll_answers
        (response_id, question_id, selected_options, text_answer)
      VALUES (
        v_response_id,
        v_question.id,
        CASE WHEN v_question.question_type = 'short_text' THEN '{}'::integer[] ELSE v_selected END,
        CASE WHEN v_question.question_type = 'short_text' THEN v_text ELSE NULL END
      );
    END IF;
  END LOOP;

  -- Submitting counts as having seen the poll.
  INSERT INTO public.admin_thread_reads (thread_id, user_id, last_read_at)
  VALUES (p_thread_id, auth.uid(), now())
  ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = now();

  RETURN v_response_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_admin_poll(p_thread_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed_at timestamptz;
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.admin_polls
  SET closed_at = COALESCE(closed_at, now()),
      closed_by = COALESCE(closed_by, auth.uid())
  WHERE thread_id = p_thread_id
  RETURNING closed_at INTO v_closed_at;

  IF v_closed_at IS NULL THEN
    RAISE EXCEPTION 'Poll not found.';
  END IF;

  RETURN v_closed_at;
END;
$$;

-- Aggregated report for the server admin. Returns counts and anonymous text
-- answers only — never a responder id next to an answer.
CREATE OR REPLACE FUNCTION public.get_admin_poll_report(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll public.admin_polls%ROWTYPE;
  v_thread public.admin_threads%ROWTYPE;
  v_views integer;
  v_replies integer;
  v_questions jsonb;
BEGIN
  IF NOT is_server_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_thread FROM public.admin_threads
  WHERE id = p_thread_id AND type = 'poll';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll not found.';
  END IF;

  SELECT * INTO v_poll FROM public.admin_polls WHERE thread_id = p_thread_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll not found.';
  END IF;

  SELECT count(DISTINCT viewer)::integer INTO v_views
  FROM (
    SELECT r.user_id AS viewer
    FROM public.admin_thread_reads r
    WHERE r.thread_id = p_thread_id
      AND r.user_id <> v_thread.created_by
    UNION
    SELECT resp.user_id AS viewer
    FROM public.admin_poll_responses resp
    WHERE resp.thread_id = p_thread_id
      AND resp.user_id <> v_thread.created_by
  ) seen;

  -- Replies use the same population as views (the author excluded), so the
  -- completion rate can never exceed 100%.
  SELECT count(*)::integer INTO v_replies
  FROM public.admin_poll_responses
  WHERE thread_id = p_thread_id
    AND user_id <> v_thread.created_by;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'question_id', q.id,
      'position', q.position,
      'prompt', q.prompt,
      'question_type', q.question_type,
      'is_required', q.is_required,
      'options', q.options,
      'total_answers', (
        SELECT count(*)
        FROM public.admin_poll_answers a
        WHERE a.question_id = q.id
          AND (
            NULLIF(btrim(COALESCE(a.text_answer, '')), '') IS NOT NULL
            OR cardinality(a.selected_options) > 0
          )
      ),
      'option_counts', CASE
        WHEN q.question_type = 'short_text' THEN NULL
        ELSE (
          SELECT COALESCE(jsonb_agg(cnt ORDER BY idx), '[]'::jsonb)
          FROM (
            SELECT i AS idx, (
              SELECT count(*)
              FROM public.admin_poll_answers a
              WHERE a.question_id = q.id
                AND i = ANY (a.selected_options)
            ) AS cnt
            FROM generate_series(0, jsonb_array_length(q.options) - 1) AS i
          ) counts
        )
      END,
      'text_answers', CASE
        WHEN q.question_type <> 'short_text' THEN NULL
        ELSE (
          SELECT COALESCE(jsonb_agg(t ORDER BY submitted_at DESC, answer_id DESC), '[]'::jsonb)
          FROM (
            SELECT a.text_answer AS t, r.submitted_at, a.id AS answer_id
            FROM public.admin_poll_answers a
            JOIN public.admin_poll_responses r ON r.id = a.response_id
            WHERE a.question_id = q.id
              AND NULLIF(btrim(COALESCE(a.text_answer, '')), '') IS NOT NULL
          ) txt
        )
      END
    )
    ORDER BY q.position
  ), '[]'::jsonb)
  INTO v_questions
  FROM public.admin_poll_questions q
  WHERE q.thread_id = p_thread_id;

  RETURN jsonb_build_object(
    'thread_id', p_thread_id,
    'closed_at', v_poll.closed_at,
    'views', v_views,
    'replies', v_replies,
    'questions', v_questions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_poll(TEXT, public.admin_thread_audience, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_admin_poll(TEXT, public.admin_thread_audience, TEXT, JSONB)
  TO authenticated;

REVOKE ALL ON FUNCTION public.submit_admin_poll_response(UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_admin_poll_response(UUID, JSONB)
  TO authenticated;

REVOKE ALL ON FUNCTION public.close_admin_poll(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_admin_poll(UUID)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_poll_report(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_poll_report(UUID)
  TO authenticated;
