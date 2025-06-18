-- Create wallet_creation_attempts table to track wallet creation rate limiting
CREATE TABLE IF NOT EXISTS public.wallet_creation_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  attempt_count INTEGER DEFAULT 1 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_creation_attempts_user_id ON public.wallet_creation_attempts(user_id);

-- Enable Row Level Security
ALTER TABLE public.wallet_creation_attempts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role full access
CREATE POLICY "Allow service role full access to wallet_creation_attempts"
  ON public.wallet_creation_attempts
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create trigger for updated_at timestamp
CREATE TRIGGER handle_wallet_creation_attempts_updated_at
  BEFORE UPDATE ON public.wallet_creation_attempts
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at(); 