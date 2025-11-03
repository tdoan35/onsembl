-- Migration: 004_add_sequence_to_terminal_outputs.sql
-- Description: Add sequence number and blank line metadata to terminal_outputs for deduplication
-- Created: 2024-01-02

-- Add sequence column for ordering and deduplication
ALTER TABLE terminal_outputs
ADD COLUMN IF NOT EXISTS sequence INTEGER;

-- Add is_blank column for blank line metadata
ALTER TABLE terminal_outputs
ADD COLUMN IF NOT EXISTS is_blank BOOLEAN DEFAULT FALSE NOT NULL;

-- Add comments for new columns
COMMENT ON COLUMN terminal_outputs.sequence IS 'Sequence number for ordering and deduplication within a command/agent stream';
COMMENT ON COLUMN terminal_outputs.is_blank IS 'Whether this line contains only whitespace (blank line)';

-- Backfill sequence numbers for existing rows based on timestamp
-- This assigns sequential numbers per (command_id, agent_id) ordered by timestamp
WITH numbered_rows AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY command_id, agent_id
      ORDER BY timestamp ASC, created_at ASC
    ) - 1 AS seq_num  -- Start from 0
  FROM terminal_outputs
  WHERE sequence IS NULL
)
UPDATE terminal_outputs
SET sequence = numbered_rows.seq_num
FROM numbered_rows
WHERE terminal_outputs.id = numbered_rows.id;

-- Make sequence NOT NULL after backfill
ALTER TABLE terminal_outputs
ALTER COLUMN sequence SET NOT NULL;

-- Create unique index for deduplication (command_id, agent_id, sequence)
-- This prevents duplicate terminal outputs with the same sequence number
CREATE UNIQUE INDEX IF NOT EXISTS idx_terminal_outputs_dedup
ON terminal_outputs (command_id, agent_id, sequence);

-- Create index for monitoring output queries (agent_id, sequence)
-- Used when command_id is NULL (monitoring/session output)
CREATE INDEX IF NOT EXISTS idx_terminal_outputs_agent_sequence
ON terminal_outputs (agent_id, sequence DESC);

-- Create composite index for efficient streaming queries with sequence
CREATE INDEX IF NOT EXISTS idx_terminal_outputs_streaming_sequence
ON terminal_outputs (command_id, type, sequence DESC);

-- Add check constraint to ensure sequence is non-negative
ALTER TABLE terminal_outputs
ADD CONSTRAINT terminal_outputs_sequence_positive CHECK (sequence >= 0);
