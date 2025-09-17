-- Migration: 011_rls_policies.sql
-- Description: Comprehensive Row Level Security policies for all tables
-- Created: 2024-01-01

-- Enable RLS on all tables (ensure it's enabled even if done in individual migrations)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trace_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_queue ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them comprehensively
DROP POLICY IF EXISTS "Allow authenticated users to view agents" ON agents;
DROP POLICY IF EXISTS "Allow authenticated users to insert agents" ON agents;
DROP POLICY IF EXISTS "Allow authenticated users to update agents" ON agents;
DROP POLICY IF EXISTS "Allow authenticated users to delete agents" ON agents;

DROP POLICY IF EXISTS "Allow authenticated users to view commands" ON commands;
DROP POLICY IF EXISTS "Allow authenticated users to insert commands" ON commands;
DROP POLICY IF EXISTS "Allow authenticated users to update commands" ON commands;
DROP POLICY IF EXISTS "Allow authenticated users to delete commands" ON commands;

DROP POLICY IF EXISTS "Allow authenticated users to view terminal outputs" ON terminal_outputs;
DROP POLICY IF EXISTS "Allow authenticated users to insert terminal outputs" ON terminal_outputs;
DROP POLICY IF EXISTS "Allow service role to manage terminal outputs" ON terminal_outputs;

DROP POLICY IF EXISTS "Allow authenticated users to view command presets" ON command_presets;
DROP POLICY IF EXISTS "Allow authenticated users to insert command presets" ON command_presets;
DROP POLICY IF EXISTS "Allow authenticated users to update command presets" ON command_presets;
DROP POLICY IF EXISTS "Allow authenticated users to delete command presets" ON command_presets;

DROP POLICY IF EXISTS "Allow authenticated users to view trace entries" ON trace_entries;
DROP POLICY IF EXISTS "Allow authenticated users to insert trace entries" ON trace_entries;
DROP POLICY IF EXISTS "Allow service role to manage trace entries" ON trace_entries;

DROP POLICY IF EXISTS "Allow authenticated users to view investigation reports" ON investigation_reports;
DROP POLICY IF EXISTS "Allow authenticated users to insert investigation reports" ON investigation_reports;
DROP POLICY IF EXISTS "Allow authenticated users to update investigation reports" ON investigation_reports;
DROP POLICY IF EXISTS "Allow authenticated users to delete investigation reports" ON investigation_reports;

DROP POLICY IF EXISTS "Allow authenticated users to view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Allow service role to insert audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Allow authenticated users to insert audit logs" ON audit_logs;

DROP POLICY IF EXISTS "Allow authenticated users to view execution constraints" ON execution_constraints;
DROP POLICY IF EXISTS "Allow authenticated users to insert execution constraints" ON execution_constraints;
DROP POLICY IF EXISTS "Allow authenticated users to update execution constraints" ON execution_constraints;
DROP POLICY IF EXISTS "Allow authenticated users to delete execution constraints" ON execution_constraints;

DROP POLICY IF EXISTS "Allow authenticated users to view command queue" ON command_queue;
DROP POLICY IF EXISTS "Allow authenticated users to insert command queue" ON command_queue;
DROP POLICY IF EXISTS "Allow authenticated users to update command queue" ON command_queue;
DROP POLICY IF EXISTS "Allow authenticated users to delete command queue" ON command_queue;

-- ========================================
-- AGENTS TABLE POLICIES
-- ========================================

-- All authenticated users can view agents (single-tenant MVP)
CREATE POLICY "authenticated_select_agents" ON agents
    FOR SELECT TO authenticated
    USING (true);

-- All authenticated users can insert agents
CREATE POLICY "authenticated_insert_agents" ON agents
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- All authenticated users can update agents
CREATE POLICY "authenticated_update_agents" ON agents
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- All authenticated users can delete agents
CREATE POLICY "authenticated_delete_agents" ON agents
    FOR DELETE TO authenticated
    USING (true);

-- Service role has full access
CREATE POLICY "service_role_all_agents" ON agents
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ========================================
-- COMMANDS TABLE POLICIES
-- ========================================

-- All authenticated users can view commands
CREATE POLICY "authenticated_select_commands" ON commands
    FOR SELECT TO authenticated
    USING (true);

-- All authenticated users can insert commands
CREATE POLICY "authenticated_insert_commands" ON commands
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- All authenticated users can update commands
CREATE POLICY "authenticated_update_commands" ON commands
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- All authenticated users can delete commands
CREATE POLICY "authenticated_delete_commands" ON commands
    FOR DELETE TO authenticated
    USING (true);

-- Service role has full access
CREATE POLICY "service_role_all_commands" ON commands
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ========================================
-- TERMINAL_OUTPUTS TABLE POLICIES
-- ========================================

-- All authenticated users can view terminal outputs
CREATE POLICY "authenticated_select_terminal_outputs" ON terminal_outputs
    FOR SELECT TO authenticated
    USING (true);

-- All authenticated users can insert terminal outputs
CREATE POLICY "authenticated_insert_terminal_outputs" ON terminal_outputs
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Service role has full access for system operations
CREATE POLICY "service_role_all_terminal_outputs" ON terminal_outputs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ========================================
-- COMMAND_PRESETS TABLE POLICIES
-- ========================================

-- All authenticated users can view command presets
CREATE POLICY "authenticated_select_command_presets" ON command_presets
    FOR SELECT TO authenticated
    USING (true);

-- All authenticated users can insert command presets
CREATE POLICY "authenticated_insert_command_presets" ON command_presets
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- All authenticated users can update command presets
CREATE POLICY "authenticated_update_command_presets" ON command_presets
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- All authenticated users can delete command presets
CREATE POLICY "authenticated_delete_command_presets" ON command_presets
    FOR DELETE TO authenticated
    USING (true);

-- Service role has full access
CREATE POLICY "service_role_all_command_presets" ON command_presets
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ========================================
-- TRACE_ENTRIES TABLE POLICIES
-- ========================================

-- All authenticated users can view trace entries
CREATE POLICY "authenticated_select_trace_entries" ON trace_entries
    FOR SELECT TO authenticated
    USING (true);

-- All authenticated users can insert trace entries
CREATE POLICY "authenticated_insert_trace_entries" ON trace_entries
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Service role has full access for system operations
CREATE POLICY "service_role_all_trace_entries" ON trace_entries
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ========================================
-- INVESTIGATION_REPORTS TABLE POLICIES
-- ========================================

-- All authenticated users can view investigation reports
CREATE POLICY "authenticated_select_investigation_reports" ON investigation_reports
    FOR SELECT TO authenticated
    USING (true);

-- All authenticated users can insert investigation reports
CREATE POLICY "authenticated_insert_investigation_reports" ON investigation_reports
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- All authenticated users can update investigation reports
CREATE POLICY "authenticated_update_investigation_reports" ON investigation_reports
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- All authenticated users can delete investigation reports
CREATE POLICY "authenticated_delete_investigation_reports" ON investigation_reports
    FOR DELETE TO authenticated
    USING (true);

-- Service role has full access
CREATE POLICY "service_role_all_investigation_reports" ON investigation_reports
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ========================================
-- AUDIT_LOGS TABLE POLICIES
-- ========================================

-- All authenticated users can view audit logs (read-only transparency)
CREATE POLICY "authenticated_select_audit_logs" ON audit_logs
    FOR SELECT TO authenticated
    USING (true);

-- Only service role can insert audit logs (system-generated)
CREATE POLICY "service_role_insert_audit_logs" ON audit_logs
    FOR INSERT TO service_role
    WITH CHECK (true);

-- Authenticated users can insert their own audit logs for client-side actions
CREATE POLICY "authenticated_insert_own_audit_logs" ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Only service role can delete audit logs (for retention policies)
CREATE POLICY "service_role_delete_audit_logs" ON audit_logs
    FOR DELETE TO service_role
    USING (true);

-- Service role has full access
CREATE POLICY "service_role_all_audit_logs" ON audit_logs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ========================================
-- EXECUTION_CONSTRAINTS TABLE POLICIES
-- ========================================

-- All authenticated users can view execution constraints
CREATE POLICY "authenticated_select_execution_constraints" ON execution_constraints
    FOR SELECT TO authenticated
    USING (true);

-- All authenticated users can insert execution constraints
CREATE POLICY "authenticated_insert_execution_constraints" ON execution_constraints
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- All authenticated users can update execution constraints
CREATE POLICY "authenticated_update_execution_constraints" ON execution_constraints
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- All authenticated users can delete execution constraints
CREATE POLICY "authenticated_delete_execution_constraints" ON execution_constraints
    FOR DELETE TO authenticated
    USING (true);

-- Service role has full access
CREATE POLICY "service_role_all_execution_constraints" ON execution_constraints
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ========================================
-- COMMAND_QUEUE TABLE POLICIES
-- ========================================

-- All authenticated users can view command queue
CREATE POLICY "authenticated_select_command_queue" ON command_queue
    FOR SELECT TO authenticated
    USING (true);

-- All authenticated users can insert into command queue
CREATE POLICY "authenticated_insert_command_queue" ON command_queue
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- All authenticated users can update command queue
CREATE POLICY "authenticated_update_command_queue" ON command_queue
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- All authenticated users can delete from command queue
CREATE POLICY "authenticated_delete_command_queue" ON command_queue
    FOR DELETE TO authenticated
    USING (true);

-- Service role has full access
CREATE POLICY "service_role_all_command_queue" ON command_queue
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ========================================
-- GRANT PERMISSIONS
-- ========================================

-- Grant necessary permissions to authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant full permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ========================================
-- COMMENTS FOR DOCUMENTATION
-- ========================================

COMMENT ON POLICY "authenticated_select_agents" ON agents IS 'Single-tenant MVP: all authenticated users can view all agents';
COMMENT ON POLICY "authenticated_select_audit_logs" ON audit_logs IS 'Audit transparency: all authenticated users can view audit trail';
COMMENT ON POLICY "service_role_insert_audit_logs" ON audit_logs IS 'System-generated audit logs via service role';
COMMENT ON POLICY "authenticated_insert_own_audit_logs" ON audit_logs IS 'Users can log their own client-side actions';