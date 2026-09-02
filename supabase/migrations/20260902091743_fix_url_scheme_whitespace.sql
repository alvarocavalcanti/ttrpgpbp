-- CodeRabbit follow-up on #364 (issue #348 fix): enforce_url_scheme anchored
-- its scheme regex at character zero, so a tab- or newline- (or space-)
-- prefixed 'javascript:' / 'data:' value passed validation. WHATWG URL parsing
-- strips leading/trailing C0-or-space and removes all tabs/newlines before the
-- scheme is parsed, and the affected channels columns render into href/src
-- attributes — so those values would still navigate/execute in the browser.
--
-- Fix: validate a normalized copy of the value (tabs/newlines removed
-- everywhere, leading/trailing C0-or-space trimmed). The stored value is
-- unchanged; only the scheme check normalizes. Scheme-less relative storage
-- paths and absolute http(s) URLs keep passing; nothing valid regresses.

CREATE OR REPLACE FUNCTION public.enforce_url_scheme()
RETURNS TRIGGER AS $$
DECLARE
  v_url TEXT;
  v_normalized TEXT;
BEGIN
  FOREACH v_url IN ARRAY ARRAY[
    NEW.map_url, NEW.resources_url, NEW.safety_tools_url, NEW.avatar_url
  ] LOOP
    IF v_url IS NULL OR v_url = '' THEN
      CONTINUE;
    END IF;

    -- WHATWG URL parser preprocessing: remove tab/newline/CR chars anywhere,
    -- trim leading/trailing C0 controls or spaces. Validate the normalized
    -- copy; the stored value is untouched.
    v_normalized := regexp_replace(
      v_url,
      '[\t\n\r]|^[[:space:][:cntrl:]]+|[[:space:][:cntrl:]]+$',
      '',
      'g'
    );

    IF v_normalized ~* '^[a-z][a-z0-9+.-]*:'
       AND v_normalized !~* '^https?://' THEN
      RAISE EXCEPTION 'URLs must start with http:// or https://';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
