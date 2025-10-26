-- Contracts 2.0 Schema Migration
-- This creates the new email-based contract system alongside the existing smart contract system

-- Create contracts table (Contracts 2.0)
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    freelancer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    client_email TEXT NOT NULL,
    client_name TEXT,
    
    -- Contract Details
    title TEXT NOT NULL,
    description TEXT,
    total_amount NUMERIC(20, 6) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USDC', -- USDC, USD, etc.
    allow_part_payments BOOLEAN DEFAULT true,
    deadline DATE NOT NULL,
    
    -- Status Management
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',              -- Contract being created
        'pending_approval',   -- Sent to client for approval
        'approved',          -- Client approved, invoices generated
        'in_progress',       -- Work has started
        'completed',         -- All milestones completed and paid
        'rejected',          -- Client rejected the contract
        'cancelled'          -- Contract cancelled
    )),
    
    -- Email Approval System
    approval_token TEXT UNIQUE, -- Unique token for email approval
    approval_expires_at TIMESTAMPTZ, -- Token expiration
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    
    -- Payment Tracking
    amount_paid NUMERIC(20, 6) DEFAULT 0,
    platform_fee_rate NUMERIC(5, 4) DEFAULT 0.01, -- 1% platform fee
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Integration with existing system
    converted_to_project_contract_id UUID, -- If converted to smart contract (FK added later)
    source_type TEXT CHECK (source_type IN ('manual', 'telegram', 'dashboard')),
    
    CONSTRAINT valid_approval_token CHECK (
        (status = 'pending_approval' AND approval_token IS NOT NULL) OR 
        (status != 'pending_approval')
    )
);

-- Create contract_milestones table (Contracts 2.0)
CREATE TABLE IF NOT EXISTS contract_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
    
    -- Milestone Details
    title TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(20, 6) NOT NULL,
    due_date DATE,
    order_index INTEGER NOT NULL DEFAULT 1,
    
    -- Status and Payment
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',    -- Waiting for payment
        'paid',       -- Payment received
        'overdue'     -- Past due date
    )),
    
    -- Invoice Integration
    invoice_id UUID, -- Links to generated invoice
    payment_transaction_hash TEXT, -- Blockchain transaction hash
    paid_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(contract_id, order_index)
);

-- Create contract_notifications table (Contracts 2.0)
CREATE TABLE IF NOT EXISTS contract_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
    
    -- Notification Details
    recipient TEXT NOT NULL CHECK (recipient IN ('freelancer', 'client')),
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'contract_created',
        'approval_requested',
        'contract_approved',
        'contract_rejected',
        'invoice_generated',
        'payment_received',
        'milestone_completed',
        'contract_completed',
        'deadline_reminder',
        'overdue_notification'
    )),
    
    -- Message Content
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- Delivery Status
    sent_via_email BOOLEAN DEFAULT false,
    sent_via_telegram BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMPTZ,
    telegram_sent_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create contract_invoices table to track generated invoices
CREATE TABLE IF NOT EXISTS contract_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES contract_milestones(id) ON DELETE CASCADE,
    invoice_id UUID, -- References to existing invoices table if needed
    
    -- Invoice Details
    invoice_number TEXT UNIQUE NOT NULL,
    amount NUMERIC(20, 6) NOT NULL,
    currency TEXT NOT NULL,
    
    -- Payment Details
    payment_link_url TEXT,
    payment_address TEXT, -- Crypto wallet address for payment
    payment_chain TEXT, -- blockchain network
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'sent',
        'paid',
        'overdue',
        'cancelled'
    )),
    
    -- Timeline
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    due_date DATE,
    paid_at TIMESTAMPTZ,
    
    -- Payment Tracking
    payment_transaction_hash TEXT,
    payment_amount NUMERIC(20, 6),
    platform_fee_amount NUMERIC(20, 6),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer_id ON contracts(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_client_email ON contracts(client_email);
CREATE INDEX IF NOT EXISTS idx_contracts_approval_token ON contracts(approval_token);
CREATE INDEX IF NOT EXISTS idx_contracts_deadline ON contracts(deadline);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at);

CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract_id ON contract_milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_status ON contract_milestones(status);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_due_date ON contract_milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_order ON contract_milestones(contract_id, order_index);

CREATE INDEX IF NOT EXISTS idx_contract_notifications_contract_id ON contract_notifications(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_type ON contract_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_recipient ON contract_notifications(recipient);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_created_at ON contract_notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_contract_invoices_contract_id ON contract_invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_milestone_id ON contract_invoices(milestone_id);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_status ON contract_invoices(status);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_due_date ON contract_invoices(due_date);

-- Enable Row Level Security (RLS)
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contracts
CREATE POLICY "Freelancers can manage their own contracts" ON contracts
    FOR ALL USING (auth.uid() = freelancer_id);

CREATE POLICY "Clients can view contracts sent to them" ON contracts
    FOR SELECT USING (
        -- Allow access via approval token (for email approval)
        approval_token IS NOT NULL OR
        -- Allow access if user is the freelancer
        auth.uid() = freelancer_id
    );

-- RLS Policies for contract_milestones
CREATE POLICY "Users can view milestones of their contracts" ON contract_milestones
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contracts 
            WHERE id = contract_milestones.contract_id 
            AND freelancer_id = auth.uid()
        )
    );

CREATE POLICY "Freelancers can manage milestones of their contracts" ON contract_milestones
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM contracts 
            WHERE id = contract_milestones.contract_id 
            AND freelancer_id = auth.uid()
        )
    );

-- RLS Policies for contract_notifications
CREATE POLICY "Users can view notifications for their contracts" ON contract_notifications
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contracts 
            WHERE id = contract_notifications.contract_id 
            AND freelancer_id = auth.uid()
        )
    );

-- RLS Policies for contract_invoices
CREATE POLICY "Users can view invoices for their contracts" ON contract_invoices
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contracts 
            WHERE id = contract_invoices.contract_id 
            AND freelancer_id = auth.uid()
        )
    );

CREATE POLICY "Freelancers can manage invoices for their contracts" ON contract_invoices
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM contracts 
            WHERE id = contract_invoices.contract_id 
            AND freelancer_id = auth.uid()
        )
    );

-- Create functions for automation

-- Function to generate approval token
CREATE OR REPLACE FUNCTION generate_approval_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'base64url');
END;
$$ LANGUAGE plpgsql;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
    next_number INTEGER;
    invoice_number TEXT;
BEGIN
    -- Get the next invoice number (simple incrementing)
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-(\d+)') AS INTEGER)), 0) + 1
    INTO next_number
    FROM contract_invoices
    WHERE invoice_number ~ '^INV-\d+$';
    
    invoice_number := 'INV-' || LPAD(next_number::TEXT, 6, '0');
    
    RETURN invoice_number;
END;
$$ LANGUAGE plpgsql;

-- Function to update contract amount_paid when milestone is paid
CREATE OR REPLACE FUNCTION update_contract_amount_paid()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the contract's amount_paid when a milestone is marked as paid
    IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
        UPDATE contracts 
        SET 
            amount_paid = amount_paid + NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.contract_id;
        
        -- Check if all milestones are paid and update contract status
        IF NOT EXISTS (
            SELECT 1 FROM contract_milestones 
            WHERE contract_id = NEW.contract_id 
            AND status != 'paid'
        ) THEN
            UPDATE contracts 
            SET 
                status = 'completed',
                updated_at = NOW()
            WHERE id = NEW.contract_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating contract amount_paid
CREATE TRIGGER trigger_update_contract_amount_paid
    AFTER UPDATE ON contract_milestones
    FOR EACH ROW
    EXECUTE FUNCTION update_contract_amount_paid();

-- Function to set updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER trigger_contracts_updated_at
    BEFORE UPDATE ON contracts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_contract_milestones_updated_at
    BEFORE UPDATE ON contract_milestones
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_contract_invoices_updated_at
    BEFORE UPDATE ON contract_invoices
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Create view for contract summary with milestone information
CREATE OR REPLACE VIEW contract_summary AS
SELECT 
    c.*,
    u.username as freelancer_username,
    u.email as freelancer_email,
    COUNT(cm.id) as total_milestones,
    COUNT(CASE WHEN cm.status = 'paid' THEN 1 END) as paid_milestones,
    COUNT(CASE WHEN cm.status = 'overdue' THEN 1 END) as overdue_milestones,
    COALESCE(SUM(CASE WHEN cm.status = 'paid' THEN cm.amount END), 0) as total_paid,
    COALESCE(SUM(cm.amount), 0) as total_milestone_amount,
    MIN(CASE WHEN cm.status = 'pending' THEN cm.due_date END) as next_due_date
FROM contracts c
LEFT JOIN users u ON c.freelancer_id = u.id
LEFT JOIN contract_milestones cm ON c.id = cm.contract_id
GROUP BY c.id, u.username, u.email;

-- Add foreign key constraint to project_contracts if the table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_contracts') THEN
        ALTER TABLE contracts 
        ADD CONSTRAINT fk_contracts_project_contract_id 
        FOREIGN KEY (converted_to_project_contract_id) 
        REFERENCES project_contracts(id);
    END IF;
END $$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON contracts TO authenticated;
GRANT ALL ON contract_milestones TO authenticated;
GRANT ALL ON contract_notifications TO authenticated;
GRANT ALL ON contract_invoices TO authenticated;
GRANT SELECT ON contract_summary TO authenticated;