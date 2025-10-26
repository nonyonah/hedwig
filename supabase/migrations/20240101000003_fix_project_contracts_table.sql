-- =====================================================
-- Fix Project Contracts Table Issues
-- =====================================================
-- This migration fixes the existing project_contracts table
-- to work with the current codebase
-- =====================================================

-- First, drop the existing foreign key constraints that reference the wrong table
ALTER TABLE project_contracts DROP CONSTRAINT IF EXISTS project_contracts_client_id_fkey;
ALTER TABLE project_contracts DROP CONSTRAINT IF EXISTS project_contracts_freelancer_id_fkey;

-- Drop the existing function with wrong syntax
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Recreate the function with correct syntax
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add missing columns that the code expects
DO $$ 
BEGIN
    -- Add client_email column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'client_email') THEN
        ALTER TABLE project_contracts ADD COLUMN client_email TEXT;
    END IF;
    
    -- Add title column if it doesn't exist (alias for project_title)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'title') THEN
        ALTER TABLE project_contracts ADD COLUMN title TEXT;
    END IF;
    
    -- Add legal_contract_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'legal_contract_id') THEN
        ALTER TABLE project_contracts ADD COLUMN legal_contract_id UUID;
    END IF;
    
    -- Add currency/token_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'currency') THEN
        ALTER TABLE project_contracts ADD COLUMN currency TEXT DEFAULT 'USDC';
    END IF;
    
    -- Add token_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'token_type') THEN
        ALTER TABLE project_contracts ADD COLUMN token_type TEXT DEFAULT 'USDC';
    END IF;
    
    -- Add approval_token column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'approval_token') THEN
        ALTER TABLE project_contracts ADD COLUMN approval_token TEXT UNIQUE;
    END IF;
    
    -- Add decline_reason column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'decline_reason') THEN
        ALTER TABLE project_contracts ADD COLUMN decline_reason TEXT;
    END IF;
    
    -- Add contract_text column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'contract_text') THEN
        ALTER TABLE project_contracts ADD COLUMN contract_text TEXT;
    END IF;
    
    -- Add contract_hash column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'contract_hash') THEN
        ALTER TABLE project_contracts ADD COLUMN contract_hash TEXT;
    END IF;
END $$;

-- Update existing data to populate title from project_title
UPDATE project_contracts SET title = project_title WHERE title IS NULL AND project_title IS NOT NULL;

-- Update existing data to populate token_type from chain defaults
UPDATE project_contracts 
SET token_type = CASE 
    WHEN chain = 'base' THEN 'USDC'
    WHEN chain = 'celo' THEN 'cUSD'
    ELSE 'USDC'
END 
WHERE token_type IS NULL;

UPDATE project_contracts 
SET currency = token_type 
WHERE currency IS NULL AND token_type IS NOT NULL;

-- Recreate foreign key constraints with correct references
-- Note: We'll make these nullable for now to avoid constraint violations
ALTER TABLE project_contracts 
ADD CONSTRAINT project_contracts_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE project_contracts 
ADD CONSTRAINT project_contracts_freelancer_id_fkey 
FOREIGN KEY (freelancer_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add foreign key for legal_contract_id if legal_contracts table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'legal_contracts') THEN
        ALTER TABLE project_contracts 
        ADD CONSTRAINT project_contracts_legal_contract_id_fkey 
        FOREIGN KEY (legal_contract_id) REFERENCES legal_contracts(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Recreate the triggers with the fixed function
DROP TRIGGER IF EXISTS update_project_contracts_updated_at ON project_contracts;
CREATE TRIGGER update_project_contracts_updated_at 
    BEFORE UPDATE ON project_contracts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update the status constraint to include statuses the code expects
ALTER TABLE project_contracts DROP CONSTRAINT IF EXISTS project_contracts_status_check;
ALTER TABLE project_contracts ADD CONSTRAINT project_contracts_status_check 
CHECK (status IN (
    'created',      -- Contract created, waiting for funding
    'pending',      -- Alias for created (code compatibility)
    'funded',       -- Client has funded the contract
    'in_progress',  -- Work has started
    'active',       -- Alias for in_progress (code compatibility)
    'completed',    -- Freelancer marked as completed
    'approved',     -- Client approved completion
    'disputed',     -- In dispute resolution
    'cancelled',    -- Contract cancelled
    'refunded',     -- Funds refunded to client
    'generated'     -- Contract generated but not yet created (code compatibility)
));

-- Fix contract_milestones table to have due_date column (alias for deadline)
DO $$ 
BEGIN
    -- Add due_date column if it doesn't exist (alias for deadline)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contract_milestones' AND column_name = 'due_date') THEN
        ALTER TABLE contract_milestones ADD COLUMN due_date TIMESTAMPTZ;
    END IF;
END $$;

-- Update existing milestones to populate due_date from deadline
UPDATE contract_milestones SET due_date = deadline WHERE due_date IS NULL AND deadline IS NOT NULL;

-- Create a trigger to keep due_date and deadline in sync
CREATE OR REPLACE FUNCTION sync_milestone_dates()
RETURNS TRIGGER AS $$
BEGIN
    -- If deadline is updated, update due_date
    IF NEW.deadline IS DISTINCT FROM OLD.deadline THEN
        NEW.due_date = NEW.deadline;
    END IF;
    
    -- If due_date is updated, update deadline
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
        NEW.deadline = NEW.due_date;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_milestone_dates_trigger ON contract_milestones;
CREATE TRIGGER sync_milestone_dates_trigger
    BEFORE UPDATE ON contract_milestones
    FOR EACH ROW EXECUTE FUNCTION sync_milestone_dates();

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_project_contracts_client_email ON project_contracts(client_email);
CREATE INDEX IF NOT EXISTS idx_project_contracts_title ON project_contracts(title);
CREATE INDEX IF NOT EXISTS idx_project_contracts_legal_contract_id ON project_contracts(legal_contract_id);
CREATE INDEX IF NOT EXISTS idx_project_contracts_approval_token ON project_contracts(approval_token);
CREATE INDEX IF NOT EXISTS idx_project_contracts_token_type ON project_contracts(token_type);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_due_date ON contract_milestones(due_date);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON project_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_extension_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_notifications TO authenticated;

-- Update RLS policies to work with auth.users
DROP POLICY IF EXISTS "Users can view their own contracts" ON project_contracts;
DROP POLICY IF EXISTS "Users can create contracts as client" ON project_contracts;
DROP POLICY IF EXISTS "Users can update their own contracts" ON project_contracts;

CREATE POLICY "Users can view their own contracts" ON project_contracts
    FOR SELECT USING (
        auth.uid() = client_id OR 
        auth.uid() = freelancer_id
    );

CREATE POLICY "Users can create contracts as client" ON project_contracts
    FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Users can update their own contracts" ON project_contracts
    FOR UPDATE USING (
        auth.uid() = client_id OR 
        auth.uid() = freelancer_id
    );

-- Allow service role to manage all contracts (for system operations)
CREATE POLICY "Service role can manage all contracts" ON project_contracts
    FOR ALL USING (true);

-- Update the contract_summary view to work with auth.users
DROP VIEW IF EXISTS contract_summary CASCADE;

CREATE OR REPLACE VIEW contract_summary AS
SELECT 
    pc.*,
    client_user.email as client_email_from_auth,
    client_user.raw_user_meta_data->>'name' as client_name_from_auth,
    freelancer_user.email as freelancer_email_from_auth,
    freelancer_user.raw_user_meta_data->>'name' as freelancer_name_from_auth,
    COUNT(cm.id) as milestone_count,
    COUNT(CASE WHEN cm.status = 'completed' THEN 1 END) as completed_milestones,
    COUNT(cer.id) as total_extension_requests,
    COUNT(CASE WHEN cer.approved = true THEN 1 END) as approved_extensions
FROM project_contracts pc
LEFT JOIN auth.users client_user ON pc.client_id = client_user.id
LEFT JOIN auth.users freelancer_user ON pc.freelancer_id = freelancer_user.id
LEFT JOIN contract_milestones cm ON pc.id = cm.contract_id
LEFT JOIN contract_extension_requests cer ON pc.id = cer.contract_id
GROUP BY pc.id, client_user.email, client_user.raw_user_meta_data, freelancer_user.email, freelancer_user.raw_user_meta_data;

-- Grant permissions on the view
GRANT SELECT ON contract_summary TO authenticated;