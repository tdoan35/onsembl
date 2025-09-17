-- Migration: 009_command_queue.sql
-- Description: Create command_queue table for managing command execution order
-- Created: 2024-01-01

-- Create command_queue table
CREATE TABLE command_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    priority INTEGER NOT NULL,
    estimated_duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT command_queue_position_positive CHECK (position >= 0),
    CONSTRAINT command_queue_priority_range CHECK (priority >= -100 AND priority <= 100),
    CONSTRAINT command_queue_estimated_duration_positive CHECK (
        estimated_duration_ms IS NULL OR estimated_duration_ms > 0
    ),
    CONSTRAINT command_queue_estimated_duration_reasonable CHECK (
        estimated_duration_ms IS NULL OR estimated_duration_ms <= 3600000
    ), -- max 1 hour
    CONSTRAINT command_queue_unique_command UNIQUE (command_id)
);

-- Add comments
COMMENT ON TABLE command_queue IS 'Queue management for command execution order';
COMMENT ON COLUMN command_queue.command_id IS 'Reference to the queued command';
COMMENT ON COLUMN command_queue.agent_id IS 'Reference to specific agent (NULL for any available agent)';
COMMENT ON COLUMN command_queue.position IS 'Position in the queue (0-based, lower = earlier)';
COMMENT ON COLUMN command_queue.priority IS 'Execution priority (-100 to 100, higher = more priority)';
COMMENT ON COLUMN command_queue.estimated_duration_ms IS 'Estimated execution duration in milliseconds';

-- Create indexes for efficient queue operations
CREATE INDEX idx_command_queue_agent_id ON command_queue (agent_id);
CREATE INDEX idx_command_queue_position ON command_queue (position);
CREATE INDEX idx_command_queue_priority ON command_queue (priority DESC);
CREATE INDEX idx_command_queue_created_at ON command_queue (created_at);

-- Composite indexes for queue processing
CREATE INDEX idx_command_queue_agent_priority_position ON command_queue (agent_id, priority DESC, position);
CREATE INDEX idx_command_queue_global_priority_position ON command_queue (priority DESC, position)
    WHERE agent_id IS NULL;

-- Enable Row Level Security
ALTER TABLE command_queue ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view command queue" ON command_queue
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert command queue" ON command_queue
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update command queue" ON command_queue
    FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to delete command queue" ON command_queue
    FOR DELETE TO authenticated
    USING (true);

-- Grant permissions
GRANT ALL ON command_queue TO authenticated;
GRANT ALL ON command_queue TO service_role;

-- Create function to add command to queue
CREATE OR REPLACE FUNCTION enqueue_command(
    p_command_id UUID,
    p_agent_id UUID DEFAULT NULL,
    p_priority INTEGER DEFAULT 0,
    p_estimated_duration_ms INTEGER DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    next_position INTEGER;
    queue_id UUID;
BEGIN
    -- Get the next position in the queue
    SELECT COALESCE(MAX(position), -1) + 1
    INTO next_position
    FROM command_queue
    WHERE (p_agent_id IS NULL AND agent_id IS NULL) OR agent_id = p_agent_id;

    -- Insert into queue
    INSERT INTO command_queue (
        command_id,
        agent_id,
        position,
        priority,
        estimated_duration_ms
    ) VALUES (
        p_command_id,
        p_agent_id,
        next_position,
        p_priority,
        p_estimated_duration_ms
    ) RETURNING id INTO queue_id;

    -- Reorder queue by priority
    PERFORM reorder_queue(p_agent_id);

    RETURN next_position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to reorder queue by priority
CREATE OR REPLACE FUNCTION reorder_queue(p_agent_id UUID DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    -- Update positions based on priority and creation time
    WITH ranked_queue AS (
        SELECT
            id,
            ROW_NUMBER() OVER (
                ORDER BY priority DESC, created_at ASC
            ) - 1 as new_position
        FROM command_queue
        WHERE (p_agent_id IS NULL AND agent_id IS NULL) OR agent_id = p_agent_id
    )
    UPDATE command_queue
    SET position = ranked_queue.new_position
    FROM ranked_queue
    WHERE command_queue.id = ranked_queue.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to dequeue next command
CREATE OR REPLACE FUNCTION dequeue_next_command(p_agent_id UUID DEFAULT NULL)
RETURNS TABLE (
    command_id UUID,
    queue_id UUID,
    priority INTEGER,
    estimated_duration_ms INTEGER
) AS $$
DECLARE
    result_record RECORD;
BEGIN
    -- Get the next command in queue (lowest position = highest priority)
    SELECT
        cq.command_id,
        cq.id as queue_id,
        cq.priority,
        cq.estimated_duration_ms
    INTO result_record
    FROM command_queue cq
    WHERE (p_agent_id IS NULL AND cq.agent_id IS NULL) OR cq.agent_id = p_agent_id
    ORDER BY cq.position ASC
    LIMIT 1;

    IF FOUND THEN
        -- Remove from queue
        DELETE FROM command_queue WHERE id = result_record.queue_id;

        -- Reorder remaining items
        PERFORM reorder_queue(p_agent_id);

        -- Return the result
        RETURN QUERY
        SELECT
            result_record.command_id,
            result_record.queue_id,
            result_record.priority,
            result_record.estimated_duration_ms;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get queue status
CREATE OR REPLACE FUNCTION get_queue_status(p_agent_id UUID DEFAULT NULL)
RETURNS TABLE (
    total_commands INTEGER,
    estimated_total_duration_ms BIGINT,
    next_command_id UUID,
    average_priority NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_commands,
        SUM(COALESCE(estimated_duration_ms, 60000))::BIGINT as estimated_total_duration_ms,
        MIN(command_id) FILTER (WHERE position = 0) as next_command_id,
        AVG(priority) as average_priority
    FROM command_queue
    WHERE (p_agent_id IS NULL AND agent_id IS NULL) OR agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Create function to remove command from queue
CREATE OR REPLACE FUNCTION remove_from_queue(p_command_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    removed_agent_id UUID;
BEGIN
    -- Get agent_id before deletion
    SELECT agent_id INTO removed_agent_id
    FROM command_queue
    WHERE command_id = p_command_id;

    -- Delete from queue
    DELETE FROM command_queue WHERE command_id = p_command_id;

    IF FOUND THEN
        -- Reorder queue after removal
        PERFORM reorder_queue(removed_agent_id);
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;