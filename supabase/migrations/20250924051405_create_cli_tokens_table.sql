-- Create CLI tokens table for OAuth device flow authentication
CREATE TABLE IF NOT EXISTS public.cli_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    device_code text NOT NULL,
    user_code text NOT NULL,
    access_token text,
    refresh_token text,
    scopes text[] DEFAULT '{}',
    expires_at timestamptz NOT NULL,
    refresh_expires_at timestamptz,
    is_revoked boolean DEFAULT false,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS cli_tokens_device_code_idx ON public.cli_tokens(device_code);
CREATE INDEX IF NOT EXISTS cli_tokens_user_code_idx ON public.cli_tokens(user_code);
CREATE INDEX IF NOT EXISTS cli_tokens_access_token_idx ON public.cli_tokens(access_token);
CREATE INDEX IF NOT EXISTS cli_tokens_refresh_token_idx ON public.cli_tokens(refresh_token);
CREATE INDEX IF NOT EXISTS cli_tokens_user_id_idx ON public.cli_tokens(user_id);
CREATE INDEX IF NOT EXISTS cli_tokens_expires_at_idx ON public.cli_tokens(expires_at);

-- Add unique constraints
ALTER TABLE public.cli_tokens ADD CONSTRAINT cli_tokens_device_code_unique UNIQUE (device_code);
ALTER TABLE public.cli_tokens ADD CONSTRAINT cli_tokens_user_code_unique UNIQUE (user_code);

-- Enable Row Level Security (RLS)
ALTER TABLE public.cli_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cli_tokens table
-- Users can only access their own tokens
CREATE POLICY "Users can view their own CLI tokens" ON public.cli_tokens
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own CLI tokens" ON public.cli_tokens
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own CLI tokens" ON public.cli_tokens
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own CLI tokens" ON public.cli_tokens
    FOR DELETE USING (auth.uid() = user_id);

-- Service role can manage all tokens (for backend OAuth operations)
CREATE POLICY "Service role can manage all CLI tokens" ON public.cli_tokens
    FOR ALL USING (auth.role() = 'service_role');

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cli_tokens_updated_at BEFORE UPDATE ON public.cli_tokens
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE public.cli_tokens IS 'OAuth device flow tokens for CLI authentication';