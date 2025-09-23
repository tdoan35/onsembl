-- Migration: Create RLS policies for agents table
-- Purpose: Ensure users can only access and manage their own agents

-- Enable Row Level Security on agents table
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can insert own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can update own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can delete own agents" ON public.agents;

-- Policy: Users can view their own agents
CREATE POLICY "Users can view own agents"
  ON public.agents
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can create agents for themselves
CREATE POLICY "Users can insert own agents"
  ON public.agents
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own agents
CREATE POLICY "Users can update own agents"
  ON public.agents
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own agents
CREATE POLICY "Users can delete own agents"
  ON public.agents
  FOR DELETE
  USING (user_id = auth.uid());

-- Add comments for documentation
COMMENT ON POLICY "Users can view own agents" ON public.agents IS 'Allow users to see only their own agents';
COMMENT ON POLICY "Users can insert own agents" ON public.agents IS 'Allow users to create agents assigned to themselves';
COMMENT ON POLICY "Users can update own agents" ON public.agents IS 'Allow users to modify their own agents';
COMMENT ON POLICY "Users can delete own agents" ON public.agents IS 'Allow users to remove their own agents';