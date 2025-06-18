-- Create wallet_creation_attempts table to track wallet creation attempts
CREATE TABLE IF NOT EXISTS public.wallet_creation_attempts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    attempt_count integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_creation_attempts_user_id ON public.wallet_creation_attempts(user_id);

-- Create wallet_prompts table to track when wallet creation prompts have been shown
CREATE TABLE IF NOT EXISTS public.wallet_prompts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL,
    prompt_shown boolean DEFAULT false NOT NULL,
    shown_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_prompts_user_id ON public.wallet_prompts(user_id);

-- Add trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    new.updated_at = timezone('utc'::text, now());
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER handle_wallet_creation_attempts_updated_at
    BEFORE UPDATE ON public.wallet_creation_attempts
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER handle_wallet_prompts_updated_at
    BEFORE UPDATE ON public.wallet_prompts
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Enable RLS on the new tables
ALTER TABLE public.wallet_creation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_prompts ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for the new tables
CREATE POLICY "Service role can manage all wallet creation attempts"
    ON public.wallet_creation_attempts FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all wallet prompts"
    ON public.wallet_prompts FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role'); 