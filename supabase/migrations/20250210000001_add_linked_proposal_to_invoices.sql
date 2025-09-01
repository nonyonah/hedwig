-- Add linked_proposal_id column to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS linked_proposal_id UUID;

-- Add foreign key constraint
ALTER TABLE invoices 
ADD CONSTRAINT fk_invoices_linked_proposal 
FOREIGN KEY (linked_proposal_id) REFERENCES proposals(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_linked_proposal_id ON invoices(linked_proposal_id);

-- Add comment
COMMENT ON COLUMN invoices.linked_proposal_id IS 'UUID of the proposal that generated this invoice';