-- Fix proposals table to properly connect with users table
-- This migration restores the proper foreign key relationship between proposals and users

-- First, let's add a proper user_id column with foreign key constraint
ALTER TABLE proposals ADD COLUMN user_id UUID;

-- Update existing proposals to set user_id from user_identifier
-- This assumes user_identifier contains valid UUIDs that exist in the users table
UPDATE proposals 
SET user_id = user_identifier 
WHERE user_identifier IS NOT NULL;

-- Add foreign key constraint to connect proposals with users
ALTER TABLE proposals 
ADD CONSTRAINT fk_proposals_user_id 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Make user_id NOT NULL after updating existing records
ALTER TABLE proposals ALTER COLUMN user_id SET NOT NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_proposals_user_id_new ON proposals(user_id);

-- Update RLS policies to use the proper user_id column
DROP POLICY IF EXISTS "Service role can manage all proposals" ON proposals;
DROP POLICY IF EXISTS "Authenticated users can view proposals" ON proposals;
DROP POLICY IF EXISTS "Authenticated users can insert proposals" ON proposals;
DROP POLICY IF EXISTS "Authenticated users can update proposals" ON proposals;
DROP POLICY IF EXISTS "Authenticated users can delete proposals" ON proposals;

-- Create proper RLS policies that work with the users table
CREATE POLICY "Service role can manage all proposals" ON proposals
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Allow users to view their own proposals
CREATE POLICY "Users can view their own proposals" ON proposals
    FOR SELECT USING (
        auth.role() = 'service_role' OR 
        user_id IN (SELECT id FROM public.users WHERE id = auth.uid())
    );

-- Allow users to insert their own proposals
CREATE POLICY "Users can insert their own proposals" ON proposals
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role' OR 
        user_id IN (SELECT id FROM public.users WHERE id = auth.uid())
    );

-- Allow users to update their own proposals
CREATE POLICY "Users can update their own proposals" ON proposals
    FOR UPDATE USING (
        auth.role() = 'service_role' OR 
        user_id IN (SELECT id FROM public.users WHERE id = auth.uid())
    );

-- Allow users to delete their own proposals
CREATE POLICY "Users can delete their own proposals" ON proposals
    FOR DELETE USING (
        auth.role() = 'service_role' OR 
        user_id IN (SELECT id FROM public.users WHERE id = auth.uid())
    );

-- Add comment explaining the fix
COMMENT ON COLUMN proposals.user_id IS 'Foreign key to public.users(id). Properly connects proposals with users table.';
COMMENT ON COLUMN proposals.user_identifier IS 'Legacy column. Use user_id instead for proper foreign key relationship.';