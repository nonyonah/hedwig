-- =====================================================
-- Add Signature Columns to Project Contracts
-- =====================================================
-- This migration adds columns to store signature-based approval data
-- =====================================================

-- Add signature-related columns to project_contracts table
DO $$
BEGIN
    -- Add approval_signature column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'approval_signature') THEN
        ALTER TABLE project_contracts ADD COLUMN approval_signature TEXT;
    END IF;
    
    -- Add approval_message column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'approval_message') THEN
        ALTER TABLE project_contracts ADD COLUMN approval_message TEXT;
    END IF;
    
    -- Add client_wallet column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_contracts' AND column_name = 'client_wallet') THEN
        ALTER TABLE project_contracts ADD COLUMN client_wallet TEXT;
    END IF;
END $$;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_project_contracts_approval_signature ON project_contracts(approval_signature);
CREATE INDEX IF NOT EXISTS idx_project_contracts_client_wallet ON project_contracts(client_wallet);