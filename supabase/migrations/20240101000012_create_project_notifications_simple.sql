-- Create project notifications table (simplified version)
-- Drop table if it exists to start fresh
DROP TABLE IF EXISTS project_notifications CASCADE;

-- Create project notifications table for tracking all project-related notifications
CREATE TABLE project_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL,
  notification_type VARCHAR(50) NOT NULL, -- 'deadline_reminder', 'deadline_overdue', 'milestone_completed', 'invoice_paid'
  recipient VARCHAR(20) NOT NULL, -- 'freelancer', 'client', 'both'
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_via_email BOOLEAN DEFAULT false,
  sent_via_telegram BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX idx_project_notifications_contract_id ON project_notifications(contract_id);
CREATE INDEX idx_project_notifications_type ON project_notifications(notification_type);
CREATE INDEX idx_project_notifications_created_at ON project_notifications(created_at);

-- Enable RLS
ALTER TABLE project_notifications ENABLE ROW LEVEL SECURITY;

-- Simple policy: service role can do everything
CREATE POLICY "Service role full access" ON project_notifications
  FOR ALL USING (auth.role() = 'service_role');

-- Simple policy: authenticated users can view notifications
CREATE POLICY "Authenticated users can view" ON project_notifications
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_project_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_notifications_updated_at
  BEFORE UPDATE ON project_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_project_notifications_updated_at();