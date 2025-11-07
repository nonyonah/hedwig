-- Add invoice_id column to contract_milestones if it doesn't exist
ALTER TABLE contract_milestones 
ADD COLUMN IF NOT EXISTS invoice_id UUID;

-- Add index for invoice_id
CREATE INDEX IF NOT EXISTS idx_contract_milestones_invoice_id 
ON contract_milestones(invoice_id);

-- Add comment for documentation
COMMENT ON COLUMN contract_milestones.invoice_id IS 'Reference to the invoice generated for this milestone payment';
