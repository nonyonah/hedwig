-- Comprehensive setup script for the smart nudging system
-- Run this script to set up all required tables and columns for nudging

-- Step 1: Fix the invoices-users relationship and add nudge columns
-- Fix the relationship between invoices and users tables
-- First, check if user_id column exists and its type
DO $$
DECLARE
    column_type text;
BEGIN
    -- Check if user_id column exists and get its type
    SELECT data_type INTO column_type
    FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'user_id';
    
    -- If column doesn't exist, create it as UUID
    IF column_type IS NULL THEN
        ALTER TABLE invoices ADD COLUMN user_id UUID;
        RAISE NOTICE 'Added user_id column as UUID';
    -- If column exists but is text, convert it to UUID
    ELSIF column_type = 'text' THEN
        -- First, try to convert existing text values to UUID format
        -- This will fail if there are invalid UUID strings, so we'll handle that
        BEGIN
            -- Create a temporary UUID column
            ALTER TABLE invoices ADD COLUMN user_id_temp UUID;
            
            -- Try to convert existing text values to UUID
            UPDATE invoices 
            SET user_id_temp = user_id::UUID 
            WHERE user_id IS NOT NULL AND user_id != '';
            
            -- Drop the old text column
            ALTER TABLE invoices DROP COLUMN user_id;
            
            -- Rename the temp column
            ALTER TABLE invoices RENAME COLUMN user_id_temp TO user_id;
            
            RAISE NOTICE 'Converted user_id from text to UUID';
        EXCEPTION
            WHEN OTHERS THEN
                -- If conversion fails, drop temp column and create new UUID column
                ALTER TABLE invoices DROP COLUMN IF EXISTS user_id_temp;
                ALTER TABLE invoices DROP COLUMN user_id;
                ALTER TABLE invoices ADD COLUMN user_id UUID;
                RAISE NOTICE 'Could not convert existing user_id values, created new UUID column';
        END;
    ELSE
        RAISE NOTICE 'user_id column already exists with type: %', column_type;
    END IF;
END $$;

-- Create the foreign key relationship if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'invoices_user_id_fkey' 
        AND table_name = 'invoices'
    ) THEN
        ALTER TABLE invoices ADD CONSTRAINT invoices_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Created foreign key constraint invoices_user_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key constraint invoices_user_id_fkey already exists';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create foreign key constraint: %', SQLERRM;
END $$;

-- Step 2: Add nudge-related columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nudge_disabled BOOLEAN DEFAULT FALSE;

-- Step 3: Add nudge-related columns to payment_links
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS nudge_disabled BOOLEAN DEFAULT FALSE;

-- Step 4: Create nudge_logs table
CREATE TABLE IF NOT EXISTS nudge_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('payment_link', 'invoice')),
    target_id UUID NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    nudge_type VARCHAR(50) NOT NULL,
    message_sent TEXT NOT NULL,
    sent_via VARCHAR(20) NOT NULL DEFAULT 'email',
    success BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 5: Create indexes for better performance
-- Invoices indexes
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_viewed_at ON invoices(viewed_at);
CREATE INDEX IF NOT EXISTS idx_invoices_created_status ON invoices(date_created, status);
CREATE INDEX IF NOT EXISTS idx_invoices_nudge_count ON invoices(nudge_count);
CREATE INDEX IF NOT EXISTS idx_invoices_nudge_disabled ON invoices(nudge_disabled);

-- Payment links indexes
CREATE INDEX IF NOT EXISTS idx_payment_links_viewed_at ON payment_links(viewed_at);
CREATE INDEX IF NOT EXISTS idx_payment_links_created_status ON payment_links(created_at, status);
CREATE INDEX IF NOT EXISTS idx_payment_links_nudge_count ON payment_links(nudge_count);
CREATE INDEX IF NOT EXISTS idx_payment_links_nudge_disabled ON payment_links(nudge_disabled);

-- Nudge logs indexes
CREATE INDEX IF NOT EXISTS idx_nudge_logs_target ON nudge_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_nudge_logs_user_id ON nudge_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_nudge_logs_created_at ON nudge_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_nudge_logs_success ON nudge_logs(success);

-- Step 6: Initialize data for existing records
-- Update existing invoices to have viewed_at as date_created (assuming they were viewed when created)
UPDATE invoices SET viewed_at = date_created WHERE viewed_at IS NULL;

-- Update existing payment_links to have viewed_at as created_at (assuming they were viewed when created)
UPDATE payment_links SET viewed_at = created_at WHERE viewed_at IS NULL;

-- Initialize nudge_count to 0 for existing records
UPDATE invoices SET nudge_count = 0 WHERE nudge_count IS NULL;
UPDATE payment_links SET nudge_count = 0 WHERE nudge_count IS NULL;

-- Initialize nudge_disabled to false for existing records
UPDATE invoices SET nudge_disabled = FALSE WHERE nudge_disabled IS NULL;
UPDATE payment_links SET nudge_disabled = FALSE WHERE nudge_disabled IS NULL;

-- Step 7: Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to nudge_logs table
DROP TRIGGER IF EXISTS update_nudge_logs_updated_at ON nudge_logs;
CREATE TRIGGER update_nudge_logs_updated_at
    BEFORE UPDATE ON nudge_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Final success message
DO $$
BEGIN
    RAISE NOTICE '✅ Smart nudging system setup completed successfully!';
    RAISE NOTICE '📋 Tables updated: invoices, payment_links';
    RAISE NOTICE '🆕 Table created: nudge_logs';
    RAISE NOTICE '📊 Indexes created for optimal performance';
    RAISE NOTICE '🔗 Foreign key relationships established';
END $$;