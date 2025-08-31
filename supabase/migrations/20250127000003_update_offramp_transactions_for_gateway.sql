-- Migration: Update offramp_transactions table for new Paycrest Gateway contract integration
-- This migration adds new fields for Gateway contract and removes old payout_id field

-- Add new columns for Gateway contract integration
ALTER TABLE offramp_transactions 
ADD COLUMN IF NOT EXISTS gateway_id TEXT,
ADD COLUMN IF NOT EXISTS receive_address TEXT,
ADD COLUMN IF NOT EXISTS order_id TEXT;

-- Remove old payout_id column (after ensuring no active transactions depend on it)
-- Note: Uncomment the following line only after confirming no active transactions use payout_id
-- ALTER TABLE offramp_transactions DROP COLUMN IF EXISTS payout_id;

-- Update indexes
DROP INDEX IF EXISTS idx_offramp_transactions_payout_id;
CREATE INDEX IF NOT EXISTS idx_offramp_transactions_gateway_id ON offramp_transactions(gateway_id);
CREATE INDEX IF NOT EXISTS idx_offramp_transactions_order_id ON offramp_transactions(order_id);

-- Update comments
COMMENT ON COLUMN offramp_transactions.gateway_id IS 'Paycrest Gateway ID for the order';
COMMENT ON COLUMN offramp_transactions.receive_address IS 'Blockchain address to receive tokens for the order';
COMMENT ON COLUMN offramp_transactions.order_id IS 'Paycrest order ID for tracking the transaction';