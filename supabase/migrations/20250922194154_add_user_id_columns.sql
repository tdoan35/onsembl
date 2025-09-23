-- Migration: Add user_id columns to existing tables
-- Purpose: Associate agents, commands, and audit logs with authenticated users

-- Add user_id column to agents table
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id column to commands table
ALTER TABLE public.commands
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id column to audit_logs table
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create indexes on user_id columns for performance
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON public.agents(user_id);
CREATE INDEX IF NOT EXISTS idx_commands_user_id ON public.commands(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

-- For existing data, you may want to set a default user_id
-- This is commented out as it requires a valid user_id from your auth.users table
-- UPDATE public.agents SET user_id = 'default-user-uuid' WHERE user_id IS NULL;
-- UPDATE public.commands SET user_id = 'default-user-uuid' WHERE user_id IS NULL;
-- UPDATE public.audit_logs SET user_id = 'default-user-uuid' WHERE user_id IS NULL;

-- After migration and data update, you may want to add NOT NULL constraints
-- ALTER TABLE public.agents ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE public.commands ALTER COLUMN user_id SET NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.agents.user_id IS 'Owner of the agent (foreign key to auth.users.id)';
COMMENT ON COLUMN public.commands.user_id IS 'User who executed the command';
COMMENT ON COLUMN public.audit_logs.user_id IS 'User involved in the audit event';