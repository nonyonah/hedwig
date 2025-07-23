-- Create proposals table
CREATE TABLE IF NOT EXISTS proposals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_proposals_user_id ON proposals(user_id);
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

-- Enable Row Level Security (RLS)
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own proposals" ON proposals
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own proposals" ON proposals
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own proposals" ON proposals
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own proposals" ON proposals
    FOR DELETE USING (auth.uid() = user_id);