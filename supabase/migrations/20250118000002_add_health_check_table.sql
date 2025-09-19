-- Add health check table for database monitoring
-- This table is used by the backend to perform periodic health checks

-- Create the health check table
CREATE TABLE IF NOT EXISTS public._health_check (
    id SERIAL PRIMARY KEY,
    count INTEGER DEFAULT 0 NOT NULL,
    last_check TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial row
INSERT INTO public._health_check (count) VALUES (0) ON CONFLICT DO NOTHING;

-- Create or replace function to update the count and timestamp
CREATE OR REPLACE FUNCTION public.update_health_check()
RETURNS INTEGER AS $$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE public._health_check
    SET count = count + 1,
        last_check = NOW(),
        updated_at = NOW()
    WHERE id = 1
    RETURNING count INTO new_count;

    IF new_count IS NULL THEN
        INSERT INTO public._health_check (id, count) VALUES (1, 1)
        RETURNING count INTO new_count;
    END IF;

    RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions (assuming public access for health checks)
GRANT SELECT ON public._health_check TO anon;
GRANT SELECT ON public._health_check TO authenticated;
GRANT SELECT ON public._health_check TO service_role;

-- Add RLS policy (health check is publicly readable)
ALTER TABLE public._health_check ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Health check is publicly readable" ON public._health_check
    FOR SELECT USING (true);

-- Add comment for documentation
COMMENT ON TABLE public._health_check IS 'Internal table used for database health monitoring by the backend service';
COMMENT ON FUNCTION public.update_health_check() IS 'Updates health check counter and timestamp';