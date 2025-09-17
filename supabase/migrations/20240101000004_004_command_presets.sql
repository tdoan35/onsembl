-- Migration: 004_command_presets.sql
-- Description: Create command_presets table for storing reusable command templates
-- Created: 2024-01-01

-- Create command_presets table
CREATE TABLE command_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    command TEXT NOT NULL,
    arguments JSONB DEFAULT '{}',
    category TEXT,
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT command_presets_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    CONSTRAINT command_presets_command_length CHECK (char_length(command) >= 1 AND char_length(command) <= 10000),
    CONSTRAINT command_presets_description_length CHECK (char_length(description) <= 1000),
    CONSTRAINT command_presets_category_length CHECK (char_length(category) <= 50),
    CONSTRAINT command_presets_icon_length CHECK (char_length(icon) <= 50),
    CONSTRAINT command_presets_arguments_not_null CHECK (arguments IS NOT NULL)
);

-- Add unique constraint on name
CREATE UNIQUE INDEX idx_command_presets_name_unique ON command_presets (name);

-- Add comments
COMMENT ON TABLE command_presets IS 'Reusable command templates for quick execution';
COMMENT ON COLUMN command_presets.name IS 'Unique name for the command preset';
COMMENT ON COLUMN command_presets.description IS 'Human-readable description of what the command does';
COMMENT ON COLUMN command_presets.command IS 'The command template to execute';
COMMENT ON COLUMN command_presets.arguments IS 'Default arguments for the command as JSON';
COMMENT ON COLUMN command_presets.category IS 'Category for organizing presets (e.g., "development", "testing")';
COMMENT ON COLUMN command_presets.icon IS 'Icon identifier for UI display';

-- Create trigger for updated_at
CREATE TRIGGER update_command_presets_updated_at
    BEFORE UPDATE ON command_presets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX idx_command_presets_category ON command_presets (category);
CREATE INDEX idx_command_presets_created_at ON command_presets (created_at DESC);
CREATE INDEX idx_command_presets_name_text_search ON command_presets
    USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Enable Row Level Security
ALTER TABLE command_presets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view command presets" ON command_presets
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert command presets" ON command_presets
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update command presets" ON command_presets
    FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to delete command presets" ON command_presets
    FOR DELETE TO authenticated
    USING (true);

-- Grant permissions
GRANT ALL ON command_presets TO authenticated;
GRANT ALL ON command_presets TO service_role;

-- Insert some default command presets
INSERT INTO command_presets (name, description, command, arguments, category, icon) VALUES
    ('Build Project', 'Build the current project', 'npm run build', '{}', 'development', 'hammer'),
    ('Run Tests', 'Execute all unit tests', 'npm test', '{}', 'testing', 'check-circle'),
    ('Start Dev Server', 'Start development server', 'npm run dev', '{}', 'development', 'play'),
    ('Lint Code', 'Run code linter', 'npm run lint', '{}', 'quality', 'search'),
    ('Format Code', 'Format code with prettier', 'npm run format', '{}', 'quality', 'align-left'),
    ('Install Dependencies', 'Install npm dependencies', 'npm install', '{}', 'setup', 'download'),
    ('Git Status', 'Check git repository status', 'git status', '{}', 'git', 'git-branch'),
    ('Git Pull', 'Pull latest changes from remote', 'git pull', '{}', 'git', 'arrow-down'),
    ('Docker Build', 'Build Docker image', 'docker build -t app .', '{}', 'deployment', 'box'),
    ('Database Migrate', 'Run database migrations', 'npm run db:migrate', '{}', 'database', 'database');