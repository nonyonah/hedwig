-- Add paid_at columns to invoices and proposals tables
-- This script can be run manually in the Supabase SQL editor

-- Add paid_at column to invoices table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'paid_at') THEN
        ALTER TABLE invoices ADD COLUMN paid_at TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_invoices_paid_at ON invoices(paid_at);
    END IF;
END $$;

-- Add paid_at column to proposals table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'paid_at') THEN
        ALTER TABLE proposals ADD COLUMN paid_at TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_proposals_paid_at ON proposals(paid_at);
    END IF;
END $$;

-- Add payment_transaction column to invoices table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'payment_transaction') THEN
        ALTER TABLE invoices ADD COLUMN payment_transaction TEXT;
        CREATE INDEX IF NOT EXISTS idx_invoices_payment_transaction ON invoices(payment_transaction);
    END IF;
END $$;

-- Add payment_transaction column to proposals table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'payment_transaction') THEN
        ALTER TABLE proposals ADD COLUMN payment_transaction TEXT;
        CREATE INDEX IF NOT EXISTS idx_proposals_payment_transaction ON proposals(payment_transaction);
    END IF;
END $$;

-- Update paid_at for existing paid invoices (set to current timestamp as fallback)
UPDATE invoices 
SET paid_at = NOW() 
WHERE status = 'paid' AND paid_at IS NULL;

-- Update paid_at for existing accepted proposals (set to current timestamp as fallback)
UPDATE proposals 
SET paid_at = NOW() 
WHERE status = 'accepted' AND paid_at IS NULL;