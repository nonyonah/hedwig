-- Add linked_invoice_id column to proposals table
-- This allows proposals to be linked to auto-generated invoices

ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS linked_invoice_id UUID;

-- Add foreign key constraint to link to invoices table
ALTER TABLE proposals 
ADD CONSTRAINT fk_proposals_linked_invoice 
FOREIGN KEY (linked_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_proposals_linked_invoice_id ON proposals(linked_invoice_id);

-- Add comment for clarity
COMMENT ON COLUMN proposals.linked_invoice_id IS 'UUID of the auto-generated invoice linked to this proposal';