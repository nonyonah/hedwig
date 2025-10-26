-- =====================================================
-- Add Contract ID Column to Invoices Table
-- =====================================================
-- This migration adds a contract_id column to the invoices table
-- to link invoices back to their originating contracts
-- =====================================================

-- Add contract_id column to invoices table if it doesn't exist
DO $$
BEGIN
    -- Add contract_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'contract_id') THEN
        ALTER TABLE invoices ADD COLUMN contract_id UUID;
    END IF;
    
    -- Add project_contract_id column if it doesn't exist (for legacy contracts)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'project_contract_id') THEN
        ALTER TABLE invoices ADD COLUMN project_contract_id UUID;
    END IF;
END $$;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_invoices_contract_id ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project_contract_id ON invoices(project_contract_id);

-- Add foreign key constraints if the referenced tables exist
DO $$
BEGIN
    -- Add foreign key to contracts table if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contracts') THEN
        ALTER TABLE invoices 
        ADD CONSTRAINT invoices_contract_id_fkey 
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
    END IF;
    
    -- Add foreign key to project_contracts table if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_contracts') THEN
        ALTER TABLE invoices 
        ADD CONSTRAINT invoices_project_contract_id_fkey 
        FOREIGN KEY (project_contract_id) REFERENCES project_contracts(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- Constraints already exist, ignore
        NULL;
END $$;