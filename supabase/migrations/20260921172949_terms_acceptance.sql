-- Issue #562 P2-2: record Terms of Service / Privacy Policy acceptance.
--
-- The sign-in checkbox covers age and terms together, but only the age
-- attestation was ever recorded server-side. These columns are the terms
-- half: when the acceptance was made and which version was accepted, so a
-- terms change can re-prompt (ReConsentGate) with evidence owned by the DB.
--
-- The guard mirrors handle_age_verified_at_change (20260917162133): a
-- separate trigger + transaction-local marker, so the age function and its
-- pgTAP privilege assertions stay untouched. Unlike confirm_age, re-stamping
-- is the point here — a version bump must overwrite, not COALESCE.

ALTER TABLE public.profiles
  ADD COLUMN terms_accepted_at timestamptz,
  ADD COLUMN terms_version text;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS
  'When the user last accepted the Terms of Service and Privacy Policy. Written only by confirm_terms(); browser roles cannot set, rewrite, or clear it. NULL = never accepted.';
COMMENT ON COLUMN public.profiles.terms_version IS
  'Terms version the user last accepted (matches the client CURRENT_TERMS_VERSION). Re-stamped on every re-accept. NULL = never accepted.';

-- Browser roles may never write the evidence columns directly: the existing
-- profiles UPDATE policy lets a user edit their own row, so without this
-- guard a client could backdate, forge, or clear the acceptance.
--
-- The guard keys off a transaction-local marker that confirm_terms() sets
-- (see the age column guard for why a marker beats a role check).
CREATE OR REPLACE FUNCTION public.handle_terms_acceptance_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at
      OR NEW.terms_version IS DISTINCT FROM OLD.terms_version)
     AND COALESCE(current_setting('app.terms_confirmation', true), '') <> 'on'
  THEN
    NEW.terms_accepted_at := OLD.terms_accepted_at;
    NEW.terms_version := OLD.terms_version;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_terms_acceptance_change ON public.profiles;
CREATE TRIGGER on_terms_acceptance_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_terms_acceptance_change();

-- Trigger helper: wired via CREATE TRIGGER only, so no API role needs direct
-- EXECUTE (house convention, see 20260907093802_sec1_extend_grant_sweep.sql).
REVOKE ALL ON FUNCTION public.handle_terms_acceptance_change()
  FROM PUBLIC, anon, authenticated, service_role;

-- Records (or re-records, on a version bump) the caller's acceptance of the
-- given terms version. Self-only: the caller can stamp no row but their own.
CREATE OR REPLACE FUNCTION public.confirm_terms(p_version text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_version IS NULL OR btrim(p_version) = '' OR char_length(p_version) > 32 THEN
    RAISE EXCEPTION 'Invalid terms version';
  END IF;

  -- Marks this transaction as the sanctioned writer for the guard trigger.
  -- The setting is transaction-local, so it never leaks past this call.
  PERFORM set_config('app.terms_confirmation', 'on', true);

  UPDATE public.profiles
     SET terms_accepted_at = now(),
         terms_version = p_version
   WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_terms(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_terms(TEXT) TO authenticated;
