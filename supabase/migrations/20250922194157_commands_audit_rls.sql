-- Migration: Create RLS policies for commands and audit_logs tables
-- Purpose: Ensure users can only access their own commands and audit logs

-- Enable Row Level Security on commands table
ALTER TABLE public.commands ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view own commands" ON public.commands;
DROP POLICY IF EXISTS "Users can insert commands for own agents" ON public.commands;
DROP POLICY IF EXISTS "Users can update own commands" ON public.commands;
DROP POLICY IF EXISTS "Users can delete own commands" ON public.commands;

-- Policy: Users can view their own commands
CREATE POLICY "Users can view own commands"
  ON public.commands
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can only create commands for their own agents
CREATE POLICY "Users can insert commands for own agents"
  ON public.commands
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    agent_id IN (
      SELECT id FROM public.agents
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update their own commands
CREATE POLICY "Users can update own commands"
  ON public.commands
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own commands
CREATE POLICY "Users can delete own commands"
  ON public.commands
  FOR DELETE
  USING (user_id = auth.uid());

-- Enable Row Level Security on audit_logs table
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;

-- Policy: Users can view their own audit logs
CREATE POLICY "Users can view own audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Allow service role to insert audit logs for any user
-- Note: Normal users cannot directly insert audit logs - this is done by backend with service role
CREATE POLICY "Service role can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Add comments for documentation
COMMENT ON POLICY "Users can view own commands" ON public.commands IS 'Allow users to see only their own command history';
COMMENT ON POLICY "Users can insert commands for own agents" ON public.commands IS 'Allow users to create commands only for agents they own';
COMMENT ON POLICY "Users can update own commands" ON public.commands IS 'Allow users to modify their own commands';
COMMENT ON POLICY "Users can delete own commands" ON public.commands IS 'Allow users to remove their own commands';
COMMENT ON POLICY "Users can view own audit logs" ON public.audit_logs IS 'Allow users to see only their own audit trail';
COMMENT ON POLICY "Service role can insert audit logs" ON public.audit_logs IS 'Allow backend service to log audit events for any user';