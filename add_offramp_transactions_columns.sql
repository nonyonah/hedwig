-- Add missing columns to offramp_transactions table
-- This script adds columns that are referenced in the code but missing from the actual database schema

-- Add paycrest_order_id column if it doesn't exist
ALTER TABLE offramp_transactions 
ADD COLUMN IF NOT EXISTS paycrest_order_id VARCHAR(255);

-- Add receive_address column if it doesn't exist
ALTER TABLE offramp_transactions 
ADD COLUMN IF NOT EXISTS receive_address VARCHAR(255);

-- Add tx_hash column if it doesn't exist
ALTER TABLE offramp_transactions 
ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255);

-- Add gateway_id column if it doesn't exist
ALTER TABLE offramp_transactions 
ADD COLUMN IF NOT EXISTS gateway_id VARCHAR(255);

-- Add error_message column if it doesn't exist
ALTER TABLE offramp_transactions 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add error_step column if it doesn't exist
ALTER TABLE offramp_transactions 
ADD COLUMN IF NOT EXISTS error_step VARCHAR(100);

-- Add expires_at column if it doesn't exist
ALTER TABLE offramp_transactions 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Add updated_at column if it doesn't exist (created_at should already exist)
ALTER TABLE offramp_transactions 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_offramp_transactions_paycrest_order_id 
ON offramp_transactions(paycrest_order_id);

CREATE INDEX IF NOT EXISTS idx_offramp_transactions_user_id 
ON offramp_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_offramp_transactions_status 
ON offramp_transactions(status);

-- Add comments to document the columns
COMMENT ON COLUMN offramp_transactions.paycrest_order_id IS 'Paycrest order ID for tracking the transaction';
COMMENT ON COLUMN offramp_transactions.receive_address IS 'Blockchain address where tokens should be sent';
COMMENT ON COLUMN offramp_transactions.tx_hash IS 'Blockchain transaction hash';
COMMENT ON COLUMN offramp_transactions.gateway_id IS 'Gateway transaction identifier';
COMMENT ON COLUMN offramp_transactions.error_message IS 'Error message if transaction failed';
COMMENT ON COLUMN offramp_transactions.error_step IS 'Step where error occurred';
COMMENT ON COLUMN offramp_transactions.expires_at IS 'When the transaction expires';