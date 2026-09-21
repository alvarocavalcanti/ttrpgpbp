-- Issue #562 P1, review follow-up: neutralize Markdown in system alerts.
--
-- System-alert bodies render as Markdown in the admin inbox, but display
-- names, channel names, and report reasons are user-controlled: a crafted
-- name like `[x](https://evil)` would otherwise render as a live link (or
-- image) inside a safety alert. escape_markdown() backslash-escapes the
-- Markdown-significant characters of interpolated labels; the generated
-- links themselves (UUID paths) are system-built and stay untouched.
--
-- This file also makes alert delivery best-effort: the AFTER INSERT trigger
-- runs inside the abuse_reports transaction, so an alert failure must never
-- abort (and thereby delete) the report — the report row is the durable
-- record.

-- Backslash-escapes Markdown metacharacters: code, emphasis, links, images,
-- headers, and quotes. Plain text passes through unchanged (verified in
-- pgTAP). Newlines are left alone: with every construct escaped, a stray
-- newline is cosmetic, never executable.
CREATE OR REPLACE FUNCTION public.escape_markdown(p_text text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $func$
  SELECT regexp_replace(
    COALESCE(p_text, ''),
    $$([\\`*_\[\]()#!>])$$,
    $$\\\1$$,
    'g'
  );
$func$;

COMMENT ON FUNCTION public.escape_markdown(TEXT) IS
  'Backslash-escapes Markdown metacharacters in user-controlled labels before they are interpolated into system-alert bodies.';

REVOKE ALL ON FUNCTION public.escape_markdown(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

-- Same trigger, hardened: labels escaped, delivery wrapped so a failure
-- warns instead of rolling back the report. CREATE OR REPLACE keeps the
-- existing trigger wiring and grants.
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
         ELSE '[' || public.escape_markdown(COALESCE(v_reporter, 'Unknown user')) || '](/admin?user=' || NEW.reporter_id || ')' END || E'\n'
    || '- **Reported user:** ' || CASE WHEN NEW.reported_user_id IS NULL THEN 'Unknown user'
         ELSE '[' || public.escape_markdown(COALESCE(v_reported, 'Unknown user')) || '](/admin?user=' || NEW.reported_user_id || ')' END || E'\n'
    || '- **Channel:** ' || CASE WHEN NEW.channel_id IS NULL THEN '—'
         ELSE '[' || public.escape_markdown(COALESCE(v_channel, 'Unknown channel')) || '](/admin/channels/' || NEW.channel_id || ')' END || E'\n'
    || '- **Reason:** ' || public.escape_markdown(NEW.reason) || E'\n'
    || '- **Status:** pending — open the report in the [Reports tab](/admin).';

  BEGIN
    PERFORM public.post_system_message(v_body);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to post abuse-report system alert: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
