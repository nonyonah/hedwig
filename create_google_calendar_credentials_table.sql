-- Create Google Calendar credentials table for storing OAuth2 tokens
-- This table stores encrypted Google Calendar access tokens for users

CREATE TABLE IF NOT EXISTS public.google_calendar_credentials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    calendar_id text DEFAULT 'primary',
    connected_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_google_calendar_credentials_user_id 
ON public.google_calendar_credentials(user_id);

-- Add foreign key constraint to users table if it exists
DO $$
BEGIN
    -- Check if users table exists and add foreign key
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE public.google_calendar_credentials 
        ADD CONSTRAINT fk_google_calendar_credentials_user_id 
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- Ignore if constraint already exists
        NULL;
END $$;

-- Create or replace function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_google_calendar_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_google_calendar_credentials_updated_at ON public.google_calendar_credentials;
CREATE TRIGGER update_google_calendar_credentials_updated_at
    BEFORE UPDATE ON public.google_calendar_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_google_calendar_credentials_updated_at();

-- Add comments for documentation
COMMENT ON TABLE public.google_calendar_credentials IS 'Stores Google Calendar OAuth2 credentials for users';
COMMENT ON COLUMN public.google_calendar_credentials.user_id IS 'Reference to the user who owns these credentials';
COMMENT ON COLUMN public.google_calendar_credentials.access_token IS 'Google OAuth2 access token (encrypted)';
COMMENT ON COLUMN public.google_calendar_credentials.refresh_token IS 'Google OAuth2 refresh token (encrypted)';
COMMENT ON COLUMN public.google_calendar_credentials.calendar_id IS 'Google Calendar ID to use (defaults to primary)';
COMMENT ON COLUMN public.google_calendar_credentials.connected_at IS 'When the user first connected their calendar';
COMMENT ON COLUMN public.google_calendar_credentials.updated_at IS 'When the credentials were last updated';