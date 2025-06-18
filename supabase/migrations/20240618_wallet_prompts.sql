-- Create the wallet_prompts table to track when wallet prompts were shown to users
CREATE TABLE IF NOT EXISTS public.wallet_prompts (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id text NOT NULL,
    prompt_shown boolean DEFAULT true NOT NULL,
    shown_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Add a unique constraint to ensure only one record per user
CREATE UNIQUE INDEX IF NOT EXISTS wallet_prompts_user_id_idx ON public.wallet_prompts (user_id);

-- Enable Row Level Security
ALTER TABLE public.wallet_prompts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations from service role
CREATE POLICY "Allow all operations from service role" ON public.wallet_prompts
    USING (true)
    WITH CHECK (true);

-- Add a comment to the table
COMMENT ON TABLE public.wallet_prompts IS 'Tracks when wallet prompts were shown to users to avoid duplicate prompts'; 