-- Add proposal_number column to proposals table
ALTER TABLE proposals ADD COLUMN proposal_number TEXT;

-- Create index for proposal_number
CREATE INDEX IF NOT EXISTS idx_proposals_proposal_number ON proposals(proposal_number);

-- Update existing proposals to have a proposal_number
UPDATE proposals 
SET proposal_number = 'PROP-' || EXTRACT(EPOCH FROM created_at)::bigint || '-' || UPPER(SUBSTRING(id::text, 1, 8))
WHERE proposal_number IS NULL;

-- Make proposal_number NOT NULL after updating existing records
ALTER TABLE proposals ALTER COLUMN proposal_number SET NOT NULL;

-- Add unique constraint to proposal_number
ALTER TABLE proposals ADD CONSTRAINT unique_proposal_number UNIQUE (proposal_number);

-- Add comment
COMMENT ON COLUMN proposals.proposal_number IS 'Unique proposal number for identification and reference';