-- Migration: 001_agents.sql
-- Description: Create agents table for managing AI coding agents
-- Created: 2024-01-01

-- Create enum for agent types
CREATE TYPE agent_type AS ENUM ('claude', 'gemini', 'codex', 'custom');

-- Create enum for agent status
CREATE TYPE agent_status AS ENUM ('connected', 'disconnected', 'busy', 'error');

-- Create agents table
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    type agent_type NOT NULL,
    status agent_status NOT NULL DEFAULT 'disconnected',
    last_ping TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT agents_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    CONSTRAINT agents_metadata_not_null CHECK (metadata IS NOT NULL)
);

-- Add comments
COMMENT ON TABLE agents IS 'AI coding agents managed by the control center';
COMMENT ON COLUMN agents.name IS 'Unique identifier name for the agent';
COMMENT ON COLUMN agents.type IS 'Type of AI agent (claude, gemini, codex, custom)';
COMMENT ON COLUMN agents.status IS 'Current connection status of the agent';
COMMENT ON COLUMN agents.last_ping IS 'Timestamp of last ping/heartbeat from agent';
COMMENT ON COLUMN agents.metadata IS 'Additional agent configuration and runtime data';

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX idx_agents_status ON agents (status);
CREATE INDEX idx_agents_type ON agents (type);
CREATE INDEX idx_agents_last_ping ON agents (last_ping);
CREATE INDEX idx_agents_created_at ON agents (created_at);

-- Enable Row Level Security
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow authenticated users to manage agents)
CREATE POLICY "Allow authenticated users to view agents" ON agents
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert agents" ON agents
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update agents" ON agents
    FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to delete agents" ON agents
    FOR DELETE TO authenticated
    USING (true);

-- Grant permissions
GRANT ALL ON agents TO authenticated;
GRANT ALL ON agents TO service_role;