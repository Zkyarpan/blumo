-- Migration 11: add INSERT policy on profiles so users can upsert their own row.
-- The handle_new_user() trigger (security definer) creates the row on sign-up,
-- but if it is delayed or silently fails, the onboarding service must be able
-- to create the row as a fallback. This policy allows a user to insert only
-- their own profile row (id = auth.uid()).

CREATE POLICY "profiles: owner insert"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());
