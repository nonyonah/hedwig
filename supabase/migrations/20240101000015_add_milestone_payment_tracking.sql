-- =====================================================
-- Add Payment Tracking Fields to Contract Milestones
-- =====================================================
-- This migration adds payment tracking fields to support
-- the milestone payment enhancement feature
-- =====================================================

-- First, drop the existing constraint to avoid conflicts during data updates
ALTER TABLE contract_milestones 
DROP CONSTRAINT IF EXISTS contract_milestones_status_check;

-- Add payment tracking columns to contract_milestones table
ALTER TABLE contract_milestones 
ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid' 
  CHECK (payment_status IN ('unpaid', 'paid', 'processing', 'failed')),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
ADD COLUMN IF NOT EXISTS payment_amount NUMERIC;

-- Update existing data to normalize status values and set payment_status
-- We need to do this in two steps to handle the constraint properly
UPDATE contract_milestones 
SET payment_status = CASE 
  WHEN status = 'paid' THEN 'paid'
  WHEN status = 'completed' THEN 'unpaid'
  ELSE 'unpaid'
END;

-- Now update the status values to be compliant with new constraint
UPDATE contract_milestones 
SET status = CASE 
  WHEN status = 'paid' THEN 'approved'
  WHEN status = 'completed' THEN 'approved'
  WHEN status NOT IN ('pending', 'in_progress', 'completed', 'approved') THEN 'pending'
  ELSE status
END;

-- Add the new constraint with the updated valid values
ALTER TABLE contract_milestones 
ADD CONSTRAINT contract_milestones_status_check 
CHECK (status IN ('pending', 'in_progress', 'completed', 'approved'));

-- Add indexes for payment tracking queries
CREATE INDEX IF NOT EXISTS idx_contract_milestones_payment_status 
ON contract_milestones(payment_status);

CREATE INDEX IF NOT EXISTS idx_contract_milestones_paid_at 
ON contract_milestones(paid_at);

CREATE INDEX IF NOT EXISTS idx_contract_milestones_transaction_hash 
ON contract_milestones(transaction_hash);

-- Add composite index for efficient payment queries
CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract_payment 
ON contract_milestones(contract_id, payment_status, status);

-- Update the contract_summary view to include payment information
DROP VIEW IF EXISTS contract_summary;

CREATE OR REPLACE VIEW contract_summary AS
SELECT 
  c.id,
  c.title,
  c.description,
  c.total_amount,
  c.amount_paid,
  c.token_type,
  c.chain,
  c.status,
  c.deadline,
  c.created_at,
  c.updated_at,
  c.approved_at,
  c.completed_at,
  -- Client info
  client.email as client_email,
  client.raw_user_meta_data->>'name' as client_name,
  -- Freelancer info  
  freelancer.email as freelancer_email,
  freelancer.raw_user_meta_data->>'name' as freelancer_name,
  -- Milestone stats
  COUNT(cm.id) as total_milestones,
  COUNT(CASE WHEN cm.status IN ('completed', 'approved') THEN 1 END) as completed_milestones,
  COUNT(CASE WHEN cm.status = 'approved' THEN 1 END) as approved_milestones,
  COUNT(CASE WHEN cm.payment_status = 'paid' THEN 1 END) as paid_milestones,
  COUNT(CASE WHEN cm.status = 'approved' AND cm.payment_status = 'unpaid' THEN 1 END) as unpaid_approved_milestones,
  -- Payment stats
  SUM(CASE WHEN cm.payment_status = 'paid' THEN cm.payment_amount ELSE 0 END) as total_paid_amount,
  SUM(CASE WHEN cm.status = 'approved' AND cm.payment_status = 'unpaid' THEN cm.amount ELSE 0 END) as total_unpaid_amount,
  -- Next due date
  MIN(CASE WHEN cm.status = 'pending' THEN cm.due_date END) as next_due_date,
  -- Progress percentage
  CASE 
    WHEN COUNT(cm.id) = 0 THEN 0
    ELSE ROUND((COUNT(CASE WHEN cm.status IN ('completed', 'approved') THEN 1 END)::NUMERIC / COUNT(cm.id)::NUMERIC) * 100, 2)
  END as progress_percentage,
  -- Payment percentage
  CASE 
    WHEN COUNT(cm.id) = 0 THEN 0
    ELSE ROUND((COUNT(CASE WHEN cm.payment_status = 'paid' THEN 1 END)::NUMERIC / COUNT(cm.id)::NUMERIC) * 100, 2)
  END as payment_percentage
FROM contracts c
LEFT JOIN auth.users client ON c.client_id = client.id
LEFT JOIN auth.users freelancer ON c.freelancer_id = freelancer.id
LEFT JOIN contract_milestones cm ON c.id = cm.contract_id
GROUP BY 
  c.id, c.title, c.description, c.total_amount, c.amount_paid, 
  c.token_type, c.chain, c.status, c.deadline, c.created_at, 
  c.updated_at, c.approved_at, c.completed_at,
  client.email, client.raw_user_meta_data->>'name',
  freelancer.email, freelancer.raw_user_meta_data->>'name';

-- Grant permissions on the updated view
GRANT SELECT ON contract_summary TO authenticated;

-- Add comment for documentation
COMMENT ON COLUMN contract_milestones.payment_status IS 'Tracks the payment status of the milestone: unpaid, paid, processing, failed';
COMMENT ON COLUMN contract_milestones.paid_at IS 'Timestamp when the milestone payment was completed';
COMMENT ON COLUMN contract_milestones.transaction_hash IS 'Blockchain transaction hash for the payment';
COMMENT ON COLUMN contract_milestones.payment_amount IS 'Actual amount paid for the milestone (may differ from milestone amount due to fees)';