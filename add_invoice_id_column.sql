-- Run this SQL in your Supabase SQL Editor to add the missing invoice_id column
-- This fixes the error: column contract_milestones.invoice_id does not exist

ALTER TABLE contract_milestones 
ADD COLUMN IF NOT EXISTS invoice_id UUID;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_contract_milestones_invoice_id 
ON contract_milestones(invoice_id);

-- Add comment for documentation
COMMENT ON COLUMN contract_milestones.invoice_id IS 'Reference to the invoice generated for this milestone payment';

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'contract_milestones' 
AND column_name = 'invoice_id';
