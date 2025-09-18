-- Migration: Fix commands table schema to match application model
-- This adds missing columns and renames existing ones to align with CommandModel

-- Add missing columns
ALTER TABLE commands
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'NATURAL',
ADD COLUMN IF NOT EXISTS prompt TEXT,
ADD COLUMN IF NOT EXISTS output TEXT,
ADD COLUMN IF NOT EXISTS queue_position INTEGER,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tokens_used INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- First convert status column to text temporarily
ALTER TABLE commands
ALTER COLUMN status TYPE TEXT;

-- Update existing status values to match new enum values
UPDATE commands
SET status = CASE
    WHEN status = 'pending' THEN 'PENDING'
    WHEN status = 'queued' THEN 'QUEUED'
    WHEN status = 'executing' THEN 'RUNNING'
    WHEN status = 'completed' THEN 'COMPLETED'
    WHEN status = 'failed' THEN 'FAILED'
    WHEN status = 'cancelled' THEN 'CANCELLED'
    ELSE UPPER(status)
END;

-- Create new command_status enum with correct values (if not exists)
DO $$ BEGIN
    CREATE TYPE command_status_new AS ENUM (
        'PENDING',
        'QUEUED',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Convert column to use new enum
ALTER TABLE commands
ALTER COLUMN status TYPE command_status_new USING status::command_status_new;

-- Drop old enum type if exists and rename new one
DROP TYPE IF EXISTS command_status CASCADE;
ALTER TYPE command_status_new RENAME TO command_status;

-- Create new command_type enum
CREATE TYPE command_type AS ENUM (
    'NATURAL',
    'DIRECT',
    'SYSTEM'
);

-- Set type column to use enum
ALTER TABLE commands
ALTER COLUMN type TYPE command_type USING type::command_type;

-- Update constraints
ALTER TABLE commands
DROP CONSTRAINT IF EXISTS commands_command_length,
DROP CONSTRAINT IF EXISTS commands_completion_logic;

-- Add new constraints
ALTER TABLE commands
ADD CONSTRAINT commands_prompt_length CHECK (
    prompt IS NULL OR (char_length(prompt) >= 1 AND char_length(prompt) <= 10000)
),
ADD CONSTRAINT commands_output_length CHECK (
    output IS NULL OR char_length(output) <= 1000000
),
ADD CONSTRAINT commands_queue_position_positive CHECK (
    queue_position IS NULL OR queue_position >= 0
),
ADD CONSTRAINT commands_tokens_positive CHECK (
    tokens_used IS NULL OR tokens_used >= 0
),
ADD CONSTRAINT commands_completion_logic CHECK (
    (status IN ('COMPLETED', 'FAILED', 'CANCELLED') AND completed_at IS NOT NULL) OR
    (status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED') AND completed_at IS NULL)
);

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_commands_type ON commands(type);
CREATE INDEX IF NOT EXISTS idx_commands_queue_position ON commands(queue_position) WHERE queue_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commands_updated_at ON commands(updated_at DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_commands_updated_at BEFORE UPDATE ON commands
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for new columns
COMMENT ON COLUMN commands.type IS 'Type of command (NATURAL, DIRECT, SYSTEM)';
COMMENT ON COLUMN commands.prompt IS 'Natural language prompt for the command';
COMMENT ON COLUMN commands.output IS 'Command execution output';
COMMENT ON COLUMN commands.queue_position IS 'Position in the execution queue';
COMMENT ON COLUMN commands.metadata IS 'Additional metadata for the command';
COMMENT ON COLUMN commands.tokens_used IS 'Number of tokens consumed during execution';
COMMENT ON COLUMN commands.updated_at IS 'Last update timestamp';