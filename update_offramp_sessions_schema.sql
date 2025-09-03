-- Update the offramp_sessions table to include new step values for Paycrest Sender API flow

-- First, drop the existing check constraint if it exists
ALTER TABLE offramp_sessions DROP CONSTRAINT IF EXISTS offramp_sessions_step_check;

-- Add the new check constraint with all step values including the new ones
ALTER TABLE offramp_sessions ADD CONSTRAINT offramp_sessions_step_check 
CHECK (step IN (
  'amount', 
  'payout_method', 
  'bank_selection', 
  'account_number', 
  'confirmation', 
  'final_confirmation', 
  'processing', 
  'completed',
  'creating_order',
  'awaiting_transfer',
  'transferring_tokens',
  'transfer_completed'
));

-- Add new columns to the data JSONB field (these will be added dynamically as needed)
-- No schema changes needed for JSONB fields as they are flexible

-- Optional: Add comments to document the new step values
COMMENT ON COLUMN offramp_sessions.step IS 'Current step in the offramp process. New Paycrest Sender API steps: creating_order, awaiting_transfer, transferring_tokens, transfer_completed';