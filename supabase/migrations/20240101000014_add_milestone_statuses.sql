-- Add more milestone statuses to support the complete workflow
-- This migration adds 'in_progress', 'submitted', 'changes_requested' statuses

-- Drop the existing constraint
ALTER TABLE contract_milestones DROP CONSTRAINT IF EXISTS contract_milestones_status_check;

-- Add the new constraint with additional statuses
ALTER TABLE contract_milestones ADD CONSTRAINT contract_milestones_status_check 
CHECK (status IN (
    'pending',           -- Milestone is pending start
    'in_progress',       -- Milestone work has started
    'submitted',         -- Milestone work submitted for review
    'changes_requested', -- Client requested changes
    'completed',         -- Milestone work is completed and approved
    'approved',          -- Alias for completed (for compatibility)
    'disputed',          -- Milestone is in dispute
    'paid'              -- Milestone has been paid
));

-- Add new columns to support the enhanced workflow
ALTER TABLE contract_milestones 
ADD COLUMN IF NOT EXISTS deliverables TEXT,
ADD COLUMN IF NOT EXISTS completion_notes TEXT,
ADD COLUMN IF NOT EXISTS changes_requested TEXT,
ADD COLUMN IF NOT EXISTS client_feedback TEXT,
ADD COLUMN IF NOT EXISTS approval_feedback TEXT,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS changes_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS effective_due_date DATE;

-- Create index on new status values
CREATE INDEX IF NOT EXISTS idx_contract_milestones_status_enhanced ON contract_milestones(status) 
WHERE status IN ('in_progress', 'submitted', 'changes_requested');

-- Add indexes on new timestamp columns
CREATE INDEX IF NOT EXISTS idx_contract_milestones_started_at ON contract_milestones(started_at);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_changes_requested_at ON contract_milestones(changes_requested_at);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_effective_due_date ON contract_milestones(effective_due_date);