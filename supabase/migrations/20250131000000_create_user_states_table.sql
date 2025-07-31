-- Create user_states table for managing user workflow states
CREATE TABLE IF NOT EXISTS public.user_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  state_type text NOT NULL,
  state_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, state_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_states_user_id ON public.user_states(user_id);
CREATE INDEX IF NOT EXISTS idx_user_states_type ON public.user_states(state_type);

-- Enable RLS
ALTER TABLE public.user_states ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Allow service role access" ON public.user_states
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create policy for authenticated users to access their own states
CREATE POLICY "Users can access their own states" ON public.user_states
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);