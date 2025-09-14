-- Migration: Add due date and reminder tracking fields to payment_links table
-- Description: Adds due_date, reminder_count, and last_reminder_at to payment_links table for automatic reminder scheduling

-- Add due date and reminder tracking fields to payment_links table
ALTER TABLE payment_links 
ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP WITH TIME ZONE;

-- Create payment_link_reminder_logs table
CREATE TABLE IF NOT EXISTS payment_link_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_link_id UUID NOT NULL,
  reminder_type VARCHAR(20) NOT NULL, -- 'before_due', 'on_due', 'after_due', 'manual'
  days_from_due_date INTEGER, -- negative for before, 0 for on due, positive for after
  email_sent_to VARCHAR(255) NOT NULL,
  email_subject TEXT,
  email_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_link_reminder_logs_payment_link_id ON payment_link_reminder_logs(payment_link_id);
CREATE INDEX IF NOT EXISTS idx_payment_link_reminder_logs_sent_at ON payment_link_reminder_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_payment_link_reminder_logs_reminder_type ON payment_link_reminder_logs(reminder_type);
CREATE INDEX IF NOT EXISTS idx_payment_links_due_date ON payment_links(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_links_reminder_count ON payment_links(reminder_count);
CREATE INDEX IF NOT EXISTS idx_payment_links_last_reminder_at ON payment_links(last_reminder_at);

-- Add foreign key constraint
ALTER TABLE payment_link_reminder_logs 
ADD CONSTRAINT fk_payment_link_reminder_logs_payment_link_id 
FOREIGN KEY (payment_link_id) REFERENCES payment_links(id) ON DELETE CASCADE;

-- Add comments for documentation
COMMENT ON TABLE payment_link_reminder_logs IS 'Logs all payment link reminder attempts with details and success status';
COMMENT ON COLUMN payment_link_reminder_logs.reminder_type IS 'Type of reminder: before_due, on_due, after_due, or manual';
COMMENT ON COLUMN payment_link_reminder_logs.days_from_due_date IS 'Days relative to due date: negative=before, 0=on due, positive=after';
COMMENT ON COLUMN payment_links.due_date IS 'Due date for the payment link (optional, for automatic reminders)';
COMMENT ON COLUMN payment_links.reminder_count IS 'Total number of reminders sent for this payment link';
COMMENT ON COLUMN payment_links.last_reminder_at IS 'Timestamp of the last reminder sent for this payment link';