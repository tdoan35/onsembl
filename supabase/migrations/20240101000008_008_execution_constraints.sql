-- Migration: 008_execution_constraints.sql
-- Description: Create execution_constraints table for agent runtime limits
-- Created: 2024-01-01

-- Create execution_constraints table
CREATE TABLE execution_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    max_execution_time INTEGER,
    max_memory_mb INTEGER,
    allowed_commands TEXT[],
    blocked_commands TEXT[],
    environment_variables JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT execution_constraints_max_execution_time_positive CHECK (
        max_execution_time IS NULL OR max_execution_time > 0
    ),
    CONSTRAINT execution_constraints_max_execution_time_reasonable CHECK (
        max_execution_time IS NULL OR max_execution_time <= 3600000
    ), -- max 1 hour
    CONSTRAINT execution_constraints_max_memory_positive CHECK (
        max_memory_mb IS NULL OR max_memory_mb > 0
    ),
    CONSTRAINT execution_constraints_max_memory_reasonable CHECK (
        max_memory_mb IS NULL OR max_memory_mb <= 32768
    ), -- max 32GB
    CONSTRAINT execution_constraints_commands_valid CHECK (
        (allowed_commands IS NULL OR array_length(allowed_commands, 1) <= 1000) AND
        (blocked_commands IS NULL OR array_length(blocked_commands, 1) <= 1000) AND
        NOT (allowed_commands IS NOT NULL AND blocked_commands IS NOT NULL)
    ), -- Cannot have both allow and block lists
    CONSTRAINT execution_constraints_env_vars_not_null CHECK (environment_variables IS NOT NULL),
    CONSTRAINT execution_constraints_unique_agent_or_global UNIQUE (agent_id)
);

-- Add comments
COMMENT ON TABLE execution_constraints IS 'Runtime execution constraints for agents';
COMMENT ON COLUMN execution_constraints.agent_id IS 'Reference to specific agent (NULL for global constraints)';
COMMENT ON COLUMN execution_constraints.max_execution_time IS 'Maximum execution time in milliseconds';
COMMENT ON COLUMN execution_constraints.max_memory_mb IS 'Maximum memory usage in megabytes';
COMMENT ON COLUMN execution_constraints.allowed_commands IS 'Whitelist of allowed commands (mutually exclusive with blocked_commands)';
COMMENT ON COLUMN execution_constraints.blocked_commands IS 'Blacklist of blocked commands (mutually exclusive with allowed_commands)';
COMMENT ON COLUMN execution_constraints.environment_variables IS 'Additional environment variables as JSON';

-- Create trigger for updated_at
CREATE TRIGGER update_execution_constraints_updated_at
    BEFORE UPDATE ON execution_constraints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX idx_execution_constraints_agent_id ON execution_constraints (agent_id);
CREATE INDEX idx_execution_constraints_created_at ON execution_constraints (created_at DESC);

-- Partial index for global constraints (where agent_id IS NULL)
CREATE INDEX idx_execution_constraints_global ON execution_constraints (created_at DESC)
    WHERE agent_id IS NULL;

-- Enable Row Level Security
ALTER TABLE execution_constraints ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view execution constraints" ON execution_constraints
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert execution constraints" ON execution_constraints
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update execution constraints" ON execution_constraints
    FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to delete execution constraints" ON execution_constraints
    FOR DELETE TO authenticated
    USING (true);

-- Grant permissions
GRANT ALL ON execution_constraints TO authenticated;
GRANT ALL ON execution_constraints TO service_role;

-- Create function to get effective constraints for an agent
CREATE OR REPLACE FUNCTION get_effective_constraints(p_agent_id UUID)
RETURNS TABLE (
    max_execution_time INTEGER,
    max_memory_mb INTEGER,
    allowed_commands TEXT[],
    blocked_commands TEXT[],
    environment_variables JSONB
) AS $$
BEGIN
    -- First try to get agent-specific constraints
    RETURN QUERY
    SELECT
        ec.max_execution_time,
        ec.max_memory_mb,
        ec.allowed_commands,
        ec.blocked_commands,
        ec.environment_variables
    FROM execution_constraints ec
    WHERE ec.agent_id = p_agent_id;

    -- If no agent-specific constraints found, return global constraints
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            ec.max_execution_time,
            ec.max_memory_mb,
            ec.allowed_commands,
            ec.blocked_commands,
            ec.environment_variables
        FROM execution_constraints ec
        WHERE ec.agent_id IS NULL
        ORDER BY ec.created_at DESC
        LIMIT 1;
    END IF;

    -- If no constraints found at all, return default values
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            300000::INTEGER as max_execution_time, -- 5 minutes default
            1024::INTEGER as max_memory_mb,        -- 1GB default
            NULL::TEXT[] as allowed_commands,
            NULL::TEXT[] as blocked_commands,
            '{}'::JSONB as environment_variables;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Create function to check if command is allowed
CREATE OR REPLACE FUNCTION is_command_allowed(
    p_agent_id UUID,
    p_command TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    constraints_record RECORD;
    command_base TEXT;
BEGIN
    -- Get effective constraints for the agent
    SELECT * INTO constraints_record
    FROM get_effective_constraints(p_agent_id)
    LIMIT 1;

    -- Extract the base command (first word)
    command_base := split_part(trim(p_command), ' ', 1);

    -- If there's an allowed_commands list, check if command is in it
    IF constraints_record.allowed_commands IS NOT NULL THEN
        RETURN command_base = ANY(constraints_record.allowed_commands);
    END IF;

    -- If there's a blocked_commands list, check if command is NOT in it
    IF constraints_record.blocked_commands IS NOT NULL THEN
        RETURN NOT (command_base = ANY(constraints_record.blocked_commands));
    END IF;

    -- If no constraints, allow by default
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Insert default global constraints
INSERT INTO execution_constraints (
    agent_id,
    max_execution_time,
    max_memory_mb,
    blocked_commands,
    environment_variables
) VALUES (
    NULL, -- Global constraints
    300000, -- 5 minutes
    1024, -- 1GB
    ARRAY['rm', 'rmdir', 'dd', 'mkfs', 'fdisk', 'shutdown', 'reboot', 'halt'], -- Dangerous commands
    '{}'::JSONB
);