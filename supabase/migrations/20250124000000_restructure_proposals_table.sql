-- Drop the existing proposals table and recreate without foreign key constraints
-- This migration removes the user_id dependency and uses the proposal ID as the user identifier

-- Drop existing table if it exists (this will remove all data)
DROP TABLE IF EXISTS proposals CASCADE;

-- Create new proposals table without user_id foreign key
CREATE TABLE proposals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    -- Remove user_id field entirely - the proposal ID itself will serve as the user identifier
    client_name TEXT,
    client_email TEXT,
    service_type TEXT NOT NULL,
    project_title TEXT,
    description TEXT,
    deliverables TEXT[], -- Array of deliverable items
    timeline TEXT,
    budget DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',
    features TEXT[], -- Array of feature items
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
    -- Add a user_identifier field to store the user's UUID without foreign key constraint
    user_identifier UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_proposals_user_identifier ON proposals(user_identifier);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON proposals(created_at);
CREATE INDEX IF NOT EXISTS idx_proposals_client_email ON proposals(client_email);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_proposals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_proposals_updated_at
    BEFORE UPDATE ON proposals
    FOR EACH ROW
    EXECUTE FUNCTION update_proposals_updated_at();

-- Enable Row Level Security (RLS) but with simplified policies
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Create simplified RLS policies that don't depend on auth.uid()
-- These policies allow service role to manage all proposals
CREATE POLICY "Service role can manage all proposals" ON proposals
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Allow authenticated users to view proposals (you can restrict this further if needed)
CREATE POLICY "Authenticated users can view proposals" ON proposals
    FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Allow authenticated users to insert proposals
CREATE POLICY "Authenticated users can insert proposals" ON proposals
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Allow authenticated users to update proposals
CREATE POLICY "Authenticated users can update proposals" ON proposals
    FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Allow authenticated users to delete proposals
CREATE POLICY "Authenticated users can delete proposals" ON proposals
    FOR DELETE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Add comment explaining the new structure
COMMENT ON TABLE proposals IS 'Proposals table without foreign key constraints. user_identifier stores the user UUID without referencing users table.';
COMMENT ON COLUMN proposals.user_identifier IS 'UUID identifying the user who created this proposal. Not a foreign key to allow flexible user management.';