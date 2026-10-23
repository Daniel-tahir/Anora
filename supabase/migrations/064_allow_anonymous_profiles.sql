-- ============================================================================
-- ANORA — Allow Nullable Email for Anonymous Auth Profiles
-- Migration 064: Fix Database Error on signInAnonymously
-- ============================================================================

-- 1. Drop NOT NULL constraint on public.profiles.email to support anonymous users
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

-- 2. Ensure handle_new_user trigger function handles anonymous sign-ups cleanly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
