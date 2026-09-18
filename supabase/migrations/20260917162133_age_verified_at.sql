-- Age-attestation record. The sign-in checkbox gates the Google OAuth flow
-- client-side (16+); this stores the timestamp of that self-attestation the
-- first time a confirmed, authenticated user loads the app. It is an assertion
-- the user made, not verified proof of age. Nullable on purpose — accounts that
-- predate the gate stay NULL rather than being backfilled with a value we never
-- actually collected.

ALTER TABLE public.profiles ADD COLUMN age_verified_at timestamptz;

COMMENT ON COLUMN public.profiles.age_verified_at IS
  'When the user attested they meet the minimum age (16+). Written once by confirm_age(); browser roles cannot set, rewrite, or clear it. NULL = not recorded.';

-- Browser roles may never write the evidence column directly: the existing
-- profiles UPDATE policy lets a user edit their own row, so without this guard a
-- client could backdate or clear the stamp.
--
-- A role check cannot distinguish the sanctioned writer: confirm_age() is
-- SECURITY DEFINER and runs as postgres *with auth.uid() still set* (same shape
-- as the is_suspended guard in 20260826120000), so the RPC marks its own
-- transaction instead. Anything that does not carry the marker leaves the
-- existing value untouched — a client write to an unrelated column, or a client
-- trying to set this one, simply cannot move it.
CREATE OR REPLACE FUNCTION public.handle_age_verified_at_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.age_verified_at IS DISTINCT FROM OLD.age_verified_at
     AND COALESCE(current_setting('app.age_confirmation', true), '') <> 'on'
  THEN
    NEW.age_verified_at := OLD.age_verified_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_age_verified_at_change ON public.profiles;
CREATE TRIGGER on_age_verified_at_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_age_verified_at_change();

-- Self-only, idempotent: stamps the timestamp once and never rewrites it.
CREATE OR REPLACE FUNCTION public.confirm_age()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Marks this transaction as the sanctioned writer for the guard trigger. The
  -- setting is transaction-local, so it never leaks past this call.
  PERFORM set_config('app.age_confirmation', 'on', true);

  UPDATE public.profiles
     SET age_verified_at = COALESCE(age_verified_at, now())
   WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_age() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_age() TO authenticated;
