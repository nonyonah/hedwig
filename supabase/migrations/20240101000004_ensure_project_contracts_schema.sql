-- =====================================================
-- Ensure Project Contracts Table Has Correct Schema
-- =====================================================
-- This migration ensures the project_contracts table exists
-- with all required columns, handling existing tables
-- =====================================================

-- First, check if the table exists and what columns it has
DO $$
DECLARE
    table_exists BOOLEAN;
    client_id_exists BOOLEAN;
    freelancer_id_exists BOOLEAN;
BEGIN
    -- Check if table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'project_contracts'
    ) INTO table_exists;
    
    IF table_exists THEN
        -- Table exists, check for required columns
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'project_contracts' AND column_name = 'client_id'
        ) INTO client_id_exists;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'project_contracts' AND column_name = 'freelancer_id'
        ) INTO freelancer_id_exists;
        
        -- Drop and recreate the table if it's missing essential columns
        IF NOT client_id_exists OR NOT freelancer_id_exists THEN
            RAISE NOTICE 'Dropping existing project_contracts table due to missing columns';
            DROP TABLE IF EXISTS project_contracts CASCADE;
            table_exists := FALSE;
        END IF;
    END IF;
    
    -- Create the table if it doesn't exist or was dropped
    IF NOT table_exists THEN
        RAISE NOTICE 'Creating project_contracts table with correct schema';
        
        CREATE TABLE project_contracts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            contract_id BIGINT UNIQUE, -- Smart contract ID (nullable for now)
            client_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
            freelancer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
            
            -- Contract Details
            project_title TEXT NOT NULL,
            title TEXT, -- Alias for project_title for code compatibility
            project_description TEXT,
            legal_contract_hash TEXT, -- IPFS hash of legal contract
            legal_contract_id UUID, -- Reference to legal_contracts table
            client_email TEXT, -- Client email for notifications
            contract_text TEXT, -- Full contract text
            contract_hash TEXT, -- Contract hash
            
            -- Financial Details
            total_amount DECIMAL(20, 6) NOT NULL,
            platform_fee DECIMAL(20, 6) NOT NULL DEFAULT 0,
            token_address TEXT,
            token_type TEXT DEFAULT 'USDC', -- Token type for compatibility
            currency TEXT DEFAULT 'USDC', -- Currency alias for token_type
            chain TEXT NOT NULL DEFAULT 'base', -- 'base', 'celo', 'polygon'
            
            -- Smart Contract Details
            contract_address TEXT, -- Deployed contract address
            deployment_tx_hash TEXT, -- Transaction hash of deployment
            
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
                'created',      -- Contract created, waiting for funding
                'pending',      -- Alias for created (code compatibility)
                'generated',    -- Contract generated but not yet created (code compatibility)
                'funded',       -- Client has funded the contract
                'in_progress',  -- Work has started
                'active',       -- Alias for in_progress (code compatibility)
                'completed',    -- Freelancer marked as completed
                'approved',     -- Client approved completion
                'disputed',     -- In dispute resolution
                'cancelled',    -- Contract cancelled
                'refunded'      -- Funds refunded to client
            )),
            
            extension_requests_count INTEGER DEFAULT 0,
            client_approval_required BOOLEAN DEFAULT true,
            dispute_reason TEXT,
            resolution_notes TEXT,
            approval_token TEXT UNIQUE, -- Token for client approval
            decline_reason TEXT, -- Reason for contract decline
            
            -- Tracking
            created_from TEXT, -- 'manual', 'invoice', 'proposal'
            source_id UUID, -- Reference to original invoice/proposal if converted
            
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Create contract_milestones table
        CREATE TABLE IF NOT EXISTS contract_milestones (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            milestone_id BIGINT, -- Smart contract milestone ID
            contract_id UUID REFERENCES project_contracts(id) ON DELETE CASCADE,
            
            -- Milestone Details
            title TEXT NOT NULL,
            description TEXT,
            amount DECIMAL(20, 6) NOT NULL,
            deadline TIMESTAMPTZ,
            due_date TIMESTAMPTZ, -- Alias for deadline for code compatibility
            
            -- Status and Timeline
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                'pending',
                'completed',
                'approved',
                'disputed',
                'paid'
            )),
            
            completed_at TIMESTAMPTZ,
            approved_at TIMESTAMPTZ,
            
            -- Metadata
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            
            UNIQUE(contract_id, milestone_id)
        );
        
        -- Create other related tables if they don't exist
        CREATE TABLE IF NOT EXISTS contract_extension_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            request_id BIGINT, -- Smart contract request ID
            contract_id UUID REFERENCES project_contracts(id) ON DELETE CASCADE,
            
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
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            
            UNIQUE(contract_id, request_id)
        );
        
        CREATE TABLE IF NOT EXISTS contract_activities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            contract_id UUID REFERENCES project_contracts(id) ON DELETE CASCADE,
            
            -- Activity Details
            activity_type TEXT NOT NULL CHECK (activity_type IN (
                'contract_created',
                'contract_funded',
                'project_started',
                'milestone_completed',
                'milestone_approved',
                'project_completed',
                'project_approved',
                'extension_requested',
                'extension_approved',
                'extension_rejected',
                'dispute_raised',
                'dispute_resolved',
                'funds_released',
                'contract_refunded',
                'contract_cancelled'
            )),
            
            actor_id UUID REFERENCES auth.users(id), -- Who performed the action
            actor_type TEXT NOT NULL CHECK (actor_type IN ('client', 'freelancer', 'admin', 'system')),
            
            -- Activity Data
            description TEXT,
            metadata JSONB, -- Additional activity-specific data
            
            -- Blockchain Data
            tx_hash TEXT, -- Transaction hash if on-chain
            block_number BIGINT,
            gas_used BIGINT,
            
            -- Timeline
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS contract_notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            contract_id UUID REFERENCES project_contracts(id) ON DELETE CASCADE,
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            
            -- Notification Details
            notification_type TEXT NOT NULL CHECK (notification_type IN (
                'contract_created',
                'contract_funded',
                'project_started',
                'project_completed',
                'approval_required',
                'extension_requested',
                'extension_responded',
                'dispute_raised',
                'deadline_approaching',
                'deadline_exceeded',
                'funds_released',
                'contract_refunded'
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
    END IF;
END $$;

-- Clean up any existing problematic triggers and functions
DROP TRIGGER IF EXISTS sync_milestone_dates_trigger ON project_contracts;
DROP TRIGGER IF EXISTS sync_project_contract_fields ON contract_milestones;
DROP FUNCTION IF EXISTS sync_milestone_dates() CASCADE;
DROP FUNCTION IF EXISTS sync_contract_fields() CASCADE;

-- Create or replace functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to sync contract fields
CREATE OR REPLACE FUNCTION sync_contract_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Sync title with project_title
    IF NEW.project_title IS DISTINCT FROM OLD.project_title THEN
        NEW.title = NEW.project_title;
    END IF;
    
    -- Sync token_type with currency
    IF NEW.token_type IS DISTINCT FROM OLD.token_type THEN
        NEW.currency = NEW.token_type;
    ELSIF NEW.currency IS DISTINCT FROM OLD.currency THEN
        NEW.token_type = NEW.currency;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to sync milestone dates (only for contract_milestones table)
CREATE OR REPLACE FUNCTION sync_milestone_dates()
RETURNS TRIGGER AS $$
BEGIN
    -- Sync deadline and due_date for milestones
    -- If deadline is set but due_date is not, copy deadline to due_date
    IF NEW.deadline IS NOT NULL AND NEW.due_date IS NULL THEN
        NEW.due_date = NEW.deadline;
    END IF;
    
    -- If due_date is set but deadline is not, copy due_date to deadline
    IF NEW.due_date IS NOT NULL AND NEW.deadline IS NULL THEN
        NEW.deadline = NEW.due_date;
    END IF;
    
    -- If both are set and different, prefer the one that was just updated
    IF NEW.deadline IS NOT NULL AND NEW.due_date IS NOT NULL AND NEW.deadline != NEW.due_date THEN
        -- On INSERT, sync due_date to deadline
        IF TG_OP = 'INSERT' THEN
            NEW.due_date = NEW.deadline;
        -- On UPDATE, check which one changed
        ELSIF TG_OP = 'UPDATE' THEN
            IF NEW.deadline IS DISTINCT FROM OLD.deadline THEN
                NEW.due_date = NEW.deadline;
            ELSIF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
                NEW.deadline = NEW.due_date;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS update_project_contracts_updated_at ON project_contracts;
CREATE TRIGGER update_project_contracts_updated_at 
    BEFORE UPDATE ON project_contracts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Only create contract sync trigger if the required columns exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_contracts' AND column_name = 'project_title'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_contracts' AND column_name = 'title'
    ) THEN
        DROP TRIGGER IF EXISTS sync_project_contract_fields ON project_contracts;
        CREATE TRIGGER sync_project_contract_fields
            BEFORE INSERT OR UPDATE ON project_contracts
            FOR EACH ROW EXECUTE FUNCTION sync_contract_fields();
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_contract_milestones_updated_at ON contract_milestones;
CREATE TRIGGER update_contract_milestones_updated_at 
    BEFORE UPDATE ON contract_milestones 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Only create milestone sync trigger if both deadline and due_date columns exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contract_milestones' AND column_name = 'deadline'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contract_milestones' AND column_name = 'due_date'
    ) THEN
        DROP TRIGGER IF EXISTS sync_milestone_dates_trigger ON contract_milestones;
        CREATE TRIGGER sync_milestone_dates_trigger
            BEFORE INSERT OR UPDATE ON contract_milestones
            FOR EACH ROW EXECUTE FUNCTION sync_milestone_dates();
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_contract_extension_requests_updated_at ON contract_extension_requests;
CREATE TRIGGER update_contract_extension_requests_updated_at 
    BEFORE UPDATE ON contract_extension_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_contracts_client_id ON project_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_project_contracts_freelancer_id ON project_contracts(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_project_contracts_status ON project_contracts(status);
CREATE INDEX IF NOT EXISTS idx_project_contracts_chain ON project_contracts(chain);
CREATE INDEX IF NOT EXISTS idx_project_contracts_deadline ON project_contracts(deadline);
CREATE INDEX IF NOT EXISTS idx_project_contracts_created_at ON project_contracts(created_at);
CREATE INDEX IF NOT EXISTS idx_project_contracts_contract_id ON project_contracts(contract_id);
CREATE INDEX IF NOT EXISTS idx_project_contracts_client_email ON project_contracts(client_email);
CREATE INDEX IF NOT EXISTS idx_project_contracts_title ON project_contracts(title);
CREATE INDEX IF NOT EXISTS idx_project_contracts_legal_contract_id ON project_contracts(legal_contract_id);
CREATE INDEX IF NOT EXISTS idx_project_contracts_approval_token ON project_contracts(approval_token);
CREATE INDEX IF NOT EXISTS idx_project_contracts_token_type ON project_contracts(token_type);

CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract_id ON contract_milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_status ON contract_milestones(status);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_deadline ON contract_milestones(deadline);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_due_date ON contract_milestones(due_date);

CREATE INDEX IF NOT EXISTS idx_contract_extension_requests_contract_id ON contract_extension_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_extension_requests_approved ON contract_extension_requests(approved);

CREATE INDEX IF NOT EXISTS idx_contract_activities_contract_id ON contract_activities(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_activities_activity_type ON contract_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_contract_activities_actor_id ON contract_activities(actor_id);
CREATE INDEX IF NOT EXISTS idx_contract_activities_created_at ON contract_activities(created_at);

CREATE INDEX IF NOT EXISTS idx_contract_notifications_user_id ON contract_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_contract_id ON contract_notifications(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_read ON contract_notifications(read);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_notification_type ON contract_notifications(notification_type);

-- Enable RLS
ALTER TABLE project_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_extension_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can view their own contracts" ON project_contracts;
CREATE POLICY "Users can view their own contracts" ON project_contracts
    FOR SELECT USING (
        auth.uid() = client_id OR 
        auth.uid() = freelancer_id
    );

DROP POLICY IF EXISTS "Users can create contracts as client" ON project_contracts;
CREATE POLICY "Users can create contracts as client" ON project_contracts
    FOR INSERT WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "Users can update their own contracts" ON project_contracts;
CREATE POLICY "Users can update their own contracts" ON project_contracts
    FOR UPDATE USING (
        auth.uid() = client_id OR 
        auth.uid() = freelancer_id
    );

DROP POLICY IF EXISTS "Service role can manage all contracts" ON project_contracts;
CREATE POLICY "Service role can manage all contracts" ON project_contracts
    FOR ALL USING (true);

-- Policies for related tables
DROP POLICY IF EXISTS "Users can view milestones of their contracts" ON contract_milestones;
CREATE POLICY "Users can view milestones of their contracts" ON contract_milestones
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_milestones.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can manage milestones of their contracts" ON contract_milestones;
CREATE POLICY "Users can manage milestones of their contracts" ON contract_milestones
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_milestones.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON project_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_extension_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_notifications TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Create view
DROP VIEW IF EXISTS contract_summary CASCADE;
CREATE OR REPLACE VIEW contract_summary AS
SELECT 
    pc.*,
    c.email as client_email_from_auth,
    c.raw_user_meta_data->>'name' as client_username,
    f.email as freelancer_email_from_auth,
    f.raw_user_meta_data->>'name' as freelancer_username,
    COUNT(cm.id) as milestone_count,
    COUNT(CASE WHEN cm.status = 'completed' THEN 1 END) as completed_milestones,
    COUNT(cer.id) as total_extension_requests,
    COUNT(CASE WHEN cer.approved = true THEN 1 END) as approved_extensions
FROM project_contracts pc
LEFT JOIN auth.users c ON pc.client_id = c.id
LEFT JOIN auth.users f ON pc.freelancer_id = f.id
LEFT JOIN contract_milestones cm ON pc.id = cm.contract_id
LEFT JOIN contract_extension_requests cer ON pc.id = cer.contract_id
GROUP BY pc.id, c.email, c.raw_user_meta_data, f.email, f.raw_user_meta_data;

-- Grant permissions on the view
GRANT SELECT ON contract_summary TO authenticated;