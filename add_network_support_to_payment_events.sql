-- Add network support to payment_events table
-- This migration adds network and chain_id columns to track which blockchain network the payment occurred on

-- Add network column to payment_events table
ALTER TABLE payment_events 
ADD COLUMN IF NOT EXISTS network VARCHAR(50);

-- Add chain_id column to payment_events table  
ALTER TABLE payment_events 
ADD COLUMN IF NOT EXISTS chain_id INTEGER;

-- Add network column to invoices table for tracking payment network
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS blockchain VARCHAR(50),
ADD COLUMN IF NOT EXISTS chain_id INTEGER;

-- Add network column to proposals table for tracking payment network
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS blockchain VARCHAR(50),
ADD COLUMN IF NOT EXISTS chain_id INTEGER;

-- Add network column to payment_links table for tracking payment network
ALTER TABLE payment_links 
ADD COLUMN IF NOT EXISTS blockchain VARCHAR(50),
ADD COLUMN IF NOT EXISTS chain_id INTEGER;

-- Update the unique constraint on payment_events to include network
-- First drop the existing constraint if it exists
ALTER TABLE payment_events 
DROP CONSTRAINT IF EXISTS payment_events_transaction_hash_invoice_id_key;

-- Add new unique constraint that includes network
ALTER TABLE payment_events 
ADD CONSTRAINT payment_events_transaction_hash_invoice_id_network_key 
UNIQUE (transaction_hash, invoice_id, network);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_events_network ON payment_events(network);
CREATE INDEX IF NOT EXISTS idx_payment_events_chain_id ON payment_events(chain_id);
CREATE INDEX IF NOT EXISTS idx_invoices_blockchain ON invoices(blockchain);
CREATE INDEX IF NOT EXISTS idx_proposals_blockchain ON proposals(blockchain);
CREATE INDEX IF NOT EXISTS idx_payment_links_blockchain ON payment_links(blockchain);

-- Add comments for documentation
COMMENT ON COLUMN payment_events.network IS 'Blockchain network where the payment occurred (e.g., base, celo)';
COMMENT ON COLUMN payment_events.chain_id IS 'Chain ID of the blockchain network (e.g., 8453 for Base, 42220 for Celo)';
COMMENT ON COLUMN invoices.blockchain IS 'Blockchain network where the payment was made';
COMMENT ON COLUMN invoices.chain_id IS 'Chain ID of the payment network';
COMMENT ON COLUMN proposals.blockchain IS 'Blockchain network where the payment was made';
COMMENT ON COLUMN proposals.chain_id IS 'Chain ID of the payment network';
COMMENT ON COLUMN payment_links.blockchain IS 'Blockchain network where the payment was made';
COMMENT ON COLUMN payment_links.chain_id IS 'Chain ID of the payment network';