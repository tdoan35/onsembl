-- Migration: Add capabilities and version columns to agents table
-- Description: Add missing capabilities (text array) and version (text) columns
-- Created: 2025-10-31

-- Add capabilities column as text array
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS capabilities TEXT[] DEFAULT '{}';

-- Add version column
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS version TEXT;

-- Add comments
COMMENT ON COLUMN agents.capabilities IS 'Array of agent capabilities (e.g., basic, interrupt, trace)';
COMMENT ON COLUMN agents.version IS 'Agent version string';

-- Create index on capabilities for faster queries
CREATE INDEX IF NOT EXISTS idx_agents_capabilities ON agents USING GIN (capabilities);
