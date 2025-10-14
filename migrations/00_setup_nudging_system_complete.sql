-- Comprehensive setup script for the smart nudging system
-- This version handles all known issues and creates everything step by step

-- Step 1: Fix the invoices-users relationship
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
        BEGIN
            -- Create a temporary UUID column
            ALTER TABLE invoices ADD COLUMN user_id_temp UUID;
            
            -- Try to convert existing text values to UUID
            UPDATE invoices 
            SET user_id_temp = user_id::UUID 
            WHERE user_id IS NOT NULL AND user_id != '' AND user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
            
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

-- Step 2: Create the foreign key relationship if it doesn't exist
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

-- Step 3: Add nudge-related columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nudge_disabled BOOLEAN DEFAULT FALSE;

-- Step 4: Add nudge-related columns to payment_links
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS nudge_disabled BOOLEAN DEFAULT FALSE;

-- Step 5: Create nudge_logs table (without problematic indexes initially)
CREATE TABLE IF NOT EXISTS nudge_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('payment_link', 'invoice')),
    target_id UUID NOT NULL,
    user_id UUID,
    nudge_type VARCHAR(50) NOT NULL,
    message_sent TEXT NOT NULL,
    sent_via VARCHAR(20) NOT NULL DEFAULT 'email',
    success BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 6: Add foreign key to nudge_logs after table is created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'nudge_logs_user_id_fkey' 
        AND table_name = 'nudge_logs'
    ) THEN
        ALTER TABLE nudge_logs ADD CONSTRAINT nudge_logs_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Created foreign key constraint nudge_logs_user_id_fkey';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create nudge_logs foreign key constraint: %', SQLERRM;
END $$;

-- Step 7: Create indexes with error handling
DO $$
BEGIN
    -- Invoices indexes
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
        RAISE NOTICE 'Created index: idx_invoices_user_id';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create idx_invoices_user_id: %', SQLERRM;
    END;
    
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_invoices_viewed_at ON invoices(viewed_at);
        RAISE NOTICE 'Created index: idx_invoices_viewed_at';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create idx_invoices_viewed_at: %', SQLERRM;
    END;
    
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_invoices_nudge_count ON invoices(nudge_count);
        RAISE NOTICE 'Created index: idx_invoices_nudge_count';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create idx_invoices_nudge_count: %', SQLERRM;
    END;
    
    -- Payment links indexes
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_payment_links_viewed_at ON payment_links(viewed_at);
        RAISE NOTICE 'Created index: idx_payment_links_viewed_at';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create idx_payment_links_viewed_at: %', SQLERRM;
    END;
    
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_payment_links_nudge_count ON payment_links(nudge_count);
        RAISE NOTICE 'Created index: idx_payment_links_nudge_count';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create idx_payment_links_nudge_count: %', SQLERRM;
    END;
    
    -- Nudge logs indexes
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_nudge_logs_target ON nudge_logs(target_type, target_id);
        RAISE NOTICE 'Created index: idx_nudge_logs_target';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create idx_nudge_logs_target: %', SQLERRM;
    END;
    
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_nudge_logs_user_id ON nudge_logs(user_id);
        RAISE NOTICE 'Created index: idx_nudge_logs_user_id';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create idx_nudge_logs_user_id: %', SQLERRM;
    END;
    
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_nudge_logs_success ON nudge_logs(success);
        RAISE NOTICE 'Created index: idx_nudge_logs_success';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create idx_nudge_logs_success: %', SQLERRM;
    END;
    
END $$;

-- Step 8: Initialize data for existing records
UPDATE invoices SET viewed_at = date_created WHERE viewed_at IS NULL AND date_created IS NOT NULL;
UPDATE payment_links SET viewed_at = created_at WHERE viewed_at IS NULL AND created_at IS NOT NULL;
UPDATE invoices SET nudge_count = 0 WHERE nudge_count IS NULL;
UPDATE payment_links SET nudge_count = 0 WHERE nudge_count IS NULL;
UPDATE invoices SET nudge_disabled = FALSE WHERE nudge_disabled IS NULL;
UPDATE payment_links SET nudge_disabled = FALSE WHERE nudge_disabled IS NULL;

-- Step 9: Final verification
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nudge_logs') THEN
        RAISE NOTICE '✅ Smart nudging system setup completed successfully!';
        RAISE NOTICE '📋 Tables updated: invoices, payment_links';
        RAISE NOTICE '🆕 Table created: nudge_logs';
        RAISE NOTICE '📊 Indexes created with error handling';
        RAISE NOTICE '🔗 Foreign key relationships established';
    ELSE
        RAISE NOTICE '❌ Setup failed - nudge_logs table not found';
    END IF;
END $$;