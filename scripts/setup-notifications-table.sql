-- Simple script to create project notifications table
-- Run this directly in your Supabase SQL editor if migrations are having issues

-- Drop table if it exists to start fresh
DROP TABLE IF EXISTS project_notifications CASCADE;

-- Create project notifications table
CREATE TABLE project_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  recipient VARCHAR(20) NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_via_email BOOLEAN DEFAULT false,
  sent_via_telegram BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_project_notifications_contract_id ON project_notifications(contract_id);
CREATE INDEX idx_project_notifications_type ON project_notifications(notification_type);
CREATE INDEX idx_project_notifications_created_at ON project_notifications(created_at);

-- Enable RLS
ALTER TABLE project_notifications ENABLE ROW LEVEL SECURITY;

-- Simple policies
CREATE POLICY "Service role full access" ON project_notifications
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view" ON project_notifications
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Add trigger function
CREATE OR REPLACE FUNCTION update_project_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger
CREATE TRIGGER update_project_notifications_updated_at
  BEFORE UPDATE ON project_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_project_notifications_updated_at();

-- Verify table was created
SELECT 'project_notifications table created successfully' as status;