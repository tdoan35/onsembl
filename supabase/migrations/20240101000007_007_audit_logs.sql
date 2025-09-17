-- Migration: 007_audit_logs.sql
-- Description: Create audit_logs table for comprehensive system auditing
-- Created: 2024-01-01

-- Create audit_logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT audit_logs_action_length CHECK (char_length(action) >= 1 AND char_length(action) <= 100),
    CONSTRAINT audit_logs_resource_type_length CHECK (char_length(resource_type) >= 1 AND char_length(resource_type) <= 50),
    CONSTRAINT audit_logs_resource_id_length CHECK (char_length(resource_id) <= 100),
    CONSTRAINT audit_logs_user_agent_length CHECK (char_length(user_agent) <= 1000),
    CONSTRAINT audit_logs_details_not_null CHECK (details IS NOT NULL)
);

-- Add comments
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all system operations';
COMMENT ON COLUMN audit_logs.user_id IS 'Reference to the user who performed the action (nullable for system actions)';
COMMENT ON COLUMN audit_logs.action IS 'The action performed (e.g., create, update, delete, execute)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource affected (e.g., agent, command, preset)';
COMMENT ON COLUMN audit_logs.resource_id IS 'Identifier of the specific resource affected';
COMMENT ON COLUMN audit_logs.details IS 'Additional context and details about the action';
COMMENT ON COLUMN audit_logs.ip_address IS 'IP address of the client that initiated the action';
COMMENT ON COLUMN audit_logs.user_agent IS 'User agent string of the client';

-- Create indexes for efficient querying
CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs (resource_type);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs (resource_id);

-- Composite indexes for common query patterns
CREATE INDEX idx_audit_logs_user_created_at ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource_type_created_at ON audit_logs (resource_type, created_at DESC);
CREATE INDEX idx_audit_logs_action_created_at ON audit_logs (action, created_at DESC);
CREATE INDEX idx_audit_logs_resource_action ON audit_logs (resource_type, action, created_at DESC);

-- GIN index for details search
CREATE INDEX idx_audit_logs_details_search ON audit_logs USING gin(details);

-- Enable Row Level Security
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Read access: authenticated users can view all audit logs
CREATE POLICY "Allow authenticated users to view audit logs" ON audit_logs
    FOR SELECT TO authenticated
    USING (true);

-- Insert access: service role and authenticated users can create audit logs
CREATE POLICY "Allow service role to insert audit logs" ON audit_logs
    FOR INSERT TO service_role
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to insert audit logs" ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- No update or delete policies - audit logs should be immutable
-- Only service role can delete for data retention purposes

-- Grant permissions
GRANT SELECT, INSERT ON audit_logs TO authenticated;
GRANT ALL ON audit_logs TO service_role;

-- Create function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
    p_user_id UUID,
    p_action TEXT,
    p_resource_type TEXT,
    p_resource_id TEXT DEFAULT NULL,
    p_details JSONB DEFAULT '{}',
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO audit_logs (
        user_id,
        action,
        resource_type,
        resource_id,
        details,
        ip_address,
        user_agent
    ) VALUES (
        p_user_id,
        p_action,
        p_resource_type,
        p_resource_id,
        p_details,
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO audit_id;

    RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to search audit logs
CREATE OR REPLACE FUNCTION search_audit_logs(
    p_user_id UUID DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id TEXT DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    action TEXT,
    resource_type TEXT,
    resource_id TEXT,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.user_id,
        al.action,
        al.resource_type,
        al.resource_id,
        al.details,
        al.ip_address,
        al.user_agent,
        al.created_at
    FROM audit_logs al
    WHERE
        (p_user_id IS NULL OR al.user_id = p_user_id)
        AND (p_action IS NULL OR al.action = p_action)
        AND (p_resource_type IS NULL OR al.resource_type = p_resource_type)
        AND (p_resource_id IS NULL OR al.resource_id = p_resource_id)
        AND (p_start_date IS NULL OR al.created_at >= p_start_date)
        AND (p_end_date IS NULL OR al.created_at <= p_end_date)
    ORDER BY al.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Create function for cleanup of old audit logs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete audit logs older than 30 days
    DELETE FROM audit_logs
    WHERE created_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;