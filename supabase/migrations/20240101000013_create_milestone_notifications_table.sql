-- Create milestone_notifications table for tracking milestone due date notifications
CREATE TABLE IF NOT EXISTS milestone_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    milestone_id UUID NOT NULL,
    contract_id UUID NOT NULL,
    notification_type VARCHAR(50) NOT NULL, -- 'due_soon', 'overdue', 'completed', 'approved'
    recipient_type VARCHAR(20) NOT NULL, -- 'freelancer', 'client', 'both'
    freelancer_email VARCHAR(255),
    client_email VARCHAR(255),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_milestone_notifications_milestone_id ON milestone_notifications(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_notifications_contract_id ON milestone_notifications(contract_id);
CREATE INDEX IF NOT EXISTS idx_milestone_notifications_type ON milestone_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_milestone_notifications_sent_at ON milestone_notifications(sent_at);

-- Add RLS policies
ALTER TABLE milestone_notifications ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all notifications
CREATE POLICY "Service role can manage milestone notifications" ON milestone_notifications
    FOR ALL USING (auth.role() = 'service_role');

-- Allow users to view their own notifications
CREATE POLICY "Users can view their milestone notifications" ON milestone_notifications
    FOR SELECT USING (
        freelancer_email = auth.jwt() ->> 'email' OR 
        client_email = auth.jwt() ->> 'email'
    );

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_milestone_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER milestone_notifications_updated_at
    BEFORE UPDATE ON milestone_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_milestone_notifications_updated_at();