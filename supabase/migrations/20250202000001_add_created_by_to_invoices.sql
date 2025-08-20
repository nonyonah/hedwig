-- Add created_by column to invoices table
-- This migration adds the missing created_by column that the application expects

ALTER TABLE invoices 
ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Create index for better performance on created_by queries
CREATE INDEX IF NOT EXISTS idx_invoice_created_by ON invoices(created_by);

-- Update existing invoices to have a default created_by value (optional)
-- You may want to set this to a specific user ID or leave it NULL for existing records
-- UPDATE invoices SET created_by = NULL WHERE created_by IS NULL;