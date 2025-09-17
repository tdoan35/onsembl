-- Migration: 010_indexes.sql
-- Description: Create additional performance indexes for all tables
-- Created: 2024-01-01

-- Additional indexes for agents table
CREATE INDEX IF NOT EXISTS idx_agents_status_last_ping ON agents (status, last_ping DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_agents_type_status ON agents (type, status);
CREATE INDEX IF NOT EXISTS idx_agents_metadata_search ON agents USING gin(metadata)
    WHERE metadata != '{}';

-- Additional indexes for commands table
CREATE INDEX IF NOT EXISTS idx_commands_status_started_at ON commands (status, started_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_commands_agent_created_priority ON commands (agent_id, created_at DESC, priority DESC);
CREATE INDEX IF NOT EXISTS idx_commands_completion_time ON commands (completed_at DESC NULLS LAST)
    WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commands_active ON commands (agent_id, status, priority DESC)
    WHERE status IN ('pending', 'queued', 'executing');
CREATE INDEX IF NOT EXISTS idx_commands_result_search ON commands USING gin(result)
    WHERE result IS NOT NULL;

-- Additional indexes for terminal_outputs table
CREATE INDEX IF NOT EXISTS idx_terminal_outputs_command_type_timestamp ON terminal_outputs (command_id, type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_terminal_outputs_agent_type_timestamp ON terminal_outputs (agent_id, type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_terminal_outputs_content_search ON terminal_outputs
    USING gin(to_tsvector('english', content))
    WHERE char_length(content) > 10;

-- Partial indexes for terminal_outputs by type
CREATE INDEX IF NOT EXISTS idx_terminal_outputs_stdout ON terminal_outputs (command_id, timestamp DESC)
    WHERE type = 'stdout';
CREATE INDEX IF NOT EXISTS idx_terminal_outputs_stderr ON terminal_outputs (command_id, timestamp DESC)
    WHERE type = 'stderr';
CREATE INDEX IF NOT EXISTS idx_terminal_outputs_system ON terminal_outputs (command_id, timestamp DESC)
    WHERE type = 'system';

-- Additional indexes for command_presets table
CREATE INDEX IF NOT EXISTS idx_command_presets_category_name ON command_presets (category, name);
CREATE INDEX IF NOT EXISTS idx_command_presets_arguments_search ON command_presets USING gin(arguments)
    WHERE arguments != '{}';

-- Additional indexes for trace_entries table
CREATE INDEX IF NOT EXISTS idx_trace_entries_agent_type_timestamp ON trace_entries (agent_id, type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trace_entries_command_type_timestamp ON trace_entries (command_id, type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trace_entries_metadata_search ON trace_entries USING gin(metadata)
    WHERE metadata != '{}';
CREATE INDEX IF NOT EXISTS idx_trace_entries_duration ON trace_entries (duration_ms DESC NULLS LAST)
    WHERE duration_ms IS NOT NULL;

-- Partial indexes for trace_entries by type
CREATE INDEX IF NOT EXISTS idx_trace_entries_requests ON trace_entries (agent_id, timestamp DESC)
    WHERE type = 'request';
CREATE INDEX IF NOT EXISTS idx_trace_entries_responses ON trace_entries (agent_id, timestamp DESC)
    WHERE type = 'response';
CREATE INDEX IF NOT EXISTS idx_trace_entries_errors ON trace_entries (agent_id, timestamp DESC)
    WHERE type = 'error';

-- Additional indexes for investigation_reports table
CREATE INDEX IF NOT EXISTS idx_investigation_reports_agent_created ON investigation_reports (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investigation_reports_command_created ON investigation_reports (command_id, created_at DESC);

-- Additional indexes for audit_logs table
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action_created ON audit_logs (user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_created ON audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs (ip_address, created_at DESC)
    WHERE ip_address IS NOT NULL;

-- Partial indexes for audit_logs by action type
CREATE INDEX IF NOT EXISTS idx_audit_logs_create_actions ON audit_logs (resource_type, created_at DESC)
    WHERE action = 'create';
CREATE INDEX IF NOT EXISTS idx_audit_logs_update_actions ON audit_logs (resource_type, created_at DESC)
    WHERE action = 'update';
CREATE INDEX IF NOT EXISTS idx_audit_logs_delete_actions ON audit_logs (resource_type, created_at DESC)
    WHERE action = 'delete';
CREATE INDEX IF NOT EXISTS idx_audit_logs_execute_actions ON audit_logs (resource_type, created_at DESC)
    WHERE action = 'execute';

-- Additional indexes for execution_constraints table
CREATE INDEX IF NOT EXISTS idx_execution_constraints_agent_updated ON execution_constraints (agent_id, updated_at DESC);

-- Additional indexes for command_queue table
CREATE INDEX IF NOT EXISTS idx_command_queue_agent_priority_created ON command_queue (agent_id, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_command_queue_estimated_duration ON command_queue (estimated_duration_ms DESC NULLS LAST)
    WHERE estimated_duration_ms IS NOT NULL;

-- Performance monitoring indexes
CREATE INDEX IF NOT EXISTS idx_commands_performance_monitoring ON commands (agent_id, status, created_at, completed_at)
    WHERE status IN ('completed', 'failed');

CREATE INDEX IF NOT EXISTS idx_trace_entries_performance_monitoring ON trace_entries (agent_id, type, duration_ms, timestamp)
    WHERE duration_ms IS NOT NULL;

-- Cross-table relationship indexes for common joins
CREATE INDEX IF NOT EXISTS idx_terminal_outputs_with_commands ON terminal_outputs (command_id, agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trace_entries_with_commands ON trace_entries (command_id, agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_investigation_reports_with_commands ON investigation_reports (command_id, agent_id, created_at DESC);

-- Covering indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_commands_dashboard_view ON commands (agent_id, status, created_at DESC)
    INCLUDE (command, priority, started_at, completed_at);

CREATE INDEX IF NOT EXISTS idx_agents_status_view ON agents (status, type)
    INCLUDE (name, last_ping, created_at);

-- Comments for index documentation
COMMENT ON INDEX idx_agents_status_last_ping IS 'Optimizes agent health monitoring queries';
COMMENT ON INDEX idx_commands_active IS 'Optimizes active command tracking for agents';
COMMENT ON INDEX idx_terminal_outputs_streaming IS 'Optimizes real-time terminal output streaming';
COMMENT ON INDEX idx_trace_entries_tree_structure IS 'Optimizes trace tree traversal queries';
COMMENT ON INDEX idx_audit_logs_details_search IS 'Enables efficient search within audit log details';
COMMENT ON INDEX idx_command_queue_agent_priority_position IS 'Optimizes queue processing and ordering';

-- Create statistics for query planner optimization
-- This helps PostgreSQL make better execution plans
DO $$
BEGIN
    -- Only create statistics if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_statistic_ext WHERE stxname = 'stats_commands_agent_status_priority') THEN
        CREATE STATISTICS stats_commands_agent_status_priority ON agent_id, status, priority FROM commands;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_statistic_ext WHERE stxname = 'stats_terminal_outputs_command_type_timestamp') THEN
        CREATE STATISTICS stats_terminal_outputs_command_type_timestamp ON command_id, type, timestamp FROM terminal_outputs;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_statistic_ext WHERE stxname = 'stats_trace_entries_agent_type_timestamp') THEN
        CREATE STATISTICS stats_trace_entries_agent_type_timestamp ON agent_id, type, timestamp FROM trace_entries;
    END IF;
END
$$;