-- =====================================================
-- Fix Contracts 2.0 Schema Issues
-- =====================================================
-- This migration fixes column reference issues and ensures
-- all tables have the correct schema
-- =====================================================

-- Drop existing views first (they depend on tables)
DROP VIEW IF EXISTS contract_summary CASCADE;

-- Check and add missing columns to existing tables
-- Add client_id to contracts table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'client_id') THEN
        ALTER TABLE contracts ADD COLUMN client_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Add freelancer_id to contracts table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'freelancer_id') THEN
        ALTER TABLE contracts ADD COLUMN freelancer_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Add token_type to contracts table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'token_type') THEN
        ALTER TABLE contracts ADD COLUMN token_type TEXT NOT NULL DEFAULT 'USDC';
    END IF;
END $$;

-- Add chain to contracts table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'chain') THEN
        ALTER TABLE contracts ADD COLUMN chain TEXT NOT NULL DEFAULT 'base';
    END IF;
END $$;

-- Add client_email to contracts table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'client_email') THEN
        ALTER TABLE contracts ADD COLUMN client_email TEXT;
    END IF;
END $$;

-- Add missing columns to contract_invoices table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contract_invoices' AND column_name = 'token_type') THEN
        ALTER TABLE contract_invoices ADD COLUMN token_type TEXT NOT NULL DEFAULT 'USDC';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contract_invoices' AND column_name = 'chain') THEN
        ALTER TABLE contract_invoices ADD COLUMN chain TEXT NOT NULL DEFAULT 'base';
    END IF;
END $$;

-- Add missing columns to contract_milestones table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contract_milestones' AND column_name = 'completed_at') THEN
        ALTER TABLE contract_milestones ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add missing columns to contracts table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'completed_at') THEN
        ALTER TABLE contracts ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'approved_at') THEN
        ALTER TABLE contracts ADD COLUMN approved_at TIMESTAMPTZ;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'total_amount') THEN
        ALTER TABLE contracts ADD COLUMN total_amount NUMERIC NOT NULL DEFAULT 0;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'amount_paid') THEN
        ALTER TABLE contracts ADD COLUMN amount_paid NUMERIC DEFAULT 0;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'deadline') THEN
        ALTER TABLE contracts ADD COLUMN deadline TIMESTAMPTZ;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'title') THEN
        ALTER TABLE contracts ADD COLUMN title TEXT NOT NULL DEFAULT 'Untitled Contract';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'description') THEN
        ALTER TABLE contracts ADD COLUMN description TEXT;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'status') THEN
        ALTER TABLE contracts ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'approval_token') THEN
        ALTER TABLE contracts ADD COLUMN approval_token TEXT UNIQUE;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contracts' AND column_name = 'legal_contract_id') THEN
        ALTER TABLE contracts ADD COLUMN legal_contract_id UUID REFERENCES legal_contracts(id);
    END IF;
END $$;

-- Drop existing triggers
DROP TRIGGER IF EXISTS update_legal_contracts_updated_at ON legal_contracts;
DROP TRIGGER IF EXISTS update_contracts_updated_at ON contracts;
DROP TRIGGER IF EXISTS update_contract_milestones_updated_at ON contract_milestones;
DROP TRIGGER IF EXISTS update_contract_invoices_updated_at ON contract_invoices;

-- Drop existing functions that might have issues
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS get_token_address(TEXT, TEXT) CASCADE;

-- Recreate the functions with correct syntax
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_token_address(token_type TEXT, chain TEXT)
RETURNS TEXT AS $$
BEGIN
  CASE 
    WHEN token_type = 'USDC' AND chain = 'base' THEN
      RETURN '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    WHEN token_type = 'USDC' AND chain = 'ethereum' THEN
      RETURN '0xA0b86a33E6441E6C8D3C1C4C9C8C6C8C6C8C6C8C';
    WHEN token_type = 'ETH' AND chain = 'ethereum' THEN
      RETURN '0x0000000000000000000000000000000000000000';
    WHEN token_type = 'ETH' AND chain = 'base' THEN
      RETURN '0x4200000000000000000000000000000000000006';
    ELSE
      RETURN NULL;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Ensure contract_milestones has proper status constraint
ALTER TABLE contract_milestones DROP CONSTRAINT IF EXISTS contract_milestones_status_check;
ALTER TABLE contract_milestones ADD CONSTRAINT contract_milestones_status_check 
  CHECK (status IN ('pending', 'completed', 'paid'));

-- Recreate the updated_at triggers
CREATE TRIGGER update_legal_contracts_updated_at
  BEFORE UPDATE ON legal_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contract_milestones_updated_at
  BEFORE UPDATE ON contract_milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contract_invoices_updated_at
  BEFORE UPDATE ON contract_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Recreate the contract summary view
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
  COUNT(CASE WHEN cm.status = 'completed' THEN 1 END) as completed_milestones,
  COUNT(CASE WHEN cm.status = 'paid' THEN 1 END) as paid_milestones,
  -- Next due date
  MIN(CASE WHEN cm.status = 'pending' THEN cm.due_date END) as next_due_date,
  -- Progress percentage
  CASE 
    WHEN COUNT(cm.id) = 0 THEN 0
    ELSE ROUND((COUNT(CASE WHEN cm.status = 'completed' THEN 1 END)::NUMERIC / COUNT(cm.id)::NUMERIC) * 100, 2)
  END as progress_percentage
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

-- Grant permissions on the view
GRANT SELECT ON contract_summary TO authenticated;