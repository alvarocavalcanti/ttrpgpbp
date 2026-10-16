-- #674 Phase 3b: push notifications for join requests.
--
-- Two events, one source row:
--   * a new pending application       -> the channel's GM    (join_request)
--   * the GM's decision on it         -> the applicant       (join_request_decided)
--
-- The payload carries the phase explicitly rather than letting the edge function
-- infer it from the row's status. That matters for retries: a failed 'received'
-- push retried after the GM already decided would otherwise re-read a decided
-- row and notify the applicant instead of the GM — a mis-route, not just a
-- duplicate.
--
-- Gating stays where it is for every other push: the edge function drops
-- recipients whose notification_preferences.push_enabled is false. These events
-- deliberately do NOT consult the per-channel message prefs — a join request is
-- not a message, and a GM who muted message noise still wants their work queue.

-- ==========================================
-- 1. The trigger
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_join_request_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := public.push_notification_config_value('PUSH_FUNCTION_URL');
  v_secret text := public.push_notification_config_value('PUSH_INTERNAL_SECRET');
  v_request_id bigint;
  v_received boolean := TG_OP = 'INSERT';
BEGIN
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'push_notification_config not set; skipping push for join request %', NEW.id;
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'table', 'channel_join_requests',
      'request_id', NEW.id,
      'phase', CASE WHEN v_received THEN 'received' ELSE 'decided' END
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 15000
  ) INTO v_request_id;

  INSERT INTO public.push_invocation_log (entity_id, event_kind, request_id)
  VALUES (NEW.id, CASE WHEN v_received THEN 'join_request' ELSE 'join_request_decided' END, v_request_id);

  RETURN NEW;
END;
$$;

-- The triggers themselves live in the following migration: this file is
-- functions only, so the pre-commit types guard can see that neither function
-- can change the generated types (a trigger helper is absent from them, and
-- retry_failed_push_invocations keeps its signature). Mixed with CREATE TRIGGER
-- it cannot, and would demand an unstageable byte-identical types file.

-- Trigger helper: never directly callable by an API role (grant-sweep class
-- guard, matching the other push trigger functions).
REVOKE ALL ON FUNCTION public.handle_join_request_notification()
  FROM PUBLIC, anon, authenticated, service_role;

-- ==========================================
-- 2. Retry routing
-- ==========================================

-- Body-only replacement of the existing function, plus the two new branches.
-- The retry reconstructs the payload from event_kind + entity_id, so a new kind
-- without a branch here would fall into the `else` and be re-posted as a
-- `messages` payload — the edge function would 404 on an id that is not a
-- message, and the notification would be lost.
CREATE OR REPLACE FUNCTION public.retry_failed_push_invocations(p_max int default 50)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := public.push_notification_config_value('PUSH_FUNCTION_URL');
  v_secret text := public.push_notification_config_value('PUSH_INTERNAL_SECRET');
  r record;
  v_request_id bigint;
  v_count int := 0;
BEGIN
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'push_notification_config not set; cannot retry';
    RETURN 0;
  END IF;

  FOR r IN
    SELECT i.id, i.event_kind, i.entity_id, i.attempt
    FROM public.push_invocation_log i
    JOIN net._http_response resp ON resp.id = i.request_id
    WHERE i.retried_at IS NULL
      AND i.attempt < 5
      AND (resp.status_code IS NULL OR resp.status_code >= 400 OR resp.timed_out)
      AND i.created_at > now() - interval '7 days'
    ORDER BY i.created_at DESC
    LIMIT greatest(p_max, 0)
  LOOP
    IF r.event_kind = 'channel_members' THEN
      SELECT net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'channel_members', 'member_id', r.entity_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 15000
      ) INTO v_request_id;
    ELSIF r.event_kind = 'admin_message' THEN
      SELECT net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'admin_messages', 'message_id', r.entity_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 15000
      ) INTO v_request_id;
    ELSIF r.event_kind IN ('join_request', 'join_request_decided') THEN
      SELECT net.http_post(
        url := v_url,
        body := jsonb_build_object(
          'table', 'channel_join_requests',
          'request_id', r.entity_id,
          'phase', CASE WHEN r.event_kind = 'join_request' THEN 'received' ELSE 'decided' END
        ),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 15000
      ) INTO v_request_id;
    ELSE
      SELECT net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'messages', 'message_id', r.entity_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 15000
      ) INTO v_request_id;
    END IF;

    INSERT INTO public.push_invocation_log (request_id, event_kind, entity_id, attempt)
    VALUES (v_request_id, r.event_kind, r.entity_id, r.attempt + 1);

    UPDATE public.push_invocation_log
      SET retried_at = now()
      WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_failed_push_invocations(integer)
  FROM public, anon, authenticated, service_role;
