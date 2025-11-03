-- Add new fields to contract_milestones table for enhanced milestone management

-- Add columns if they don't exist
ALTER TABLE contract_milestones 
ADD COLUMN IF NOT EXISTS deliverables TEXT,
ADD COLUMN IF NOT EXISTS completion_notes TEXT,
ADD COLUMN IF NOT EXISTS changes_requested TEXT,
ADD COLUMN IF NOT EXISTS client_feedback TEXT,
ADD COLUMN IF NOT EXISTS approval_feedback TEXT,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS changes_requested_at TIMESTAMP WITH TIME ZONE;

-- Create the milestone_status enum if it doesn't exist
DO $$ 
BEGIN
    -- Check if milestone_status enum exists
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'milestone_status') THEN
        -- Create the enum type
        CREATE TYPE milestone_status AS ENUM ('pending', 'in_progress', 'completed', 'approved');
    ELSE
        -- Add new enum values if they don't exist
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'in_progress' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'milestone_status')) THEN
                ALTER TYPE milestone_status ADD VALUE 'in_progress';
            END IF;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
        
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'approved' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'milestone_status')) THEN
                ALTER TYPE milestone_status ADD VALUE 'approved';
            END IF;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- Skip the status column type conversion for now to avoid conflicts
-- The existing status column will work fine as-is for the milestone management system

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_contract_milestones_status ON contract_milestones(status);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_due_date ON contract_milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_deadline ON contract_milestones(deadline);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_started_at ON contract_milestones(started_at);

-- Add a regular column for effective due date and populate it with a trigger
ALTER TABLE contract_milestones 
ADD COLUMN IF NOT EXISTS effective_due_date DATE;

-- Create a function to update the effective due date
CREATE OR REPLACE FUNCTION update_effective_due_date()
RETURNS TRIGGER AS $$
BEGIN
    NEW.effective_due_date = COALESCE(NEW.due_date::date, NEW.deadline::date);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update effective_due_date
DROP TRIGGER IF EXISTS update_effective_due_date_trigger ON contract_milestones;
CREATE TRIGGER update_effective_due_date_trigger
    BEFORE INSERT OR UPDATE ON contract_milestones
    FOR EACH ROW
    EXECUTE FUNCTION update_effective_due_date();

-- Update existing rows to populate effective_due_date
UPDATE contract_milestones 
SET effective_due_date = COALESCE(due_date::date, deadline::date)
WHERE effective_due_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_contract_milestones_effective_due_date ON contract_milestones(effective_due_date);

-- Ensure existing milestones have proper status values
UPDATE contract_milestones 
SET status = 'pending' 
WHERE status IS NULL;

-- Add a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_contract_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contract_milestones_updated_at ON contract_milestones;
CREATE TRIGGER contract_milestones_updated_at
    BEFORE UPDATE ON contract_milestones
    FOR EACH ROW
    EXECUTE FUNCTION update_contract_milestones_updated_at();

-- Add a comment to document the status values
COMMENT ON COLUMN contract_milestones.status IS 'Milestone status: pending, in_progress, completed, approved';