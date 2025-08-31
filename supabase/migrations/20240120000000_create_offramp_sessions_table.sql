-- Create offramp_sessions table for tracking user progress through offramp flow
CREATE TABLE IF NOT EXISTS offramp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN ('amount', 'payout_method', 'bank_selection', 'account_number', 'confirmation', 'processing', 'completed')),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_offramp_sessions_user_id ON offramp_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_offramp_sessions_expires_at ON offramp_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_offramp_sessions_user_active ON offramp_sessions(user_id, expires_at);

-- Add RLS policies
ALTER TABLE offramp_sessions ENABLE ROW LEVEL SECURITY;

-- Policy for service role (full access)
DROP POLICY IF EXISTS "Service role can manage offramp sessions" ON offramp_sessions;
CREATE POLICY "Service role can manage offramp sessions" ON offramp_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Policy for authenticated users (can only access their own sessions)
DROP POLICY IF EXISTS "Users can access their own offramp sessions" ON offramp_sessions;
CREATE POLICY "Users can access their own offramp sessions" ON offramp_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE offramp_sessions IS 'Tracks user progress through multi-step offramp flow';