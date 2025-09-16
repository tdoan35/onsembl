-- Migration: 002_commands.sql
-- Description: Create commands table for tracking agent command execution
-- Created: 2024-01-01

-- Create enum for command status
CREATE TYPE command_status AS ENUM (
    'pending',
    'queued',
    'executing',
    'completed',
    'failed',
    'cancelled'
);

-- Create commands table
CREATE TABLE commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    command TEXT NOT NULL,
    arguments JSONB DEFAULT '{}',
    status command_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    result JSONB,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT commands_command_length CHECK (char_length(command) >= 1 AND char_length(command) <= 10000),
    CONSTRAINT commands_priority_range CHECK (priority >= -100 AND priority <= 100),
    CONSTRAINT commands_arguments_not_null CHECK (arguments IS NOT NULL),
    CONSTRAINT commands_error_length CHECK (char_length(error) <= 10000),
    CONSTRAINT commands_timing_logic CHECK (
        (started_at IS NULL OR started_at >= created_at) AND
        (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
    ),
    CONSTRAINT commands_completion_logic CHECK (
        (status IN ('completed', 'failed', 'cancelled') AND completed_at IS NOT NULL) OR
        (status NOT IN ('completed', 'failed', 'cancelled') AND completed_at IS NULL)
    )
);

-- Add comments
COMMENT ON TABLE commands IS 'Commands executed by AI agents';
COMMENT ON COLUMN commands.agent_id IS 'Reference to the agent executing this command';
COMMENT ON COLUMN commands.command IS 'The command text to execute';
COMMENT ON COLUMN commands.arguments IS 'Command arguments and parameters as JSON';
COMMENT ON COLUMN commands.status IS 'Current execution status of the command';
COMMENT ON COLUMN commands.priority IS 'Execution priority (-100 to 100, higher = more priority)';
COMMENT ON COLUMN commands.result IS 'Command execution result as JSON';
COMMENT ON COLUMN commands.error IS 'Error message if command failed';
COMMENT ON COLUMN commands.started_at IS 'When command execution started';
COMMENT ON COLUMN commands.completed_at IS 'When command execution completed';

-- Create indexes
CREATE INDEX idx_commands_agent_id ON commands (agent_id);
CREATE INDEX idx_commands_status ON commands (status);
CREATE INDEX idx_commands_priority ON commands (priority DESC);
CREATE INDEX idx_commands_created_at ON commands (created_at DESC);
CREATE INDEX idx_commands_status_priority ON commands (status, priority DESC);
CREATE INDEX idx_commands_agent_status ON commands (agent_id, status);

-- Create composite index for queue processing
CREATE INDEX idx_commands_queue_processing ON commands (agent_id, status, priority DESC, created_at)
    WHERE status IN ('pending', 'queued');

-- Enable Row Level Security
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view commands" ON commands
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert commands" ON commands
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update commands" ON commands
    FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to delete commands" ON commands
    FOR DELETE TO authenticated
    USING (true);

-- Grant permissions
GRANT ALL ON commands TO authenticated;
GRANT ALL ON commands TO service_role;