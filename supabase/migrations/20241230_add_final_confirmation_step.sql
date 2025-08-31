-- Add final_confirmation step to offramp_sessions table
-- This migration adds the missing 'final_confirmation' step to the step constraint

ALTER TABLE offramp_sessions 
DROP CONSTRAINT IF EXISTS offramp_sessions_step_check;

ALTER TABLE offramp_sessions 
ADD CONSTRAINT offramp_sessions_step_check 
CHECK (step IN ('amount', 'payout_method', 'bank_selection', 'account_number', 'confirmation', 'final_confirmation', 'processing', 'completed'));

-- Add comment about the change
COMMENT ON CONSTRAINT offramp_sessions_step_check ON offramp_sessions IS 'Updated to include final_confirmation step for two-phase confirmation flow';