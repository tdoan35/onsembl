-- Add user_id field to agents table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'agents' AND column_name = 'user_id') THEN
        ALTER TABLE public.agents ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add user_id field to commands table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'commands' AND column_name = 'user_id') THEN
        ALTER TABLE public.commands ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for performance on user_id fields
CREATE INDEX IF NOT EXISTS agents_user_id_idx ON public.agents(user_id);
CREATE INDEX IF NOT EXISTS commands_user_id_idx ON public.commands(user_id);

-- Update RLS policies for agents table
DROP POLICY IF EXISTS "Users can view their own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can insert their own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can update their own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can delete their own agents" ON public.agents;
DROP POLICY IF EXISTS "Service role can manage all agents" ON public.agents;

-- Enable RLS on agents if not already enabled
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Create new RLS policies for agents
CREATE POLICY "Users can view their own agents" ON public.agents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own agents" ON public.agents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agents" ON public.agents
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agents" ON public.agents
    FOR DELETE USING (auth.uid() = user_id);

-- Service role can manage all agents (for backend operations)
CREATE POLICY "Service role can manage all agents" ON public.agents
    FOR ALL USING (auth.role() = 'service_role');

-- Update RLS policies for commands table
DROP POLICY IF EXISTS "Users can view their own commands" ON public.commands;
DROP POLICY IF EXISTS "Users can insert their own commands" ON public.commands;
DROP POLICY IF EXISTS "Users can update their own commands" ON public.commands;
DROP POLICY IF EXISTS "Users can delete their own commands" ON public.commands;
DROP POLICY IF EXISTS "Service role can manage all commands" ON public.commands;

-- Enable RLS on commands if not already enabled
ALTER TABLE public.commands ENABLE ROW LEVEL SECURITY;

-- Create new RLS policies for commands
CREATE POLICY "Users can view their own commands" ON public.commands
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own commands" ON public.commands
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own commands" ON public.commands
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own commands" ON public.commands
    FOR DELETE USING (auth.uid() = user_id);

-- Service role can manage all commands (for backend operations)
CREATE POLICY "Service role can manage all commands" ON public.commands
    FOR ALL USING (auth.role() = 'service_role');

-- Add comments
COMMENT ON COLUMN public.agents.user_id IS 'User ID from auth.users who owns this agent';
COMMENT ON COLUMN public.commands.user_id IS 'User ID from auth.users who created this command';