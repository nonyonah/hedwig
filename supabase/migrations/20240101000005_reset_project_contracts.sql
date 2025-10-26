-- =====================================================
-- Complete Reset and Recreation of Project Contracts Schema
-- =====================================================
-- This migration completely drops and recreates all contract-related
-- tables to ensure a clean schema without conflicts
-- =====================================================

-- Drop everything in the correct order to avoid dependency issues
DROP VIEW IF EXISTS contract_summary CASCADE;
DROP TABLE IF EXISTS contract_notifications CASCADE;
DROP TABLE IF EXISTS contract_activities CASCADE;
DROP TABLE IF EXISTS contract_extension_requests CASCADE;
DROP TABLE IF EXISTS contract_milestones CASCADE;
DROP TABLE IF EXISTS project_contracts CASCADE;

-- Drop all related functions and triggers
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS sync_contract_fields() CASCADE;
DROP FUNCTION IF EXISTS sync_milestone_dates() CASCADE;
DROP FUNCTION IF EXISTS get_user_contract_stats(UUID) CASCADE;

-- Create the update function first
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create project_contracts table with all required columns
CREATE TABLE project_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id BIGINT UNIQUE, -- Smart contract ID (nullable)
    client_id UUID, -- References auth.users(id) but no FK constraint for Telegram compatibility
    freelancer_id UUID, -- References auth.users(id) but no FK constraint for Telegram compatibility
    
    -- Contract Details
    project_title TEXT NOT NULL,
    title TEXT, -- Alias for project_title
    project_description TEXT,
    legal_contract_hash TEXT,
    legal_contract_id UUID,
    client_email TEXT,
    contract_text TEXT,
    contract_hash TEXT,
    
    -- Financial Details
    total_amount DECIMAL(20, 6) NOT NULL,
    platform_fee DECIMAL(20, 6) DEFAULT 0,
    token_address TEXT,
    token_type TEXT DEFAULT 'USDC',
    currency TEXT DEFAULT 'USDC',
    chain TEXT NOT NULL DEFAULT 'base',
    
    -- Smart Contract Details
    contract_address TEXT,
    deployment_tx_hash TEXT,
    
    -- Timeline
    deadline TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    funded_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    disputed_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    
    -- Status and Metadata
    status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
        'created', 'pending', 'generated', 'funded', 'in_progress', 
        'active', 'completed', 'approved', 'disputed', 'cancelled', 'refunded'
    )),
    
    extension_requests_count INTEGER DEFAULT 0,
    client_approval_required BOOLEAN DEFAULT true,
    dispute_reason TEXT,
    resolution_notes TEXT,
    approval_token TEXT UNIQUE,
    decline_reason TEXT,
    
    -- Tracking
    created_from TEXT,
    source_id UUID,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create contract_milestones table
CREATE TABLE contract_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id BIGINT,
    contract_id UUID NOT NULL REFERENCES project_contracts(id) ON DELETE CASCADE,
    
    -- Milestone Details
    title TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(20, 6) NOT NULL,
    deadline TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    
    -- Status and Timeline
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'completed', 'approved', 'disputed', 'paid'
    )),
    
    completed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create contract_extension_requests table
CREATE TABLE contract_extension_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id BIGINT,
    contract_id UUID NOT NULL REFERENCES project_contracts(id) ON DELETE CASCADE,
    
    -- Request Details
    requested_days INTEGER NOT NULL,
    reason TEXT NOT NULL,
    
    -- Response
    approved BOOLEAN,
    response_reason TEXT,
    
    -- Timeline
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create contract_activities table
CREATE TABLE contract_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES project_contracts(id) ON DELETE CASCADE,
    
    -- Activity Details
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'contract_created', 'contract_funded', 'project_started',
        'milestone_completed', 'milestone_approved', 'project_completed',
        'project_approved', 'extension_requested', 'extension_approved',
        'extension_rejected', 'dispute_raised', 'dispute_resolved',
        'funds_released', 'contract_refunded', 'contract_cancelled'
    )),
    
    actor_id UUID, -- References auth.users(id) but no FK constraint
    actor_type TEXT NOT NULL CHECK (actor_type IN ('client', 'freelancer', 'admin', 'system')),
    
    -- Activity Data
    description TEXT,
    metadata JSONB,
    
    -- Blockchain Data
    tx_hash TEXT,
    block_number BIGINT,
    gas_used BIGINT,
    
    -- Timeline
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create contract_notifications table
CREATE TABLE contract_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES project_contracts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- References auth.users(id) but no FK constraint
    
    -- Notification Details
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'contract_created', 'contract_funded', 'project_started',
        'project_completed', 'approval_required', 'extension_requested',
        'extension_responded', 'dispute_raised', 'deadline_approaching',
        'deadline_exceeded', 'funds_released', 'contract_refunded'
    )),
    
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- Status
    read BOOLEAN DEFAULT false,
    sent_via_telegram BOOLEAN DEFAULT false,
    sent_via_email BOOLEAN DEFAULT false,
    
    -- Timeline
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ
);

-- Create simple sync functions without complex logic
CREATE OR REPLACE FUNCTION sync_contract_title()
RETURNS TRIGGER AS $$
BEGIN
    -- Always sync title with project_title on insert/update
    NEW.title = NEW.project_title;
    NEW.currency = COALESCE(NEW.token_type, NEW.currency, 'USDC');
    NEW.token_type = NEW.currency;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_milestone_deadline()
RETURNS TRIGGER AS $$
BEGIN
    -- Always sync due_date with deadline on insert/update
    IF NEW.deadline IS NOT NULL THEN
        NEW.due_date = NEW.deadline;
    ELSIF NEW.due_date IS NOT NULL THEN
        NEW.deadline = NEW.due_date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER update_project_contracts_updated_at 
    BEFORE UPDATE ON project_contracts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER sync_project_contract_title
    BEFORE INSERT OR UPDATE ON project_contracts
    FOR EACH ROW EXECUTE FUNCTION sync_contract_title();

CREATE TRIGGER update_contract_milestones_updated_at 
    BEFORE UPDATE ON contract_milestones 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER sync_milestone_deadline_trigger
    BEFORE INSERT OR UPDATE ON contract_milestones
    FOR EACH ROW EXECUTE FUNCTION sync_milestone_deadline();

CREATE TRIGGER update_contract_extension_requests_updated_at 
    BEFORE UPDATE ON contract_extension_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX idx_project_contracts_client_id ON project_contracts(client_id);
CREATE INDEX idx_project_contracts_freelancer_id ON project_contracts(freelancer_id);
CREATE INDEX idx_project_contracts_status ON project_contracts(status);
CREATE INDEX idx_project_contracts_chain ON project_contracts(chain);
CREATE INDEX idx_project_contracts_deadline ON project_contracts(deadline);
CREATE INDEX idx_project_contracts_created_at ON project_contracts(created_at);
CREATE INDEX idx_project_contracts_client_email ON project_contracts(client_email);
CREATE INDEX idx_project_contracts_title ON project_contracts(title);
CREATE INDEX idx_project_contracts_legal_contract_id ON project_contracts(legal_contract_id);
CREATE INDEX idx_project_contracts_approval_token ON project_contracts(approval_token);
CREATE INDEX idx_project_contracts_token_type ON project_contracts(token_type);

CREATE INDEX idx_contract_milestones_contract_id ON contract_milestones(contract_id);
CREATE INDEX idx_contract_milestones_status ON contract_milestones(status);
CREATE INDEX idx_contract_milestones_deadline ON contract_milestones(deadline);
CREATE INDEX idx_contract_milestones_due_date ON contract_milestones(due_date);

CREATE INDEX idx_contract_extension_requests_contract_id ON contract_extension_requests(contract_id);
CREATE INDEX idx_contract_activities_contract_id ON contract_activities(contract_id);
CREATE INDEX idx_contract_notifications_user_id ON contract_notifications(user_id);
CREATE INDEX idx_contract_notifications_contract_id ON contract_notifications(contract_id);

-- Enable RLS
ALTER TABLE project_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_extension_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own contracts" ON project_contracts
    FOR SELECT USING (
        auth.uid() = client_id OR 
        auth.uid() = freelancer_id
    );

CREATE POLICY "Users can create contracts" ON project_contracts
    FOR INSERT WITH CHECK (
        auth.uid() = client_id OR 
        auth.uid() = freelancer_id
    );

CREATE POLICY "Users can update their own contracts" ON project_contracts
    FOR UPDATE USING (
        auth.uid() = client_id OR 
        auth.uid() = freelancer_id
    );

CREATE POLICY "Service role can manage all contracts" ON project_contracts
    FOR ALL USING (true);

-- Policies for milestones
CREATE POLICY "Users can view milestones of their contracts" ON contract_milestones
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_milestones.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

CREATE POLICY "Users can manage milestones of their contracts" ON contract_milestones
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_milestones.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

-- Similar policies for other tables
CREATE POLICY "Users can view extension requests of their contracts" ON contract_extension_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_extension_requests.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

CREATE POLICY "Users can view activities of their contracts" ON contract_activities
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_activities.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

CREATE POLICY "Users can view their own notifications" ON contract_notifications
    FOR SELECT USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON project_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_extension_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_notifications TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Create a simple view
CREATE OR REPLACE VIEW contract_summary AS
SELECT 
    pc.*,
    c.email as client_email_auth,
    c.raw_user_meta_data->>'name' as client_name,
    f.email as freelancer_email_auth,
    f.raw_user_meta_data->>'name' as freelancer_name,
    COUNT(cm.id) as milestone_count,
    COUNT(CASE WHEN cm.status = 'completed' THEN 1 END) as completed_milestones
FROM project_contracts pc
LEFT JOIN auth.users c ON pc.client_id = c.id
LEFT JOIN auth.users f ON pc.freelancer_id = f.id
LEFT JOIN contract_milestones cm ON pc.id = cm.contract_id
GROUP BY pc.id, c.email, c.raw_user_meta_data, f.email, f.raw_user_meta_data;

-- Grant permissions on the view
GRANT SELECT ON contract_summary TO authenticated;