-- Migration: 005_trace_entries.sql
-- Description: Create trace_entries table for LLM execution trace tree
-- Created: 2024-01-01

-- Create enum for trace entry types
CREATE TYPE trace_entry_type AS ENUM (
    'request',
    'response',
    'thought',
    'action',
    'observation',
    'error'
);

-- Create trace_entries table
CREATE TABLE trace_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id UUID REFERENCES commands(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES trace_entries(id) ON DELETE CASCADE,
    type trace_entry_type NOT NULL,
    content JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT trace_entries_duration_positive CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT trace_entries_duration_reasonable CHECK (duration_ms IS NULL OR duration_ms <= 3600000), -- max 1 hour
    CONSTRAINT trace_entries_content_not_null CHECK (content IS NOT NULL),
    CONSTRAINT trace_entries_metadata_not_null CHECK (metadata IS NOT NULL),
    CONSTRAINT trace_entries_no_self_parent CHECK (parent_id != id)
);

-- Add comments
COMMENT ON TABLE trace_entries IS 'LLM execution trace tree for debugging and analysis';
COMMENT ON COLUMN trace_entries.command_id IS 'Reference to the command (nullable for standalone traces)';
COMMENT ON COLUMN trace_entries.agent_id IS 'Reference to the agent generating this trace';
COMMENT ON COLUMN trace_entries.parent_id IS 'Reference to parent trace entry for tree structure';
COMMENT ON COLUMN trace_entries.type IS 'Type of trace entry';
COMMENT ON COLUMN trace_entries.content IS 'Trace content as JSON (prompt, response, etc.)';
COMMENT ON COLUMN trace_entries.metadata IS 'Additional metadata (model, tokens, etc.)';
COMMENT ON COLUMN trace_entries.timestamp IS 'When this trace entry was generated';
COMMENT ON COLUMN trace_entries.duration_ms IS 'Execution duration in milliseconds';

-- Create indexes for efficient querying
CREATE INDEX idx_trace_entries_command_id ON trace_entries (command_id);
CREATE INDEX idx_trace_entries_agent_id ON trace_entries (agent_id);
CREATE INDEX idx_trace_entries_parent_id ON trace_entries (parent_id);
CREATE INDEX idx_trace_entries_timestamp ON trace_entries (timestamp DESC);
CREATE INDEX idx_trace_entries_type ON trace_entries (type);
CREATE INDEX idx_trace_entries_created_at ON trace_entries (created_at DESC);

-- Composite indexes for common query patterns
CREATE INDEX idx_trace_entries_command_timestamp ON trace_entries (command_id, timestamp DESC);
CREATE INDEX idx_trace_entries_agent_timestamp ON trace_entries (agent_id, timestamp DESC);
CREATE INDEX idx_trace_entries_parent_timestamp ON trace_entries (parent_id, timestamp DESC);

-- Index for tree traversal queries
CREATE INDEX idx_trace_entries_tree_structure ON trace_entries (agent_id, parent_id, timestamp);

-- GIN index for content search
CREATE INDEX idx_trace_entries_content_search ON trace_entries USING gin(content);

-- Enable Row Level Security
ALTER TABLE trace_entries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view trace entries" ON trace_entries
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert trace entries" ON trace_entries
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow service role to manage trace entries" ON trace_entries
    FOR ALL TO service_role
    USING (true);

-- Grant permissions
GRANT ALL ON trace_entries TO authenticated;
GRANT ALL ON trace_entries TO service_role;

-- Create function to get trace tree for a command
CREATE OR REPLACE FUNCTION get_trace_tree(p_command_id UUID)
RETURNS TABLE (
    id UUID,
    parent_id UUID,
    type trace_entry_type,
    content JSONB,
    metadata JSONB,
    "timestamp" TIMESTAMPTZ,
    duration_ms INTEGER,
    depth INTEGER
) AS $$
WITH RECURSIVE trace_tree AS (
    -- Base case: root nodes (no parent)
    SELECT
        te.id,
        te.parent_id,
        te.type,
        te.content,
        te.metadata,
        te.timestamp,
        te.duration_ms,
        0 as depth
    FROM trace_entries te
    WHERE te.command_id = p_command_id
      AND te.parent_id IS NULL

    UNION ALL

    -- Recursive case: children
    SELECT
        te.id,
        te.parent_id,
        te.type,
        te.content,
        te.metadata,
        te.timestamp,
        te.duration_ms,
        tt.depth + 1
    FROM trace_entries te
    INNER JOIN trace_tree tt ON te.parent_id = tt.id
    WHERE te.command_id = p_command_id
)
SELECT * FROM trace_tree ORDER BY timestamp;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Create function for cleanup of old trace entries (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_trace_entries()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete trace entries older than 30 days
    DELETE FROM trace_entries
    WHERE created_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;