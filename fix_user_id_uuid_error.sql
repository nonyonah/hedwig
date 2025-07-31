-- Fix for database constraint errors in invoices table
-- This script fixes both UUID type issues and NOT NULL constraint violations

-- 1. Fix user_id column type (UUID -> text)
-- Check if the user_id column exists and its type
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'invoices' AND column_name = 'user_id';

-- Add user_id column as text if it doesn't exist
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS user_id text;

-- Drop any foreign key constraints on user_id if they exist
-- (This is safe because we're storing Telegram user IDs as text)
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;

-- If the column is currently uuid type, convert it to text
DO $$
BEGIN
    -- Check if column exists and is uuid type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' 
        AND column_name = 'user_id' 
        AND data_type = 'uuid'
    ) THEN
        -- Convert uuid column to text
        ALTER TABLE invoices ALTER COLUMN user_id TYPE text USING user_id::text;
    END IF;
END $$;

-- 2. Fix NOT NULL constraints for draft invoices
-- Allow NULL values for draft invoices by making certain columns nullable
ALTER TABLE invoices ALTER COLUMN freelancer_name DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN freelancer_email DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN client_name DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN client_email DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN project_description DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN deliverables DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN price DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN wallet_address DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN blockchain DROP NOT NULL;

-- 3. Add check constraints to ensure required fields are filled for non-draft invoices
ALTER TABLE invoices ADD CONSTRAINT check_required_fields_for_sent_invoices 
CHECK (
    status = 'draft' OR (
        freelancer_name IS NOT NULL AND
        freelancer_email IS NOT NULL AND
        client_name IS NOT NULL AND
        client_email IS NOT NULL AND
        project_description IS NOT NULL AND
        deliverables IS NOT NULL AND
        price IS NOT NULL AND
        amount IS NOT NULL AND
        wallet_address IS NOT NULL AND
        blockchain IS NOT NULL
    )
);

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'invoices' AND column_name IN ('user_id', 'freelancer_name', 'client_name');

-- Show sample data to verify
SELECT id, user_id, invoice_number, status, freelancer_name, client_name
FROM invoices 
LIMIT 5;