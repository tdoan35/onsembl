-- Migration: Create user_profiles table
-- Purpose: Store extended user profile information for the application

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  full_name TEXT,
  bio TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add check constraint for username format (alphanumeric + underscore, 3-30 chars)
ALTER TABLE public.user_profiles
ADD CONSTRAINT username_format CHECK (
  username IS NULL OR (
    LENGTH(username) BETWEEN 3 AND 30 AND
    username ~ '^[a-zA-Z0-9_]+$'
  )
);

-- Create unique index on username for faster lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username ON public.user_profiles(username) WHERE username IS NOT NULL;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.user_profiles IS 'Extended user profile information for authenticated users';
COMMENT ON COLUMN public.user_profiles.id IS 'Foreign key to auth.users.id';
COMMENT ON COLUMN public.user_profiles.username IS 'Optional unique username for display';
COMMENT ON COLUMN public.user_profiles.avatar_url IS 'URL to user avatar image';
COMMENT ON COLUMN public.user_profiles.full_name IS 'User full name for display';
COMMENT ON COLUMN public.user_profiles.bio IS 'User biography or description';
COMMENT ON COLUMN public.user_profiles.preferences IS 'JSON object storing user preferences';