-- Migration: 003_terminal_outputs.sql
-- Description: Create terminal_outputs table for streaming command output
-- Created: 2024-01-01

-- Create enum for terminal output types
CREATE TYPE terminal_output_type AS ENUM ('stdout', 'stderr', 'system');

-- Create terminal_outputs table
CREATE TABLE terminal_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    type terminal_output_type NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT terminal_outputs_content_length CHECK (char_length(content) <= 100000),
    CONSTRAINT terminal_outputs_timestamp_logic CHECK (timestamp <= created_at + INTERVAL '1 minute')
);

-- Add comments
COMMENT ON TABLE terminal_outputs IS 'Real-time terminal output from command execution';
COMMENT ON COLUMN terminal_outputs.command_id IS 'Reference to the command producing this output';
COMMENT ON COLUMN terminal_outputs.agent_id IS 'Reference to the agent executing the command';
COMMENT ON COLUMN terminal_outputs.type IS 'Type of output: stdout, stderr, or system message';
COMMENT ON COLUMN terminal_outputs.content IS 'The actual terminal output content';
COMMENT ON COLUMN terminal_outputs.timestamp IS 'When the output was generated (may differ from created_at)';

-- Create indexes for efficient querying
CREATE INDEX idx_terminal_outputs_command_id ON terminal_outputs (command_id);
CREATE INDEX idx_terminal_outputs_agent_id ON terminal_outputs (agent_id);
CREATE INDEX idx_terminal_outputs_timestamp ON terminal_outputs (timestamp DESC);
CREATE INDEX idx_terminal_outputs_created_at ON terminal_outputs (created_at DESC);

-- Composite indexes for common query patterns
CREATE INDEX idx_terminal_outputs_command_timestamp ON terminal_outputs (command_id, timestamp DESC);
CREATE INDEX idx_terminal_outputs_agent_timestamp ON terminal_outputs (agent_id, timestamp DESC);
CREATE INDEX idx_terminal_outputs_type_timestamp ON terminal_outputs (type, timestamp DESC);

-- Index for real-time streaming queries
CREATE INDEX idx_terminal_outputs_streaming ON terminal_outputs (command_id, type, timestamp DESC);

-- Enable Row Level Security
ALTER TABLE terminal_outputs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view terminal outputs" ON terminal_outputs
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert terminal outputs" ON terminal_outputs
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow service role to manage terminal outputs" ON terminal_outputs
    FOR ALL TO service_role
    USING (true);

-- Grant permissions
GRANT ALL ON terminal_outputs TO authenticated;
GRANT ALL ON terminal_outputs TO service_role;

-- Create function for cleanup of old terminal outputs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_terminal_outputs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete terminal outputs older than 30 days
    DELETE FROM terminal_outputs
    WHERE created_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;