-- Add token field to payment_events table
-- This field stores the token contract address for each payment event

ALTER TABLE payment_events 
ADD COLUMN IF NOT EXISTS token TEXT;

-- Create index for better performance on token queries
CREATE INDEX IF NOT EXISTS idx_payment_events_token ON payment_events(token);

-- Add comment to explain the column
COMMENT ON COLUMN payment_events.token IS 'Token contract address used for the payment';

-- Update existing records to set USDC as default token (Base mainnet USDC)
UPDATE payment_events 
SET token = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' 
WHERE token IS NULL;