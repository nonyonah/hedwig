-- Migration: Add invoice reminder tracking fields and logs table
-- Description: Adds reminder_count and last_reminder_at to invoices table and creates invoice_reminder_logs table

-- Add reminder tracking fields to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP WITH TIME ZONE;

-- Create invoice_reminder_logs table
CREATE TABLE IF NOT EXISTS invoice_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_invoice_reminder_logs_invoice_id ON invoice_reminder_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminder_logs_sent_at ON invoice_reminder_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_invoice_reminder_logs_reminder_type ON invoice_reminder_logs(reminder_type);
CREATE INDEX IF NOT EXISTS idx_invoices_reminder_count ON invoices(reminder_count);
CREATE INDEX IF NOT EXISTS idx_invoices_last_reminder_at ON invoices(last_reminder_at);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

-- Add foreign key constraint
ALTER TABLE invoice_reminder_logs 
ADD CONSTRAINT fk_invoice_reminder_logs_invoice_id 
FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

-- Add comments for documentation
COMMENT ON TABLE invoice_reminder_logs IS 'Logs all invoice reminder attempts with details and success status';
COMMENT ON COLUMN invoice_reminder_logs.reminder_type IS 'Type of reminder: before_due, on_due, after_due, or manual';
COMMENT ON COLUMN invoice_reminder_logs.days_from_due_date IS 'Days relative to due date: negative=before, 0=on due, positive=after';
COMMENT ON COLUMN invoices.reminder_count IS 'Total number of reminders sent for this invoice';
COMMENT ON COLUMN invoices.last_reminder_at IS 'Timestamp of the last reminder sent for this invoice';