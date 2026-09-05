-- Issue #402 / SEC-2: member-authored character_sheet_url /
-- character_avatar_url skip the scheme validation channels have. A member
-- could store an exotic-scheme value (javascript:, data:, …) that renders as
-- a "Sheet" link every other member sees. React 19 blocks javascript: hrefs,
-- so this is defense-in-depth and a DB-contract consistency fix: identical
-- member-editable fields should play by the same rules on both tables.
--
-- Scheme-less relative storage paths (the app's canonical avatar format)
-- and absolute http(s) URLs keep passing, matching the refined
-- enforce_url_scheme contract (20260901195145 + 20260902091743).

-- Shared WHATWG-normalized scheme check: true unless the value carries an
-- explicit non-http(s) scheme. Normalization mirrors WHATWG URL parsing
-- preprocessing (tabs/newlines/CR removed everywhere, leading/trailing
-- C0-or-space trimmed) so "  javascript:alert(1)" cannot slip through.
CREATE OR REPLACE FUNCTION public.url_scheme_allowed(p_url TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := regexp_replace(
    p_url,
    '[\t\n\r]|^[[:space:][:cntrl:]]+|[[:space:][:cntrl:]]+$',
    '',
    'g'
  );
  RETURN NOT (v_normalized ~* '^[a-z][a-z0-9+.-]*:')
      OR v_normalized ~* '^https?://';
END;
$$;

-- Route the existing channels trigger through the shared helper (same
-- behavior, single source of truth).
CREATE OR REPLACE FUNCTION public.enforce_url_scheme()
RETURNS TRIGGER AS $$
DECLARE
  v_url TEXT;
BEGIN
  FOREACH v_url IN ARRAY ARRAY[
    NEW.map_url, NEW.resources_url, NEW.safety_tools_url, NEW.avatar_url
  ] LOOP
    IF v_url IS NOT NULL AND v_url <> ''
       AND NOT public.url_scheme_allowed(v_url) THEN
      RAISE EXCEPTION 'URLs must start with http:// or https://';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Same contract for the member-authored character URLs.
CREATE OR REPLACE FUNCTION public.enforce_member_url_scheme()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.character_sheet_url IS NOT NULL AND NEW.character_sheet_url <> ''
     AND NOT public.url_scheme_allowed(NEW.character_sheet_url) THEN
    RAISE EXCEPTION 'URLs must start with http:// or https://';
  END IF;
  IF NEW.character_avatar_url IS NOT NULL AND NEW.character_avatar_url <> ''
     AND NOT public.url_scheme_allowed(NEW.character_avatar_url) THEN
    RAISE EXCEPTION 'URLs must start with http:// or https://';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS channel_members_url_scheme ON channel_members;
CREATE TRIGGER channel_members_url_scheme
  BEFORE INSERT OR UPDATE ON channel_members
  FOR EACH ROW EXECUTE FUNCTION enforce_member_url_scheme();

-- Both functions are owner-only (called from trigger bodies); revoke the
-- default grants so the SEC-1 grant-sweep invariant (no anon/PUBLIC EXECUTE
-- in public) keeps holding for every new function.
REVOKE ALL ON FUNCTION public.url_scheme_allowed(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_member_url_scheme()
  FROM PUBLIC, anon, authenticated, service_role;

-- Scrub any pre-existing member-authored values that would now be rejected
-- (they are plain links; dropping them loses nothing structural). Relative
-- storage paths and http(s) values are untouched.
UPDATE channel_members
SET character_sheet_url = NULL
WHERE character_sheet_url IS NOT NULL
  AND character_sheet_url <> ''
  AND NOT public.url_scheme_allowed(character_sheet_url);
UPDATE channel_members
SET character_avatar_url = NULL
WHERE character_avatar_url IS NOT NULL
  AND character_avatar_url <> ''
  AND NOT public.url_scheme_allowed(character_avatar_url);
