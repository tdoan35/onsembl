-- Migration: Create RLS policies for user_profiles table
-- Purpose: Ensure users can only access and modify their own profile

-- Enable Row Level Security on user_profiles table
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  USING (id = auth.uid());

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Policy: Users can insert their own profile (only for their own user ID)
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- Note: No DELETE policy as profiles should be cascade deleted with auth.users
-- If you need to allow profile deletion, uncomment below:
-- CREATE POLICY "Users can delete own profile"
--   ON public.user_profiles
--   FOR DELETE
--   USING (id = auth.uid());

-- Add comment for documentation
COMMENT ON POLICY "Users can view own profile" ON public.user_profiles IS 'Allow users to read their own profile data';
COMMENT ON POLICY "Users can update own profile" ON public.user_profiles IS 'Allow users to modify their own profile data';
COMMENT ON POLICY "Users can insert own profile" ON public.user_profiles IS 'Allow users to create their own profile on registration';