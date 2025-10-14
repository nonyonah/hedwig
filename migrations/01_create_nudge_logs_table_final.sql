-- Create nudge_logs table for tracking nudge attempts
-- This version avoids the created_at index issue by creating it separately

-- Step 1: Create the table first
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

-- Step 2: Create indexes one by one with error handling
DO $$
BEGIN
    -- Create target index
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'nudge_logs' AND indexname = 'idx_nudge_logs_target') THEN
        CREATE INDEX idx_nudge_logs_target ON nudge_logs(target_type, target_id);
        RAISE NOTICE 'Created index: idx_nudge_logs_target';
    END IF;
    
    -- Create user_id index
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'nudge_logs' AND indexname = 'idx_nudge_logs_user_id') THEN
        CREATE INDEX idx_nudge_logs_user_id ON nudge_logs(user_id);
        RAISE NOTICE 'Created index: idx_nudge_logs_user_id';
    END IF;
    
    -- Create success index
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'nudge_logs' AND indexname = 'idx_nudge_logs_success') THEN
        CREATE INDEX idx_nudge_logs_success ON nudge_logs(success);
        RAISE NOTICE 'Created index: idx_nudge_logs_success';
    END IF;
    
    -- Try to create created_at index with error handling
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'nudge_logs' AND indexname = 'idx_nudge_logs_created_at') THEN
            CREATE INDEX idx_nudge_logs_created_at ON nudge_logs(created_at);
            RAISE NOTICE 'Created index: idx_nudge_logs_created_at';
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not create created_at index: %', SQLERRM;
    END;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating indexes: %', SQLERRM;
END $$;

-- Step 3: Verify table was created successfully
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nudge_logs') THEN
        RAISE NOTICE '✅ nudge_logs table created successfully';
    ELSE
        RAISE NOTICE '❌ nudge_logs table creation failed';
    END IF;
END $$;