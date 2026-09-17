-- Age-confirmation evidence. The sign-in checkbox gates the Google OAuth flow
-- client-side (16+); this stores the server-side timestamp the first time a
-- confirmed, authenticated user loads the app. Nullable on purpose — accounts
-- that predate the gate stay NULL rather than being backfilled with a value we
-- never actually collected.

ALTER TABLE public.profiles ADD COLUMN age_verified_at timestamptz;

COMMENT ON COLUMN public.profiles.age_verified_at IS
  'When the user confirmed they meet the minimum age (16+), stamped once via confirm_age(). NULL = not recorded.';

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

  UPDATE public.profiles
     SET age_verified_at = COALESCE(age_verified_at, now())
   WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_age() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_age() TO authenticated;
