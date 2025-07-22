-- Create user_preferences table for managing earnings summary preferences
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT NOT NULL UNIQUE,
    monthly_reports_enabled BOOLEAN DEFAULT true,
    preferred_currency TEXT DEFAULT 'USD',
    preferred_categories TEXT[] DEFAULT '{}',
    timezone TEXT DEFAULT 'UTC',
    last_report_sent TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_wallet_address ON public.user_preferences(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_preferences_monthly_enabled ON public.user_preferences(monthly_reports_enabled);
CREATE INDEX IF NOT EXISTS idx_user_preferences_last_report ON public.user_preferences(last_report_sent);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for RLS
CREATE POLICY "Users can view their own preferences" ON public.user_preferences
    FOR SELECT USING (true); -- Allow reading for now, can be restricted later

CREATE POLICY "Users can insert their own preferences" ON public.user_preferences
    FOR INSERT WITH CHECK (true); -- Allow inserting for now

CREATE POLICY "Users can update their own preferences" ON public.user_preferences
    FOR UPDATE USING (true); -- Allow updating for now

CREATE POLICY "Service role can manage all preferences" ON public.user_preferences
    FOR ALL USING (auth.role() = 'service_role');

-- Create trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.user_preferences IS 'User preferences for earnings summaries and notifications';
COMMENT ON COLUMN public.user_preferences.wallet_address IS 'User wallet address (lowercase)';
COMMENT ON COLUMN public.user_preferences.monthly_reports_enabled IS 'Whether user wants monthly earnings reports';
COMMENT ON COLUMN public.user_preferences.preferred_currency IS 'Preferred fiat currency for conversions';
COMMENT ON COLUMN public.user_preferences.preferred_categories IS 'Array of preferred earning categories to highlight';
COMMENT ON COLUMN public.user_preferences.timezone IS 'User timezone for scheduling reports';
COMMENT ON COLUMN public.user_preferences.last_report_sent IS 'Timestamp of last monthly report sent';