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

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);

-- Add missing nudge-related columns if they don't exist
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nudge_disabled BOOLEAN DEFAULT FALSE;

-- Add missing nudge-related columns to payment_links if they don't exist
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS nudge_disabled BOOLEAN DEFAULT FALSE;