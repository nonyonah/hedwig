-- Add missing columns to proposals table for acceptance flow

-- Add accepted_at column to track when proposal was accepted
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE;

-- Add invoice_id column to link proposal to generated invoice
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS invoice_id UUID;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_proposals_accepted_at ON proposals(accepted_at);
CREATE INDEX IF NOT EXISTS idx_proposals_invoice_id ON proposals(invoice_id);

-- Add comments for the new columns
COMMENT ON COLUMN proposals.accepted_at IS 'Timestamp when the proposal was accepted by the client';
COMMENT ON COLUMN proposals.invoice_id IS 'UUID of the invoice generated when proposal is accepted';