-- Seed data for Onsembl.ai development
-- This file contains initial data for local development

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types
DO $$ BEGIN
    CREATE TYPE agent_status AS ENUM ('connected', 'disconnected', 'busy', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE agent_type AS ENUM ('claude', 'gemini', 'codex', 'custom');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE command_status AS ENUM ('pending', 'queued', 'executing', 'completed', 'failed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Insert test user (for local development only)
-- Password: test123456
INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role
) VALUES (
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    '00000000-0000-0000-0000-000000000000',
    'test@onsembl.ai',
    crypt('test123456', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"full_name": "Test User", "avatar_url": null}',
    'authenticated',
    'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('agent-logs', 'agent-logs', false, 52428800, ARRAY['text/plain', 'application/json']),
    ('command-outputs', 'command-outputs', false, 104857600, ARRAY['text/plain', 'application/json', 'application/octet-stream']),
    ('trace-exports', 'trace-exports', false, 52428800, ARRAY['application/json', 'text/csv'])
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for storage buckets
CREATE POLICY "Users can upload agent logs" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'agent-logs');

CREATE POLICY "Users can view their agent logs" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'agent-logs');

CREATE POLICY "Users can upload command outputs" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'command-outputs');

CREATE POLICY "Users can view command outputs" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'command-outputs');

CREATE POLICY "Users can upload trace exports" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'trace-exports');

CREATE POLICY "Users can view trace exports" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'trace-exports');

-- Grant permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Add helpful comments
COMMENT ON SCHEMA public IS 'Onsembl.ai Agent Control Center - Main schema';
COMMENT ON TYPE agent_status IS 'Current status of an AI agent';
COMMENT ON TYPE agent_type IS 'Type of AI agent (claude, gemini, codex, custom)';
COMMENT ON TYPE command_status IS 'Execution status of a command';

-- Log seed completion
DO $$
BEGIN
    RAISE NOTICE 'Seed data loaded successfully for Onsembl.ai';
END $$;