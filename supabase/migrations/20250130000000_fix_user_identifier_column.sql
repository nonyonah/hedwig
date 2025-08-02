-- Fix user_identifier column issue in proposals table
-- This migration ensures the user_identifier column exists and handles the migration properly

DO $$ 
BEGIN
    -- Check if user_identifier column exists in proposals table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'user_identifier') THEN
        -- Add user_identifier column if it doesn't exist
        ALTER TABLE proposals ADD COLUMN user_identifier UUID;
        
        -- Update existing proposals to set user_identifier from user_id if user_id exists
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'user_id') THEN
            UPDATE proposals 
            SET user_identifier = user_id 
            WHERE user_id IS NOT NULL;
        END IF;
        
        RAISE NOTICE 'Added user_identifier column to proposals table';
    ELSE
        RAISE NOTICE 'user_identifier column already exists in proposals table';
    END IF;
    
    -- Ensure user_id column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'user_id') THEN
        ALTER TABLE proposals ADD COLUMN user_id UUID;
        
        -- Update user_id from user_identifier if user_identifier exists and has valid UUIDs
        UPDATE proposals 
        SET user_id = user_identifier 
        WHERE user_identifier IS NOT NULL;
        
        RAISE NOTICE 'Added user_id column to proposals table';
    ELSE
        RAISE NOTICE 'user_id column already exists in proposals table';
    END IF;
    
    -- Make user_identifier nullable to avoid constraint issues
    ALTER TABLE proposals ALTER COLUMN user_identifier DROP NOT NULL;
    
    -- Add index for better performance if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'proposals' AND indexname = 'idx_proposals_user_identifier') THEN
        CREATE INDEX idx_proposals_user_identifier ON proposals(user_identifier);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'proposals' AND indexname = 'idx_proposals_user_id') THEN
        CREATE INDEX idx_proposals_user_id ON proposals(user_id);
    END IF;
    
    -- Add comments to clarify column usage
    COMMENT ON COLUMN proposals.user_identifier IS 'Legacy UUID identifier for the user who created this proposal. Use user_id for new implementations.';
    COMMENT ON COLUMN proposals.user_id IS 'Foreign key to public.users(id). Preferred field for user identification.';
    
END $$;

-- Update RLS policies to handle both user_id and user_identifier
DROP POLICY IF EXISTS "Service role can manage all proposals" ON proposals;
DROP POLICY IF EXISTS "Users can view their own proposals" ON proposals;
DROP POLICY IF EXISTS "Users can insert their own proposals" ON proposals;
DROP POLICY IF EXISTS "Users can update their own proposals" ON proposals;
DROP POLICY IF EXISTS "Users can delete their own proposals" ON proposals;

-- Create comprehensive RLS policies that work with both columns
CREATE POLICY "Service role can manage all proposals" ON proposals
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Allow users to view their own proposals (check both user_id and user_identifier)
CREATE POLICY "Users can view their own proposals" ON proposals
    FOR SELECT USING (
        auth.role() = 'service_role' OR 
        user_id = auth.uid() OR
        user_identifier = auth.uid()
    );

-- Allow users to insert their own proposals
CREATE POLICY "Users can insert their own proposals" ON proposals
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role' OR 
        user_id = auth.uid() OR
        user_identifier = auth.uid()
    );

-- Allow users to update their own proposals
CREATE POLICY "Users can update their own proposals" ON proposals
    FOR UPDATE USING (
        auth.role() = 'service_role' OR 
        user_id = auth.uid() OR
        user_identifier = auth.uid()
    );

-- Allow users to delete their own proposals
CREATE POLICY "Users can delete their own proposals" ON proposals
    FOR DELETE USING (
        auth.role() = 'service_role' OR 
        user_id = auth.uid() OR
        user_identifier = auth.uid()
    );