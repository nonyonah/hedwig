-- Enhance proposals table to support negotiation-first flow
-- Add fields for better client context and remove payment-focused elements

ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS client_company TEXT,
ADD COLUMN IF NOT EXISTS client_industry TEXT,
ADD COLUMN IF NOT EXISTS project_complexity TEXT CHECK (project_complexity IN ('simple', 'moderate', 'complex')) DEFAULT 'moderate',
ADD COLUMN IF NOT EXISTS communication_style TEXT CHECK (communication_style IN ('formal', 'casual', 'professional')) DEFAULT 'professional',
ADD COLUMN IF NOT EXISTS freelancer_title TEXT,
ADD COLUMN IF NOT EXISTS freelancer_experience TEXT,
ADD COLUMN IF NOT EXISTS negotiation_notes TEXT,
ADD COLUMN IF NOT EXISTS client_feedback TEXT,
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_revision_date TIMESTAMP WITH TIME ZONE;

-- Update status enum to include negotiation states
ALTER TABLE proposals 
DROP CONSTRAINT IF EXISTS proposals_status_check;

ALTER TABLE proposals 
ADD CONSTRAINT proposals_status_check 
CHECK (status IN ('draft', 'sent', 'under_negotiation', 'revised', 'accepted', 'rejected', 'completed'));

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_proposals_client_company ON proposals(client_company);
CREATE INDEX IF NOT EXISTS idx_proposals_client_industry ON proposals(client_industry);
CREATE INDEX IF NOT EXISTS idx_proposals_project_complexity ON proposals(project_complexity);
CREATE INDEX IF NOT EXISTS idx_proposals_revision_count ON proposals(revision_count);

-- Create a function to handle proposal revisions
CREATE OR REPLACE FUNCTION handle_proposal_revision()
RETURNS TRIGGER AS $$
BEGIN
    -- If status changes to 'revised', increment revision count and update revision date
    IF NEW.status = 'revised' AND OLD.status != 'revised' THEN
        NEW.revision_count = COALESCE(OLD.revision_count, 0) + 1;
        NEW.last_revision_date = NOW();
    END IF;
    
    -- If status changes to 'under_negotiation', update the timestamp
    IF NEW.status = 'under_negotiation' AND OLD.status != 'under_negotiation' THEN
        NEW.updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for proposal revisions
DROP TRIGGER IF EXISTS trigger_handle_proposal_revision ON proposals;
CREATE TRIGGER trigger_handle_proposal_revision
    BEFORE UPDATE ON proposals
    FOR EACH ROW
    EXECUTE FUNCTION handle_proposal_revision();

-- Create a table for proposal conversation history (for tracking negotiation)
CREATE TABLE IF NOT EXISTS proposal_conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('freelancer', 'client')),
    message TEXT NOT NULL,
    message_type TEXT CHECK (message_type IN ('feedback', 'revision_request', 'clarification', 'acceptance', 'rejection')) DEFAULT 'feedback',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for proposal conversations
CREATE INDEX IF NOT EXISTS idx_proposal_conversations_proposal_id ON proposal_conversations(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_conversations_sender_type ON proposal_conversations(sender_type);
CREATE INDEX IF NOT EXISTS idx_proposal_conversations_created_at ON proposal_conversations(created_at);

-- Enable RLS for proposal conversations
ALTER TABLE proposal_conversations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for proposal conversations
CREATE POLICY "Users can view conversations for their proposals" ON proposal_conversations
    FOR SELECT USING (
        proposal_id IN (
            SELECT id FROM proposals WHERE user_identifier = auth.uid()
        )
    );

CREATE POLICY "Users can insert conversations for their proposals" ON proposal_conversations
    FOR INSERT WITH CHECK (
        proposal_id IN (
            SELECT id FROM proposals WHERE user_identifier = auth.uid()
        )
    );

-- Update existing proposals to have default values for new fields
UPDATE proposals 
SET 
    communication_style = 'professional',
    project_complexity = 'moderate',
    revision_count = 0
WHERE communication_style IS NULL 
   OR project_complexity IS NULL 
   OR revision_count IS NULL;

-- Add comment to document the changes
COMMENT ON TABLE proposals IS 'Enhanced proposals table supporting negotiation-first workflow with client context and revision tracking';
COMMENT ON TABLE proposal_conversations IS 'Tracks conversation history during proposal negotiation process';