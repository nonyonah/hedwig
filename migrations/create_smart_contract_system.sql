-- Smart Contract Management System Database Migration
-- This migration creates all tables needed for the smart contract management system

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Project Contracts Table
CREATE TABLE IF NOT EXISTS project_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    freelancer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    total_amount DECIMAL(20, 6) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    chain VARCHAR(50) NOT NULL DEFAULT 'base',
    token_address VARCHAR(100),
    contract_address VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'disputed', 'cancelled', 'paused')),
    legal_contract_hash TEXT,
    legal_contract_content TEXT,
    source_type VARCHAR(20) CHECK (source_type IN ('invoice', 'proposal', 'manual')),
    source_id UUID,
    milestones_count INTEGER DEFAULT 0,
    platform_fee_rate INTEGER DEFAULT 250, -- 2.5% in basis points
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add created_by column if it doesn't exist (for existing tables)
ALTER TABLE project_contracts 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 2. Contract Milestones Table
CREATE TABLE IF NOT EXISTS contract_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES project_contracts(id) ON DELETE CASCADE,
    milestone_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(20, 6) NOT NULL,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'completed', 'disputed')),
    deliverables TEXT[],
    submission_notes TEXT,
    client_feedback TEXT,
    approved_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(contract_id, milestone_number)
);

-- 3. Extension Requests Table
CREATE TABLE IF NOT EXISTS extension_requests (
    id VARCHAR(50) PRIMARY KEY,
    contract_id UUID REFERENCES project_contracts(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES contract_milestones(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('contract', 'milestone')),
    current_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    requested_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    extension_days INTEGER NOT NULL,
    reason TEXT NOT NULL,
    justification TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    client_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 4. Dispute Cases Table
CREATE TABLE IF NOT EXISTS dispute_cases (
    id VARCHAR(50) PRIMARY KEY,
    contract_id UUID REFERENCES project_contracts(id) ON DELETE CASCADE,
    initiated_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    dispute_type VARCHAR(20) NOT NULL CHECK (dispute_type IN ('payment', 'deliverable', 'deadline', 'scope', 'quality', 'other')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'mediation', 'arbitration', 'resolved', 'closed')),
    priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    description TEXT NOT NULL,
    evidence JSONB DEFAULT '[]'::jsonb,
    timeline JSONB DEFAULT '[]'::jsonb,
    resolution JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Fraud Alerts Table
CREATE TABLE IF NOT EXISTS fraud_alerts (
    id VARCHAR(50) PRIMARY KEY,
    contract_id UUID REFERENCES project_contracts(id) ON DELETE CASCADE,
    alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('suspicious_activity', 'payment_anomaly', 'deadline_manipulation', 'milestone_fraud', 'identity_verification')),
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'investigating', 'resolved', 'false_positive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 6. Contract Events Table (for analytics)
CREATE TABLE IF NOT EXISTS contract_events (
    id VARCHAR(100) PRIMARY KEY,
    event_type VARCHAR(30) NOT NULL,
    contract_id UUID REFERENCES project_contracts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_role VARCHAR(20),
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Contract Metrics Daily Table (for analytics)
CREATE TABLE IF NOT EXISTS contract_metrics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    metric_name VARCHAR(50) NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date, metric_name)
);

-- 8. Contract Completion Times Table (for analytics)
CREATE TABLE IF NOT EXISTS contract_completion_times (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES project_contracts(id) ON DELETE CASCADE,
    completion_days INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_project_contracts_client_id ON project_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_project_contracts_freelancer_id ON project_contracts(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_project_contracts_status ON project_contracts(status);
CREATE INDEX IF NOT EXISTS idx_project_contracts_chain ON project_contracts(chain);
CREATE INDEX IF NOT EXISTS idx_project_contracts_created_at ON project_contracts(created_at);

CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract_id ON contract_milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_status ON contract_milestones(status);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_deadline ON contract_milestones(deadline);

CREATE INDEX IF NOT EXISTS idx_extension_requests_contract_id ON extension_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_extension_requests_status ON extension_requests(status);
CREATE INDEX IF NOT EXISTS idx_extension_requests_requested_by ON extension_requests(requested_by);

CREATE INDEX IF NOT EXISTS idx_dispute_cases_contract_id ON dispute_cases(contract_id);
CREATE INDEX IF NOT EXISTS idx_dispute_cases_status ON dispute_cases(status);
CREATE INDEX IF NOT EXISTS idx_dispute_cases_initiated_by ON dispute_cases(initiated_by);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_contract_id ON fraud_alerts(contract_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_status ON fraud_alerts(status);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_severity ON fraud_alerts(severity);

CREATE INDEX IF NOT EXISTS idx_contract_events_contract_id ON contract_events(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_events_event_type ON contract_events(event_type);
CREATE INDEX IF NOT EXISTS idx_contract_events_timestamp ON contract_events(timestamp);

CREATE INDEX IF NOT EXISTS idx_contract_metrics_daily_date ON contract_metrics_daily(date);
CREATE INDEX IF NOT EXISTS idx_contract_metrics_daily_metric_name ON contract_metrics_daily(metric_name);

-- Enable Row Level Security (RLS)
ALTER TABLE project_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_completion_times ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_contracts
CREATE POLICY "Users can view contracts they are involved in" ON project_contracts
    FOR SELECT USING (
        auth.uid() = client_id OR 
        auth.uid() = freelancer_id OR 
        auth.uid() = created_by
    );

CREATE POLICY "Freelancers can create contracts" ON project_contracts
    FOR INSERT WITH CHECK (auth.uid() = freelancer_id);

CREATE POLICY "Contract parties can update contracts" ON project_contracts
    FOR UPDATE USING (
        auth.uid() = client_id OR 
        auth.uid() = freelancer_id
    );

-- RLS Policies for contract_milestones
CREATE POLICY "Users can view milestones for their contracts" ON contract_milestones
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_milestones.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

CREATE POLICY "Freelancers can manage milestones" ON contract_milestones
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_milestones.contract_id 
            AND freelancer_id = auth.uid()
        )
    );

-- RLS Policies for extension_requests
CREATE POLICY "Users can view extension requests for their contracts" ON extension_requests
    FOR SELECT USING (
        auth.uid() = requested_by OR
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = extension_requests.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

CREATE POLICY "Freelancers can create extension requests" ON extension_requests
    FOR INSERT WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Clients can respond to extension requests" ON extension_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = extension_requests.contract_id 
            AND client_id = auth.uid()
        )
    );

-- RLS Policies for dispute_cases
CREATE POLICY "Users can view disputes for their contracts" ON dispute_cases
    FOR SELECT USING (
        auth.uid() = initiated_by OR
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = dispute_cases.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

CREATE POLICY "Contract parties can create disputes" ON dispute_cases
    FOR INSERT WITH CHECK (
        auth.uid() = initiated_by AND
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

-- RLS Policies for fraud_alerts (admin only for modifications)
CREATE POLICY "Users can view fraud alerts for their contracts" ON fraud_alerts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = fraud_alerts.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

-- RLS Policies for contract_events
CREATE POLICY "Users can view events for their contracts" ON contract_events
    FOR SELECT USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_events.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

-- RLS Policies for analytics tables (users can view their own data)
CREATE POLICY "Users can view their completion times" ON contract_completion_times
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_contracts 
            WHERE id = contract_completion_times.contract_id 
            AND (client_id = auth.uid() OR freelancer_id = auth.uid())
        )
    );

CREATE POLICY "Public metrics viewing" ON contract_metrics_daily
    FOR SELECT USING (true);

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_project_contracts_updated_at 
    BEFORE UPDATE ON project_contracts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contract_milestones_updated_at 
    BEFORE UPDATE ON contract_milestones 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_extension_requests_updated_at 
    BEFORE UPDATE ON extension_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dispute_cases_updated_at 
    BEFORE UPDATE ON dispute_cases 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for easier querying
CREATE OR REPLACE VIEW contract_summary AS
SELECT 
    pc.id,
    pc.title,
    pc.status,
    pc.total_amount,
    pc.currency,
    pc.deadline,
    pc.chain,
    pc.created_at,
    u1.email as client_email,
    u2.email as freelancer_email,
    COUNT(cm.id) as milestone_count,
    COUNT(CASE WHEN cm.status = 'completed' THEN 1 END) as completed_milestones,
    COUNT(dr.id) as dispute_count,
    COUNT(er.id) as extension_request_count,
    COUNT(fa.id) as fraud_alert_count
FROM project_contracts pc
LEFT JOIN auth.users u1 ON pc.client_id = u1.id
LEFT JOIN auth.users u2 ON pc.freelancer_id = u2.id
LEFT JOIN contract_milestones cm ON pc.id = cm.contract_id
LEFT JOIN dispute_cases dr ON pc.id = dr.contract_id
LEFT JOIN extension_requests er ON pc.id = er.contract_id
LEFT JOIN fraud_alerts fa ON pc.id = fa.contract_id
GROUP BY pc.id, u1.email, u2.email;

-- Create function to get contract analytics
CREATE OR REPLACE FUNCTION get_contract_analytics(user_id UUID DEFAULT NULL)
RETURNS TABLE (
    total_contracts BIGINT,
    active_contracts BIGINT,
    completed_contracts BIGINT,
    disputed_contracts BIGINT,
    total_value NUMERIC,
    avg_completion_days NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_contracts,
        COUNT(CASE WHEN pc.status = 'active' THEN 1 END)::BIGINT as active_contracts,
        COUNT(CASE WHEN pc.status = 'completed' THEN 1 END)::BIGINT as completed_contracts,
        COUNT(CASE WHEN pc.status = 'disputed' THEN 1 END)::BIGINT as disputed_contracts,
        COALESCE(SUM(pc.total_amount), 0)::NUMERIC as total_value,
        COALESCE(AVG(cct.completion_days::NUMERIC), 0)::NUMERIC as avg_completion_days
    FROM project_contracts pc
    LEFT JOIN contract_completion_times cct ON pc.id = cct.contract_id
    WHERE (user_id IS NULL OR pc.client_id = user_id OR pc.freelancer_id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Insert initial metric entries for tracking
INSERT INTO contract_metrics_daily (date, metric_name, value) VALUES 
    (CURRENT_DATE, 'contracts_created', 0),
    (CURRENT_DATE, 'contracts_completed', 0),
    (CURRENT_DATE, 'disputes_created', 0),
    (CURRENT_DATE, 'extension_requests', 0),
    (CURRENT_DATE, 'fraud_alerts', 0)
ON CONFLICT (date, metric_name) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE project_contracts IS 'Main table for smart contract projects';
COMMENT ON TABLE contract_milestones IS 'Milestones within project contracts';
COMMENT ON TABLE extension_requests IS 'Requests for deadline extensions';
COMMENT ON TABLE dispute_cases IS 'Dispute resolution cases';
COMMENT ON TABLE fraud_alerts IS 'Fraud detection alerts';
COMMENT ON TABLE contract_events IS 'Event tracking for analytics';
COMMENT ON TABLE contract_metrics_daily IS 'Daily aggregated metrics';
COMMENT ON TABLE contract_completion_times IS 'Contract completion time tracking';