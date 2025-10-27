-- Create project notifications table for tracking all project-related notifications
CREATE TABLE IF NOT EXISTS project_notifications (
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
CREATE INDEX IF NOT EXISTS idx_project_notifications_contract_id ON project_notifications(contract_id);
CREATE INDEX IF NOT EXISTS idx_project_notifications_type ON project_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_project_notifications_created_at ON project_notifications(created_at);

-- Add RLS policies
ALTER TABLE project_notifications ENABLE ROW LEVEL SECURITY;

-- Policy for service role (full access)
CREATE POLICY "Service role can manage project notifications" ON project_notifications
  FOR ALL USING (auth.role() = 'service_role');

-- Policy for authenticated users to view their own notifications
CREATE POLICY "Users can view their project notifications" ON project_notifications
  FOR SELECT USING (
    -- Allow service role to see all notifications
    auth.role() = 'service_role'
    OR
    -- Allow users to see notifications for their contracts
    EXISTS (
      SELECT 1 FROM project_contracts pc 
      WHERE pc.id = contract_id 
      AND (
        (pc.freelancer_id IS NOT NULL AND pc.freelancer_id = auth.uid()) 
        OR 
        (pc.client_email IS NOT NULL AND pc.client_email = auth.email())
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_id 
      AND (
        (c.freelancer_id IS NOT NULL AND c.freelancer_id = auth.uid()) 
        OR 
        (c.client_email IS NOT NULL AND c.client_email = auth.email())
      )
    )
  );

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